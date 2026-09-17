-- Link legacy payments that predate mandatory account assignment.
-- No account balance is changed: this only supplies card_payments.account_id.
DO $patch$
DECLARE definition text; old_sql text; new_sql text;
BEGIN
 SELECT pg_get_functiondef('public.save_statement_bundle(jsonb)'::regprocedure) INTO definition;
 IF position('legacy_payment_account_fallback_v1' in definition)>0 THEN RETURN; END IF;
 old_sql:='   INSERT INTO card_payments(user_id,credit_card_id,billing_cycle_id,account_id,amount,payment_date,transaction_id,status,payment_method) VALUES(u,card.id,c.id,existing.account_id,existing.amount,existing.date,existing.id,''paid'',''transferencia_bancaria'');';
 new_sql:='   -- legacy_payment_account_fallback_v1: old manual payments may not have an account.'||chr(10)
 ||'   IF existing.account_id IS NULL AND NOT EXISTS(SELECT 1 FROM accounts WHERE id=coalesce(nullif(p_data->>''pay_account'','''')::uuid,card.account_id) AND user_id=u AND type NOT IN (''credit_card'',''investment'')) THEN RAISE EXCEPTION ''Escolha uma conta valida para vincular este pagamento antigo.''; END IF;'||chr(10)
 ||'   INSERT INTO card_payments(user_id,credit_card_id,billing_cycle_id,account_id,amount,payment_date,transaction_id,status,payment_method) VALUES(u,card.id,c.id,coalesce(existing.account_id,nullif(p_data->>''pay_account'','''')::uuid,card.account_id),existing.amount,existing.date,existing.id,''paid'',''transferencia_bancaria'');';
 IF position(old_sql in definition)=0 THEN RAISE EXCEPTION 'save_statement_bundle mudou; fallback nao aplicado'; END IF;
 definition:=replace(definition,old_sql,new_sql);
 EXECUTE definition;
END $patch$;
NOTIFY pgrst,'reload schema';
