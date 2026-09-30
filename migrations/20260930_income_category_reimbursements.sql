-- A positive income may use an expense category to represent a reimbursement.
-- Cash-flow totals continue to follow the transaction type; only category/DNA
-- reporting interprets this category choice as an expense offset.
DO $$
DECLARE
  v_definition text;
  v_patched text;
  v_old text := 'AND CASE type WHEN ''despesa'' THEN ''expense'' WHEN ''receita'' THEN ''income'' ELSE type END=v_new.type';
  v_new text := 'AND (CASE type WHEN ''despesa'' THEN ''expense'' WHEN ''receita'' THEN ''income'' ELSE type END=v_new.type OR (v_new.type=''income'' AND CASE type WHEN ''despesa'' THEN ''expense'' WHEN ''receita'' THEN ''income'' ELSE type END=''expense''))';
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='save_financial_transaction'
    AND pg_get_function_identity_arguments(p.oid)='p_data jsonb, p_id uuid, p_expected_updated_at timestamp with time zone';

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Funcao save_financial_transaction nao encontrada';
  END IF;
  v_patched:=replace(v_definition,v_old,v_new);
  IF v_patched=v_definition THEN
    IF position(v_new IN v_definition)>0 THEN RETURN; END IF;
    RAISE EXCEPTION 'Validacao de categoria esperada nao encontrada';
  END IF;
  EXECUTE v_patched;
END $$;

REVOKE ALL ON FUNCTION public.save_financial_transaction(jsonb,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_financial_transaction(jsonb,uuid,timestamptz) TO authenticated;
NOTIFY pgrst,'reload schema';
