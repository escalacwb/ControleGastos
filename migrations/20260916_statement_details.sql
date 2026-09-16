-- Statement items never move cash. Only payment transactions change account balances.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS billing_cycle_id uuid REFERENCES public.billing_cycles(id);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS statement_item_key text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS statement_parcel text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS statement_holder text;
CREATE UNIQUE INDEX IF NOT EXISTS statement_item_unique ON public.transactions(user_id,billing_cycle_id,statement_item_key) WHERE statement_item_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.statement_documents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),
 billing_cycle_id uuid NOT NULL REFERENCES public.billing_cycles(id),name text NOT NULL,
 sha256 text NOT NULL,mime text NOT NULL,content_base64 text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,billing_cycle_id,sha256)
);
CREATE TABLE IF NOT EXISTS public.statement_requests(
 user_id uuid NOT NULL REFERENCES auth.users(id),request_id uuid NOT NULL,result jsonb NOT NULL,
 PRIMARY KEY(user_id,request_id)
);
ALTER TABLE public.statement_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statement_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_access ON public.statement_documents;
CREATE POLICY workspace_access ON public.statement_documents TO authenticated USING(user_id=public.current_finance_owner()) WITH CHECK(user_id=public.current_finance_owner());
DROP POLICY IF EXISTS workspace_access ON public.statement_requests;
CREATE POLICY workspace_access ON public.statement_requests TO authenticated USING(user_id=public.current_finance_owner()) WITH CHECK(user_id=public.current_finance_owner());
GRANT SELECT,INSERT ON public.statement_documents,public.statement_requests TO authenticated;
REVOKE ALL ON public.statement_documents,public.statement_requests FROM anon;

CREATE OR REPLACE FUNCTION public.save_statement_bundle(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=public.current_finance_owner(); req uuid:=(p_data->>'request_id')::uuid;
 c billing_cycles; card credit_cards; item jsonb; doc jsonb:=p_data->'document';
 category uuid; amount numeric; inserted integer:=0; skipped integer:=0; affected integer;
 result jsonb; existing transactions; paid transactions; k text;
BEGIN
 IF u IS NULL OR req IS NULL THEN RAISE EXCEPTION 'Entre novamente para salvar a fatura.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,0));
 SELECT r.result INTO result FROM statement_requests r WHERE user_id=u AND request_id=req;
 IF FOUND THEN RETURN result; END IF;
 SELECT * INTO card FROM credit_cards WHERE id=(p_data->>'card_id')::uuid AND user_id=u;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cartao invalido'; END IF;
 IF coalesce(jsonb_array_length(p_data->'items'),0)>1000 THEN RAISE EXCEPTION 'Limite de 1000 itens'; END IF;
 IF nullif(p_data->>'cycle_id','') IS NOT NULL THEN
   SELECT * INTO c FROM billing_cycles WHERE id=(p_data->>'cycle_id')::uuid AND credit_card_id=card.id AND user_id=u FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Fatura nao encontrada'; END IF;
   IF round((p_data->>'total')::numeric,2)<>c.total_spent THEN RAISE EXCEPTION 'O total mudou. Reabra a fatura.'; END IF;
 ELSE
   SELECT * INTO c FROM save_card_statement(card.id,(p_data->>'month')::date,(p_data->>'due')::date,(p_data->>'total')::numeric);
 END IF;
 IF doc IS NOT NULL AND doc<>'null'::jsonb AND EXISTS(SELECT 1 FROM statement_documents WHERE billing_cycle_id=c.id AND user_id=u AND sha256<>doc->>'sha256') THEN
   RAISE EXCEPTION 'Esta fatura ja tem um arquivo importado. Use o mesmo arquivo para reimportar ou ajuste as categorias em Lancamentos. Outro arquivo pode duplicar as compras.';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_data->'items','[]'::jsonb)) LOOP
   amount:=round((item->>'amount')::numeric,2);category:=nullif(item->>'category_id','')::uuid;k:=item->>'key';
   IF amount IS NULL OR amount=0 OR amount::text IN ('NaN','Infinity','-Infinity') OR length(coalesce(k,'')) NOT BETWEEN 1 AND 1500 OR length(btrim(coalesce(item->>'description',''))) NOT BETWEEN 1 AND 500 OR (item->>'date')::date IS NULL THEN RAISE EXCEPTION 'Item da fatura invalido'; END IF;
   IF category IS NOT NULL AND NOT EXISTS(SELECT 1 FROM categories WHERE id=category AND user_id=u AND type='expense') THEN RAISE EXCEPTION 'Categoria invalida'; END IF;
   IF category IS NULL THEN
     SELECT id INTO category FROM categories WHERE user_id=u AND type='expense' AND name IN ('EXTRAS','Outros gastos') ORDER BY name LIMIT 1;
     IF category IS NULL THEN INSERT INTO categories(user_id,name,type) VALUES(u,'Outros gastos','expense') RETURNING id INTO category; END IF;
   END IF;
   INSERT INTO transactions(user_id,type,amount,description,date,account_id,category_id,credit_card_id,billing_cycle_id,statement_item_key,statement_parcel,statement_holder)
   VALUES(u,CASE WHEN amount<0 THEN 'income' ELSE 'expense' END,abs(amount),btrim(item->>'description'),(item->>'date')::date,card.account_id,category,card.id,c.id,k,nullif(item->>'parcel',''),nullif(item->>'holder',''))
   ON CONFLICT(user_id,billing_cycle_id,statement_item_key) WHERE statement_item_key IS NOT NULL DO NOTHING;
   GET DIAGNOSTICS affected=ROW_COUNT;inserted:=inserted+affected;skipped:=skipped+1-affected;
 END LOOP;
 IF doc IS NOT NULL AND doc<>'null'::jsonb THEN
   IF length(coalesce(doc->>'content_base64','')) NOT BETWEEN 1 AND 7000000 OR (doc->>'sha256') !~ '^[a-f0-9]{64}$' OR (doc->>'mime') NOT IN ('text/csv','application/pdf') OR length(coalesce(doc->>'name','')) NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION 'Anexo invalido ou maior que 5 MB'; END IF;
   INSERT INTO statement_documents(user_id,billing_cycle_id,name,sha256,mime,content_base64) VALUES(u,c.id,doc->>'name',doc->>'sha256',doc->>'mime',doc->>'content_base64') ON CONFLICT(user_id,billing_cycle_id,sha256) DO NOTHING;
 END IF;
 IF nullif(p_data->>'existing_payment_id','') IS NOT NULL THEN
   SELECT * INTO existing FROM transactions WHERE id=(p_data->>'existing_payment_id')::uuid AND user_id=u FOR UPDATE;
   IF NOT FOUND OR existing.credit_card_id IS NOT NULL OR existing.type NOT IN ('expense','despesa') OR EXISTS(SELECT 1 FROM card_payments WHERE transaction_id=existing.id) OR existing.amount>c.total_spent-coalesce(c.total_paid,0) THEN RAISE EXCEPTION 'Pagamento existente invalido, ja vinculado ou maior que o saldo da fatura'; END IF;
   SELECT id INTO category FROM categories WHERE user_id=u AND name='Pagamento de Fatura' AND type='expense' LIMIT 1;
   IF category IS NULL THEN INSERT INTO categories(user_id,name,type) VALUES(u,'Pagamento de Fatura','expense') RETURNING id INTO category; END IF;
   UPDATE transactions SET category_id=category,updated_at=clock_timestamp() WHERE id=existing.id;
   INSERT INTO card_payments(user_id,credit_card_id,billing_cycle_id,account_id,amount,payment_date,transaction_id,status,payment_method) VALUES(u,card.id,c.id,existing.account_id,existing.amount,existing.date,existing.id,'paid','transferencia_bancaria');
   UPDATE billing_cycles SET total_paid=coalesce(total_paid,0)+existing.amount,status=CASE WHEN coalesce(total_paid,0)+existing.amount>=total_spent THEN 'paid' ELSE 'partial_payment' END,updated_at=now() WHERE id=c.id;
 ELSIF coalesce((p_data->>'pay_amount')::numeric,0)>0 THEN
   SELECT * INTO paid FROM pay_card_statement(c.id,(p_data->>'pay_account')::uuid,(p_data->>'pay_amount')::numeric,(p_data->>'pay_date')::date,req);
 END IF;
 result:=jsonb_build_object('cycle_id',c.id,'inserted',inserted,'skipped',skipped);
 INSERT INTO statement_requests VALUES(u,req,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_statement_bundle(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_statement_bundle(jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.categorize_statement_item(p_id uuid,p_category uuid,p_expected timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=public.current_finance_owner();
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,0));
 IF NOT EXISTS(SELECT 1 FROM categories WHERE id=p_category AND user_id=u AND type='expense') THEN RAISE EXCEPTION 'Categoria invalida'; END IF;
 UPDATE transactions SET category_id=p_category,updated_at=clock_timestamp() WHERE id=p_id AND user_id=u AND billing_cycle_id IS NOT NULL AND updated_at=p_expected;
 IF NOT FOUND THEN RAISE EXCEPTION 'Item alterado. Atualize a tela.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.categorize_statement_item(uuid,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.categorize_statement_item(uuid,uuid,timestamptz) TO authenticated;
NOTIFY pgrst,'reload schema';
