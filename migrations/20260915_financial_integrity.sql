-- Additive migration. Existing balances and financial records are preserved.
-- Apply inside a transaction after a verified backup.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS client_request_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS spending_area text;
ALTER TABLE public.investment_transactions ADD COLUMN IF NOT EXISTS client_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS investment_movements_request_uidx ON public.investment_transactions(user_id,client_request_id) WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_request_uidx ON public.transactions(user_id,client_request_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_user_date_idx ON public.transactions(user_id,date DESC,id);
CREATE INDEX IF NOT EXISTS transactions_account_idx ON public.transactions(account_id);
CREATE INDEX IF NOT EXISTS transactions_destination_idx ON public.transactions(transfer_to_account_id);
CREATE INDEX IF NOT EXISTS billing_cycles_user_card_idx ON public.billing_cycles(user_id,credit_card_id,due_date);
CREATE INDEX IF NOT EXISTS installments_user_date_idx ON public.installments(user_id,installment_date);
CREATE INDEX IF NOT EXISTS pending_telegram_idx ON public.pending_transactions(telegram_user_id,status);
CREATE INDEX IF NOT EXISTS telegram_users_owner_idx ON public.telegram_users(user_id);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS telegram_owner_read ON public.telegram_users;
CREATE POLICY telegram_owner_read ON public.telegram_users FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS pending_owner ON public.pending_transactions;
CREATE POLICY pending_owner ON public.pending_transactions FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.telegram_users u WHERE u.telegram_id=pending_transactions.telegram_user_id AND u.user_id=(SELECT auth.uid())))
 WITH CHECK(EXISTS(SELECT 1 FROM public.telegram_users u WHERE u.telegram_id=pending_transactions.telegram_user_id AND u.user_id=(SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.save_financial_transaction(p_data jsonb,p_id uuid DEFAULT NULL,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS public.transactions LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_old public.transactions; v_new public.transactions; v_uid uuid:=auth.uid(); v_delta record;
 v_request uuid:=nullif(p_data->>'client_request_id','')::uuid;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticacao necessaria'; END IF;
 -- Serialize this user's writes, including idempotency checks and balance updates.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text,0));
 IF p_id IS NULL AND v_request IS NOT NULL THEN
   SELECT * INTO v_new FROM transactions WHERE user_id=v_uid AND client_request_id=v_request;
   IF FOUND THEN RETURN v_new; END IF;
 END IF;
 IF p_id IS NOT NULL THEN
   SELECT * INTO v_old FROM transactions WHERE id=p_id AND user_id=v_uid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Lancamento nao encontrado'; END IF;
   IF p_expected_updated_at IS NULL OR v_old.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'Este lancamento foi alterado. Atualize a tela antes de editar.'; END IF;
   IF EXISTS(SELECT 1 FROM card_payments WHERE transaction_id=p_id) THEN RAISE EXCEPTION 'Pagamento de fatura: estorne o pagamento antes de alterar.'; END IF;
   IF EXISTS(SELECT 1 FROM installments WHERE transaction_id=p_id) THEN RAISE EXCEPTION 'Compra parcelada: exclua o conjunto e cadastre novamente.'; END IF;
   IF EXISTS(SELECT 1 FROM investment_transactions WHERE user_id=v_uid AND client_request_id=v_old.client_request_id) THEN RAISE EXCEPTION 'Movimentacao de investimento: exclua para estornar e registre novamente.'; END IF;
 END IF;
 v_new.user_id:=v_uid; v_new.type:=p_data->>'type'; v_new.amount:=round((p_data->>'amount')::numeric,2);
 v_new.description:=btrim(p_data->>'description'); v_new.date:=(p_data->>'date')::date;
 v_new.account_id:=nullif(p_data->>'account_id','')::uuid;
 v_new.category_id:=nullif(p_data->>'category_id','')::uuid;
 v_new.credit_card_id:=nullif(p_data->>'credit_card_id','')::uuid;
 v_new.transfer_to_account_id:=nullif(p_data->>'transfer_to_account_id','')::uuid;
 IF v_new.type IS NULL OR v_new.type NOT IN ('income','expense','transfer') OR v_new.amount IS NULL OR v_new.amount<=0 OR v_new.amount::text IN ('NaN','Infinity','-Infinity') OR v_new.date IS NULL OR coalesce(v_new.description,'')='' THEN RAISE EXCEPTION 'Preencha tipo, valor positivo, descricao e data.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM accounts WHERE id=v_new.account_id AND user_id=v_uid) THEN RAISE EXCEPTION 'Conta invalida'; END IF;
 IF v_new.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM categories WHERE id=v_new.category_id AND user_id=v_uid AND CASE type WHEN 'despesa' THEN 'expense' WHEN 'receita' THEN 'income' ELSE type END=v_new.type) THEN RAISE EXCEPTION 'Categoria invalida para este tipo'; END IF;
 IF v_new.credit_card_id IS NOT NULL THEN
   IF v_new.type<>'expense' OR NOT EXISTS(SELECT 1 FROM credit_cards WHERE id=v_new.credit_card_id AND user_id=v_uid AND account_id=v_new.account_id AND is_active) THEN RAISE EXCEPTION 'Cartao invalido'; END IF;
 END IF;
 IF v_new.type='transfer' THEN
   v_new.category_id:=NULL; v_new.credit_card_id:=NULL;
   IF v_new.transfer_to_account_id=v_new.account_id OR NOT EXISTS(SELECT 1 FROM accounts WHERE id=v_new.transfer_to_account_id AND user_id=v_uid) THEN RAISE EXCEPTION 'Escolha uma conta de destino diferente'; END IF;
 ELSE v_new.transfer_to_account_id:=NULL; END IF;
 IF p_id IS NULL THEN
   INSERT INTO transactions(user_id,type,amount,description,date,account_id,category_id,credit_card_id,transfer_to_account_id,client_request_id)
   VALUES(v_uid,v_new.type,v_new.amount,v_new.description,v_new.date,v_new.account_id,v_new.category_id,v_new.credit_card_id,v_new.transfer_to_account_id,v_request) RETURNING * INTO v_new;
 ELSE
   UPDATE transactions SET type=v_new.type,amount=v_new.amount,description=v_new.description,date=v_new.date,account_id=v_new.account_id,category_id=v_new.category_id,credit_card_id=v_new.credit_card_id,transfer_to_account_id=v_new.transfer_to_account_id,updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO v_new;
 END IF;
 -- Reverse the prior effect and apply the new one in one transaction. Card purchases do not debit cash.
 FOR v_delta IN SELECT id,sum(delta) AS delta FROM (VALUES
   (v_old.account_id,CASE WHEN v_old.credit_card_id IS NOT NULL THEN 0 WHEN v_old.type IN ('income','receita') THEN -v_old.amount ELSE v_old.amount END),
   (v_old.transfer_to_account_id,CASE WHEN v_old.type IN ('transfer','transferencia') THEN -v_old.amount ELSE 0 END),
   (v_new.account_id,CASE WHEN v_new.credit_card_id IS NOT NULL THEN 0 WHEN v_new.type='income' THEN v_new.amount ELSE -v_new.amount END),
   (v_new.transfer_to_account_id,CASE WHEN v_new.type='transfer' THEN v_new.amount ELSE 0 END)
 ) AS d(id,delta) WHERE id IS NOT NULL GROUP BY id ORDER BY id LOOP
   UPDATE accounts SET balance=coalesce(balance,0)+v_delta.delta WHERE id=v_delta.id AND user_id=v_uid;
 END LOOP;
 RETURN v_new;
END $$;

CREATE OR REPLACE FUNCTION public.delete_financial_transaction(p_id uuid,p_expected_updated_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_old transactions; v_payment card_payments; v_movement investment_transactions; v_uid uuid:=auth.uid();
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticacao necessaria'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text,0));
 SELECT * INTO v_old FROM transactions WHERE id=p_id AND user_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lancamento nao encontrado'; END IF;
 IF p_expected_updated_at IS NULL OR v_old.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'Lancamento alterado. Atualize a tela.'; END IF;
 SELECT * INTO v_movement FROM investment_transactions WHERE user_id=v_uid AND client_request_id=v_old.client_request_id FOR UPDATE;
 IF FOUND THEN
   IF v_movement.type='contribution' AND EXISTS(SELECT 1 FROM investments WHERE id=v_movement.investment_id AND current_value<v_movement.amount) THEN RAISE EXCEPTION 'Estorne os resgates vinculados antes deste aporte.'; END IF;
   UPDATE investments SET current_value=current_value+CASE WHEN v_movement.type='contribution' THEN -v_movement.amount WHEN v_movement.type='withdrawal' THEN v_movement.amount ELSE 0 END,updated_at=now() WHERE id=v_movement.investment_id AND user_id=v_uid;
   DELETE FROM investment_transactions WHERE id=v_movement.id AND user_id=v_uid;
 END IF;
 SELECT * INTO v_payment FROM card_payments WHERE transaction_id=p_id AND user_id=v_uid FOR UPDATE;
 IF FOUND THEN
   UPDATE billing_cycles SET total_paid=greatest(0,coalesce(total_paid,0)-v_payment.amount),status=CASE WHEN coalesce(total_paid,0)-v_payment.amount<=0 THEN 'open' ELSE 'partial_payment' END,updated_at=now() WHERE id=v_payment.billing_cycle_id AND user_id=v_uid;
 END IF;
 IF v_old.credit_card_id IS NULL THEN
   UPDATE accounts SET balance=coalesce(balance,0)+CASE WHEN v_old.type IN ('income','receita') THEN -v_old.amount ELSE v_old.amount END WHERE id=v_old.account_id AND user_id=v_uid;
   IF v_old.type IN ('transfer','transferencia') THEN UPDATE accounts SET balance=coalesce(balance,0)-v_old.amount WHERE id=v_old.transfer_to_account_id AND user_id=v_uid; END IF;
 END IF;
 DELETE FROM transactions WHERE id=p_id AND user_id=v_uid;
END $$;

CREATE OR REPLACE FUNCTION public.save_card_statement(p_card uuid,p_month date,p_due date,p_total numeric)
RETURNS billing_cycles LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_cycle billing_cycles; v_uid uuid:=auth.uid(); v_start date:=date_trunc('month',p_month)::date; v_end date:=(date_trunc('month',p_month)+interval '1 month - 1 day')::date;
BEGIN
 IF v_uid IS NULL OR NOT EXISTS(SELECT 1 FROM credit_cards WHERE id=p_card AND user_id=v_uid) THEN RAISE EXCEPTION 'Cartao invalido'; END IF;
 IF p_total IS NULL OR p_total<=0 OR p_total::text IN ('NaN','Infinity','-Infinity') OR p_due IS NULL OR p_month IS NULL THEN RAISE EXCEPTION 'Preencha mes, vencimento e total positivo'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text,0));
 SELECT * INTO v_cycle FROM billing_cycles WHERE credit_card_id=p_card AND user_id=v_uid AND cycle_start_date=v_start AND cycle_end_date=v_end ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF FOUND THEN
   IF p_total<coalesce(v_cycle.total_paid,0) THEN RAISE EXCEPTION 'Total menor que o valor ja pago'; END IF;
   UPDATE billing_cycles SET total_spent=round(p_total,2),due_date=p_due,status=CASE WHEN total_paid>=p_total THEN 'paid' WHEN total_paid>0 THEN 'partial_payment' ELSE 'open' END,updated_at=now() WHERE id=v_cycle.id RETURNING * INTO v_cycle;
 ELSE
   INSERT INTO billing_cycles(user_id,credit_card_id,cycle_start_date,cycle_end_date,closing_date,due_date,total_spent,total_paid,status)
   VALUES(v_uid,p_card,v_start,v_end,v_end,p_due,round(p_total,2),0,'open') RETURNING * INTO v_cycle;
 END IF;
 RETURN v_cycle;
END $$;

CREATE OR REPLACE FUNCTION public.pay_card_statement(p_cycle uuid,p_account uuid,p_amount numeric,p_date date,p_request uuid)
RETURNS transactions LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_cycle billing_cycles; v_card credit_cards; v_category uuid; v_transaction transactions; v_uid uuid:=auth.uid();
BEGIN
 IF v_uid IS NULL OR p_request IS NULL THEN RAISE EXCEPTION 'Autenticacao e identificador necessarios'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text,0));
 SELECT * INTO v_transaction FROM transactions WHERE user_id=v_uid AND client_request_id=p_request;
 IF FOUND THEN RETURN v_transaction; END IF;
 SELECT * INTO v_cycle FROM billing_cycles WHERE id=p_cycle AND user_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fatura nao encontrada'; END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount>coalesce(v_cycle.total_spent,0)-coalesce(v_cycle.total_paid,0) THEN RAISE EXCEPTION 'Informe um valor ate o saldo da fatura'; END IF;
 SELECT * INTO v_card FROM credit_cards WHERE id=v_cycle.credit_card_id AND user_id=v_uid;
 SELECT id INTO v_category FROM categories WHERE user_id=v_uid AND name='Pagamento de Fatura' AND type='expense' ORDER BY created_at LIMIT 1;
 IF v_category IS NULL THEN INSERT INTO categories(user_id,name,type,color) VALUES(v_uid,'Pagamento de Fatura','expense','#6979b9') RETURNING id INTO v_category; END IF;
 SELECT * INTO v_transaction FROM save_financial_transaction(jsonb_build_object('type','expense','amount',p_amount,'date',p_date,'account_id',p_account,'category_id',v_category,'description','Pagamento da fatura de '||v_card.bank_name,'client_request_id',p_request));
 INSERT INTO card_payments(user_id,credit_card_id,billing_cycle_id,account_id,amount,payment_date,payment_method,description,status,transaction_id)
 VALUES(v_uid,v_card.id,p_cycle,p_account,p_amount,p_date,'transferencia_bancaria',v_transaction.description,'paid',v_transaction.id);
 UPDATE billing_cycles SET total_paid=coalesce(total_paid,0)+p_amount,status=CASE WHEN coalesce(total_paid,0)+p_amount>=total_spent THEN 'paid' ELSE 'partial_payment' END,updated_at=now() WHERE id=p_cycle;
 RETURN v_transaction;
END $$;

CREATE OR REPLACE FUNCTION public.approve_pending_transaction(p_pending uuid,p_data jsonb)
RETURNS transactions LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_pending pending_transactions; v_transaction transactions;
BEGIN
 SELECT * INTO v_pending FROM pending_transactions WHERE id=p_pending FOR UPDATE;
 IF NOT FOUND OR v_pending.status<>'pending_review' THEN RAISE EXCEPTION 'Pendencia indisponivel ou ja processada'; END IF;
 SELECT * INTO v_transaction FROM save_financial_transaction(p_data||jsonb_build_object('client_request_id',p_pending));
 UPDATE pending_transactions SET status='approved',updated_at=now() WHERE id=p_pending;
 RETURN v_transaction;
END $$;

-- The browser must never call these anonymously. Invoker functions retain RLS.
REVOKE ALL ON FUNCTION public.save_financial_transaction(jsonb,uuid,timestamptz),public.delete_financial_transaction(uuid,timestamptz),public.save_card_statement(uuid,date,date,numeric),public.pay_card_statement(uuid,uuid,numeric,date,uuid),public.approve_pending_transaction(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_financial_transaction(jsonb,uuid,timestamptz),public.delete_financial_transaction(uuid,timestamptz),public.save_card_statement(uuid,date,date,numeric),public.pay_card_statement(uuid,uuid,numeric,date,uuid),public.approve_pending_transaction(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';

CREATE OR REPLACE FUNCTION public.save_financial_account(p_id uuid,p_name text,p_type text,p_balance numeric,p_expected_balance numeric DEFAULT NULL)
RETURNS accounts LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_account accounts; v_uid uuid:=auth.uid();
BEGIN
 IF v_uid IS NULL OR coalesce(btrim(p_name),'')='' OR coalesce(btrim(p_type),'')='' OR p_balance IS NULL OR p_balance::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Preencha nome, tipo e saldo valido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text,0));
 IF p_id IS NULL THEN INSERT INTO accounts(user_id,name,type,balance) VALUES(v_uid,btrim(p_name),p_type,round(p_balance,2)) RETURNING * INTO v_account;
 ELSE
  SELECT * INTO v_account FROM accounts WHERE id=p_id AND user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta nao encontrada'; END IF;
  IF p_expected_balance IS NULL OR coalesce(v_account.balance,0)<>p_expected_balance THEN RAISE EXCEPTION 'O saldo mudou. Atualize a tela antes de ajustar.'; END IF;
  UPDATE accounts SET name=btrim(p_name),type=p_type,balance=round(p_balance,2) WHERE id=p_id RETURNING * INTO v_account;
 END IF;
 RETURN v_account;
END $$;

CREATE OR REPLACE FUNCTION public.save_installment_purchase(p_data jsonb,p_count integer)
RETURNS transactions LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_transaction transactions; v_cents bigint; v_amount numeric; i integer;
BEGIN
 IF p_count IS NULL OR p_count<2 OR p_count>60 OR nullif(p_data->>'credit_card_id','') IS NULL OR p_data->>'type'<>'expense' THEN RAISE EXCEPTION 'Compra parcelada invalida'; END IF;
 SELECT * INTO v_transaction FROM save_financial_transaction(p_data);
 IF EXISTS(SELECT 1 FROM installments WHERE transaction_id=v_transaction.id) THEN RETURN v_transaction; END IF;
 v_cents:=round(v_transaction.amount*100);
 IF v_cents<p_count THEN RAISE EXCEPTION 'Valor insuficiente para o numero de parcelas'; END IF;
 FOR i IN 1..p_count LOOP
  v_amount:=(v_cents/p_count+CASE WHEN i<=v_cents%p_count THEN 1 ELSE 0 END)::numeric/100;
  INSERT INTO installments(user_id,credit_card_id,transaction_id,total_installments,current_installment,total_amount,installment_amount,installment_date,status)
  VALUES(auth.uid(),v_transaction.credit_card_id,v_transaction.id,p_count,i,v_transaction.amount,v_amount,(v_transaction.date+make_interval(months=>i-1))::date,'scheduled');
 END LOOP;
 RETURN v_transaction;
END $$;

CREATE OR REPLACE FUNCTION public.import_financial_transactions(p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_row jsonb; v_count integer:=0;
BEGIN
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>500 OR jsonb_array_length(p_rows)=0 THEN RAISE EXCEPTION 'Importe entre 1 e 500 linhas'; END IF;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF nullif(v_row->>'client_request_id','') IS NULL THEN RAISE EXCEPTION 'Identificador da linha necessario'; END IF;
  PERFORM save_financial_transaction(v_row);v_count:=v_count+1;
 END LOOP;
 RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.record_investment_movement(p_investment uuid,p_type text,p_amount numeric,p_date date,p_account uuid,p_description text,p_request uuid)
RETURNS investment_transactions LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_investment investments; v_movement investment_transactions; v_category uuid; v_uid uuid:=auth.uid(); v_cash_type text;
BEGIN
 IF v_uid IS NULL OR p_request IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_date IS NULL OR p_type IS NULL OR p_type NOT IN ('contribution','withdrawal','yield','dividend') THEN RAISE EXCEPTION 'Movimentacao invalida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text,0));
 SELECT * INTO v_movement FROM investment_transactions WHERE user_id=v_uid AND client_request_id=p_request;
 IF FOUND THEN RETURN v_movement; END IF;
 SELECT * INTO v_investment FROM investments WHERE id=p_investment AND user_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Investimento nao encontrado'; END IF;
 IF p_type='withdrawal' AND p_amount>v_investment.current_value THEN RAISE EXCEPTION 'Resgate maior que o valor atual'; END IF;
 IF p_type<>'yield' THEN
  v_cash_type:=CASE WHEN p_type='contribution' THEN 'expense' ELSE 'income' END;
  SELECT id INTO v_category FROM categories WHERE user_id=v_uid AND name='Movimentacao de investimentos' AND type=v_cash_type ORDER BY created_at LIMIT 1;
  IF v_category IS NULL THEN INSERT INTO categories(user_id,name,type,spending_area) VALUES(v_uid,'Movimentacao de investimentos',v_cash_type,'Investimentos') RETURNING id INTO v_category; END IF;
  PERFORM save_financial_transaction(jsonb_build_object('type',v_cash_type,'amount',p_amount,'date',p_date,'account_id',p_account,'category_id',v_category,'description',CASE WHEN coalesce(btrim(p_description),'')='' THEN v_investment.name||' - '||p_type ELSE p_description END,'client_request_id',p_request));
 END IF;
 INSERT INTO investment_transactions(user_id,investment_id,account_id,type,amount,date,description,client_request_id)
 VALUES(v_uid,p_investment,CASE WHEN p_type='yield' THEN NULL ELSE p_account END,p_type,round(p_amount,2),p_date,p_description,p_request) RETURNING * INTO v_movement;
 UPDATE investments SET current_value=current_value+CASE WHEN p_type='withdrawal' THEN -round(p_amount,2) WHEN p_type='dividend' THEN 0 ELSE round(p_amount,2) END,updated_at=now() WHERE id=p_investment;
 RETURN v_movement;
END $$;
REVOKE ALL ON FUNCTION public.save_financial_account(uuid,text,text,numeric,numeric),public.save_installment_purchase(jsonb,integer),public.import_financial_transactions(jsonb),public.record_investment_movement(uuid,text,numeric,date,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_financial_account(uuid,text,text,numeric,numeric),public.save_installment_purchase(jsonb,integer),public.import_financial_transactions(jsonb),public.record_investment_movement(uuid,text,numeric,date,uuid,text,uuid) TO authenticated;
