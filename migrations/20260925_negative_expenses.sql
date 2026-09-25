-- Allow cash expenses with a negative amount to work as category abatements.
-- Existing rows and balances are not changed.
CREATE OR REPLACE FUNCTION public.save_financial_transaction(
  p_data jsonb,
  p_id uuid DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_old public.transactions;
  v_new public.transactions;
  v_uid uuid:=public.current_finance_owner();
  v_delta record;
  v_request uuid:=nullif(p_data->>'client_request_id','')::uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticacao necessaria'; END IF;
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

  v_new.user_id:=v_uid;
  v_new.type:=p_data->>'type';
  v_new.amount:=round((p_data->>'amount')::numeric,2);
  v_new.description:=btrim(p_data->>'description');
  v_new.date:=(p_data->>'date')::date;
  v_new.account_id:=nullif(p_data->>'account_id','')::uuid;
  v_new.category_id:=nullif(p_data->>'category_id','')::uuid;
  v_new.credit_card_id:=nullif(p_data->>'credit_card_id','')::uuid;
  v_new.transfer_to_account_id:=nullif(p_data->>'transfer_to_account_id','')::uuid;

  IF v_new.type IS NULL OR v_new.type NOT IN ('income','expense','transfer') OR v_new.amount IS NULL OR v_new.amount=0 OR v_new.amount::text IN ('NaN','Infinity','-Infinity') OR v_new.date IS NULL OR coalesce(v_new.description,'')='' THEN
    RAISE EXCEPTION 'Preencha tipo, valor diferente de zero, descricao e data.';
  END IF;
  IF v_new.amount<0 AND (v_new.type<>'expense' OR v_new.credit_card_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Valor negativo permitido apenas para despesa lancada na conta.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM accounts WHERE id=v_new.account_id AND user_id=v_uid) THEN RAISE EXCEPTION 'Conta invalida'; END IF;
  IF v_new.category_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM categories
    WHERE id=v_new.category_id AND user_id=v_uid
      AND CASE type WHEN 'despesa' THEN 'expense' WHEN 'receita' THEN 'income' ELSE type END=v_new.type
  ) THEN RAISE EXCEPTION 'Categoria invalida para este tipo'; END IF;
  IF v_new.credit_card_id IS NOT NULL THEN
    IF v_new.type<>'expense' OR NOT EXISTS(
      SELECT 1 FROM credit_cards
      WHERE id=v_new.credit_card_id AND user_id=v_uid AND account_id=v_new.account_id AND is_active
    ) THEN RAISE EXCEPTION 'Cartao invalido'; END IF;
  END IF;
  IF v_new.type='transfer' THEN
    v_new.category_id:=NULL;
    v_new.credit_card_id:=NULL;
    IF v_new.transfer_to_account_id=v_new.account_id OR NOT EXISTS(
      SELECT 1 FROM accounts WHERE id=v_new.transfer_to_account_id AND user_id=v_uid
    ) THEN RAISE EXCEPTION 'Escolha uma conta de destino diferente'; END IF;
  ELSE
    v_new.transfer_to_account_id:=NULL;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO transactions(user_id,type,amount,description,date,account_id,category_id,credit_card_id,transfer_to_account_id,client_request_id)
    VALUES(v_uid,v_new.type,v_new.amount,v_new.description,v_new.date,v_new.account_id,v_new.category_id,v_new.credit_card_id,v_new.transfer_to_account_id,v_request)
    RETURNING * INTO v_new;
  ELSE
    UPDATE transactions
    SET type=v_new.type,amount=v_new.amount,description=v_new.description,date=v_new.date,
        account_id=v_new.account_id,category_id=v_new.category_id,credit_card_id=v_new.credit_card_id,
        transfer_to_account_id=v_new.transfer_to_account_id,updated_at=clock_timestamp()
    WHERE id=p_id
    RETURNING * INTO v_new;
  END IF;

  -- Signed amounts make an expense abatement add cash back to the account.
  FOR v_delta IN
    SELECT id,sum(delta) AS delta FROM (VALUES
      (v_old.account_id,CASE WHEN v_old.credit_card_id IS NOT NULL THEN 0 WHEN v_old.type IN ('income','receita') THEN -v_old.amount ELSE v_old.amount END),
      (v_old.transfer_to_account_id,CASE WHEN v_old.type IN ('transfer','transferencia') THEN -v_old.amount ELSE 0 END),
      (v_new.account_id,CASE WHEN v_new.credit_card_id IS NOT NULL THEN 0 WHEN v_new.type='income' THEN v_new.amount ELSE -v_new.amount END),
      (v_new.transfer_to_account_id,CASE WHEN v_new.type='transfer' THEN v_new.amount ELSE 0 END)
    ) AS d(id,delta)
    WHERE id IS NOT NULL
    GROUP BY id
    ORDER BY id
  LOOP
    UPDATE accounts SET balance=coalesce(balance,0)+v_delta.delta WHERE id=v_delta.id AND user_id=v_uid;
  END LOOP;
  RETURN v_new;
END $$;

REVOKE ALL ON FUNCTION public.save_financial_transaction(jsonb,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_financial_transaction(jsonb,uuid,timestamptz) TO authenticated;
NOTIFY pgrst,'reload schema';
