-- Preserve trade lots and cash proceeds while updating the quoted position atomically.
ALTER TABLE public.investment_transactions
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS unit_price numeric,
  ADD COLUMN IF NOT EXISTS fees numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_basis numeric,
  ADD COLUMN IF NOT EXISTS realized_gain numeric;
ALTER TABLE public.investment_transactions DROP CONSTRAINT IF EXISTS investment_trade_details_check;
ALTER TABLE public.investment_transactions ADD CONSTRAINT investment_trade_details_check CHECK
  ((type NOT IN ('buy','sale')) OR
   (quantity>0 AND unit_price>0 AND fees>=0 AND cost_basis>=0 AND
    amount>0 AND (type='buy' OR realized_gain IS NOT NULL)));

CREATE OR REPLACE FUNCTION public.record_investment_trade(
 p_investment uuid,p_side text,p_quantity numeric,p_unit_price numeric,p_fees numeric,
 p_date date,p_account uuid,p_description text,p_request uuid,
 p_expected_quantity numeric,p_expected_value numeric)
RETURNS public.investment_transactions
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE i investments; result investment_transactions; uid uuid:=public.current_finance_owner();
  gross numeric; cash_amount numeric; basis numeric; new_quantity numeric; new_value numeric;
  avg_cost numeric; category_id uuid; cash_type text; latest date;
BEGIN
 IF auth.uid() IS NULL OR p_request IS NULL OR p_side NOT IN ('buy','sale')
  OR p_quantity IS NULL OR p_quantity<=0 OR p_unit_price IS NULL OR p_unit_price<=0
  OR p_fees IS NULL OR p_fees<0 OR p_date IS NULL OR p_date>current_date
  OR p_quantity::text IN ('NaN','Infinity','-Infinity')
  OR p_unit_price::text IN ('NaN','Infinity','-Infinity')
  OR p_fees::text IN ('NaN','Infinity','-Infinity') THEN
  RAISE EXCEPTION 'Informe quantidade, preco, custos e data validos';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 SELECT * INTO result FROM public.investment_transactions WHERE user_id=uid AND client_request_id=p_request;
 IF FOUND THEN
  IF result.investment_id<>p_investment OR result.type<>p_side THEN RAISE EXCEPTION 'Solicitacao reutilizada em outra operacao'; END IF;
  RETURN result;
 END IF;
 SELECT * INTO i FROM public.investments WHERE id=p_investment AND user_id=uid FOR UPDATE;
 IF NOT FOUND OR i.quote_mode NOT IN ('stock','treasury') THEN RAISE EXCEPTION 'Selecione uma posicao de acoes ou Tesouro'; END IF;
 IF i.quantity IS NULL OR (p_side='sale' AND i.quantity<=0) OR i.current_value IS DISTINCT FROM p_expected_value
  OR i.quantity IS DISTINCT FROM p_expected_quantity THEN
  RAISE EXCEPTION 'Posicao alterada ou quantidade ausente. Atualize a carteira antes de registrar.';
 END IF;
 IF p_date<i.purchase_date THEN RAISE EXCEPTION 'A operacao nao pode anteceder a compra cadastrada'; END IF;
 SELECT max(date) INTO latest FROM public.investment_valuations WHERE investment_id=i.id;
 IF latest IS NOT NULL AND p_date<latest THEN
  RAISE EXCEPTION 'Existe uma avaliacao posterior a esta data. Corrija o historico antes de registrar.';
 END IF;
 IF i.quote_mode='stock' AND p_quantity<>trunc(p_quantity) THEN RAISE EXCEPTION 'Informe um numero inteiro de acoes'; END IF;
 IF p_side='sale' AND p_quantity>i.quantity THEN RAISE EXCEPTION 'Quantidade vendida maior que a posicao atual'; END IF;
 gross:=round(p_quantity*p_unit_price,2);
 cash_amount:=CASE WHEN p_side='sale' THEN gross-round(p_fees,2) ELSE gross+round(p_fees,2) END;
 IF cash_amount<=0 THEN RAISE EXCEPTION 'Valor liquido invalido'; END IF;
 avg_cost:=coalesce(i.average_price,i.initial_amount/nullif(i.quantity,0),0);
 IF avg_cost IS NULL OR avg_cost<0 THEN RAISE EXCEPTION 'Informe o preco medio de compra antes de vender'; END IF;
 basis:=round(avg_cost*p_quantity,2);
 IF p_account IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_account AND user_id=uid) THEN RAISE EXCEPTION 'Conta invalida'; END IF;
  cash_type:=CASE WHEN p_side='sale' THEN 'income' ELSE 'expense' END;
  SELECT id INTO category_id FROM public.categories WHERE user_id=uid AND name='Movimentacao de investimentos'
   AND type=cash_type ORDER BY created_at LIMIT 1;
  IF category_id IS NULL THEN
   INSERT INTO public.categories(user_id,name,type,spending_area)
   VALUES(uid,'Movimentacao de investimentos',cash_type,'Investimentos') RETURNING id INTO category_id;
  END IF;
  PERFORM public.save_financial_transaction(jsonb_build_object(
   'type',cash_type,'amount',cash_amount,'date',p_date,'account_id',p_account,
   'category_id',category_id,'description',coalesce(nullif(btrim(p_description),''),i.name||' - '||CASE WHEN p_side='sale' THEN 'venda' ELSE 'compra' END),
   'client_request_id',p_request));
 END IF;
 new_quantity:=CASE WHEN p_side='sale' THEN i.quantity-p_quantity ELSE i.quantity+p_quantity END;
 new_value:=CASE WHEN p_side='sale' THEN
   CASE WHEN new_quantity=0 THEN 0 ELSE round(i.current_value*new_quantity/i.quantity,2) END
   ELSE round(i.current_value+gross,2) END;
 INSERT INTO public.investment_transactions(user_id,investment_id,account_id,type,amount,date,description,
  client_request_id,quantity,unit_price,fees,cost_basis,realized_gain)
 VALUES(uid,i.id,p_account,p_side,cash_amount,p_date,nullif(btrim(p_description),''),p_request,
  p_quantity,p_unit_price,round(p_fees,2),CASE WHEN p_side='sale' THEN basis ELSE cash_amount END,
  CASE WHEN p_side='sale' THEN cash_amount-basis ELSE NULL END) RETURNING * INTO result;
 UPDATE public.investments SET quantity=new_quantity,current_value=new_value,
  average_price=CASE WHEN p_side='sale' THEN avg_cost
   ELSE (i.quantity*avg_cost+cash_amount)/new_quantity END,updated_at=now()
  WHERE id=i.id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.record_investment_trade(uuid,text,numeric,numeric,numeric,date,uuid,text,uuid,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_investment_trade(uuid,text,numeric,numeric,numeric,date,uuid,text,uuid,numeric,numeric) TO authenticated;

-- A cash deletion must never leave the quantity unchanged after removing a trade.
CREATE OR REPLACE FUNCTION public.guard_investment_trade_cash_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.investment_transactions t
  WHERE t.user_id=OLD.user_id AND t.client_request_id=OLD.client_request_id AND t.type IN ('buy','sale')) THEN
  RAISE EXCEPTION 'Compra ou venda vinculada: registre uma operacao de ajuste na carteira.';
 END IF;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS investment_trade_cash_delete_guard ON public.transactions;
CREATE TRIGGER investment_trade_cash_delete_guard BEFORE DELETE ON public.transactions
 FOR EACH ROW EXECUTE FUNCTION public.guard_investment_trade_cash_delete();

-- Older app versions must not change the reais balance without changing quoted units.
CREATE OR REPLACE FUNCTION public.guard_quoted_investment_movement() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.type IN ('contribution','withdrawal') AND EXISTS(
  SELECT 1 FROM public.investments i WHERE i.id=NEW.investment_id
   AND i.user_id=NEW.user_id AND i.quote_mode IN ('stock','treasury')) THEN
  RAISE EXCEPTION 'Atualize o aplicativo e use Comprar ou Vender para registrar quantidade e valor.';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS quoted_investment_movement_guard ON public.investment_transactions;
CREATE TRIGGER quoted_investment_movement_guard BEFORE INSERT ON public.investment_transactions
 FOR EACH ROW EXECUTE FUNCTION public.guard_quoted_investment_movement();

NOTIFY pgrst,'reload schema';

-- Closed positions remain in the portfolio history but need no new quote.
CREATE OR REPLACE FUNCTION public.refresh_market_investments() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE i investments; quote jsonb; price numeric; quote_time timestamptz; quote_date date;
  last_date date; updated integer:=0; failures jsonb:='[]'::jsonb;
  treasury_date date; treasury_price numeric; treasury_error text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre novamente'; END IF;
 FOR i IN SELECT * FROM investments WHERE user_id=current_finance_owner() AND quote_mode='stock' AND quantity IS DISTINCT FROM 0 LOOP
  BEGIN
   IF i.quantity IS NULL OR i.quantity<0 THEN failures:=failures||jsonb_build_array(jsonb_build_object('name',i.name,'reason','Informe a quantidade de papeis'));CONTINUE; END IF;
   quote:=get_investment_market(i.id,'1mo');
   price:=(quote#>>'{meta,regularMarketPrice}')::numeric;
   quote_time:=to_timestamp((quote#>>'{meta,regularMarketTime}')::numeric);
   quote_date:=(quote_time AT TIME ZONE 'America/Sao_Paulo')::date;
   SELECT max(date) INTO last_date FROM investment_valuations WHERE investment_id=i.id;
   IF quote_time>now()+interval '5 minutes' OR quote_time<now()-interval '7 days'
    OR quote_date<coalesce(last_date,i.purchase_date) THEN
    failures:=failures||jsonb_build_array(jsonb_build_object('name',i.name,'reason','Cotacao desatualizada; saldo preservado'));CONTINUE;
   END IF;
   PERFORM record_investment_valuation(i.id,quote_date,round(price*i.quantity,2),i.current_value,price,i.quantity,quote_time);
   updated:=updated+1;
  EXCEPTION WHEN OTHERS THEN failures:=failures||jsonb_build_array(jsonb_build_object('name',i.name,'reason','Cotacao indisponivel; saldo preservado'));
  END;
 END LOOP;
 IF EXISTS(SELECT 1 FROM investments WHERE user_id=current_finance_owner() AND quote_mode='treasury' AND quantity>0 AND maturity_date IS NOT NULL) THEN
  BEGIN PERFORM refresh_treasury_quote_cache();
  EXCEPTION WHEN OTHERS THEN treasury_error:='Fonte oficial indisponivel; saldo preservado'; END;
 END IF;
 FOR i IN SELECT * FROM investments WHERE user_id=current_finance_owner() AND quote_mode='treasury' AND quantity IS DISTINCT FROM 0 LOOP
  BEGIN
   IF i.quantity IS NULL OR i.quantity<0 OR i.maturity_date IS NULL OR i.treasury_title IS NULL THEN
    failures:=failures||jsonb_build_array(jsonb_build_object('name',i.name,'reason','Informe titulo, vencimento e quantidade'));CONTINUE;
   END IF;
   IF treasury_error IS NOT NULL THEN failures:=failures||jsonb_build_array(jsonb_build_object('name',i.name,'reason',treasury_error));CONTINUE; END IF;
   SELECT q.quote_date,q.base_price INTO treasury_date,treasury_price FROM public.treasury_quote_cache q
    WHERE q.title=i.treasury_title AND q.maturity_date=i.maturity_date ORDER BY q.quote_date DESC LIMIT 1;
   SELECT max(date) INTO last_date FROM investment_valuations WHERE investment_id=i.id;
   IF treasury_date IS NULL OR treasury_date<current_date-7 OR treasury_date<coalesce(last_date,i.purchase_date) THEN
    failures:=failures||jsonb_build_array(jsonb_build_object('name',i.name,'reason','Sem preco recente para este titulo e vencimento'));CONTINUE;
   END IF;
   PERFORM record_investment_valuation(i.id,treasury_date,round(treasury_price*i.quantity,2),i.current_value,treasury_price,i.quantity,treasury_date::timestamptz);
   updated:=updated+1;
  EXCEPTION WHEN OTHERS THEN failures:=failures||jsonb_build_array(jsonb_build_object('name',i.name,'reason','Confira data da compra, titulo e quantidade; saldo preservado'));
  END;
 END LOOP;
 RETURN jsonb_build_object('updated',updated,'failures',failures);
END $$;
