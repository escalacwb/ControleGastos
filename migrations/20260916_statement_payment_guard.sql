-- Check historical/manual payments under the same workspace lock as financial writes.
CREATE OR REPLACE FUNCTION public.statement_payment_candidates(p_card uuid,p_month date,p_total numeric,p_cycle uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=public.current_finance_owner(); card credit_cards; brand text; holder text; result jsonb;
BEGIN
 SELECT * INTO card FROM credit_cards WHERE id=p_card AND user_id=u;
 IF NOT FOUND OR p_month IS NULL THEN RAISE EXCEPTION 'Cartao ou referencia invalida'; END IF;
 brand:=CASE WHEN lower(card.bank_name) LIKE '%nubank%' THEN 'nubank' WHEN lower(card.bank_name) LIKE '%cef%' OR lower(card.bank_name) LIKE '%caixa%' THEN 'cef|caixa' WHEN lower(card.bank_name) LIKE '%xp%' THEN '\mxp\M' ELSE lower(card.bank_name) END;
 holder:=CASE WHEN lower(card.bank_name) LIKE '%wagner%' THEN 'wagner' WHEN lower(card.bank_name) LIKE '%aline%' THEN 'aline' ELSE '' END;
 SELECT coalesce(jsonb_agg(row_to_json(candidate_row) ORDER BY candidate_row.close_amount DESC,candidate_row.date DESC),'[]'::jsonb) INTO result FROM (
   SELECT t.id,t.date,t.description,t.amount,t.account_id,a.name AS account_name,p.billing_cycle_id AS linked_cycle_id,
     abs(t.amount-p_total)<=0.05 AS close_amount,round(t.amount-p_total,2) AS difference
   FROM transactions t LEFT JOIN accounts a ON a.id=t.account_id
   LEFT JOIN card_payments p ON p.transaction_id=t.id AND p.user_id=u
   WHERE t.user_id=u AND t.credit_card_id IS NULL AND t.type IN ('expense','despesa')
    AND (p.billing_cycle_id=p_cycle OR (
      translate(lower(t.description),'ãáàâéêíóôõúç','aaaaeeiooouc') ~ brand
      AND btrim(translate(lower(t.description),'ãáàâéêíóôõúç','aaaaeeiooouc')) ~ '(^pg[. ]|pagamento|fatura)'
      AND NOT (brand='nubank' AND holder='wagner' AND lower(t.description) LIKE '%aline%' AND lower(t.description) NOT LIKE '%wagner%')
      AND NOT (brand='nubank' AND holder='aline' AND lower(t.description) LIKE '%wagner%' AND lower(t.description) NOT LIKE '%aline%')
      AND t.date >= date_trunc('month',p_month)::date-interval '1 month'
      AND t.date < date_trunc('month',p_month)::date+interval '2 months'
      AND (date_trunc('month',t.date)=date_trunc('month',p_month) OR abs(t.amount-p_total)<=0.05)
    ))
 ) candidate_row;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.statement_payment_candidates(uuid,date,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.statement_payment_candidates(uuid,date,numeric,uuid) TO authenticated;

-- Keep existing financial routines intact; insert guards before mutations inside their lock.
DO $patch$
DECLARE definition text; marker text;
BEGIN
 definition:=pg_get_functiondef('public.save_statement_bundle(jsonb)'::regprocedure);
 IF position('historical_payment_guard_v1' IN definition)=0 THEN
  marker:=' IF coalesce(jsonb_array_length(p_data->''items''),0)>1000';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected statement routine'; END IF;
  definition:=replace(definition,marker,$guard$
 -- historical_payment_guard_v1: old clients must not silently create another payment.
 IF coalesce((p_data->>'pay_amount')::numeric,0)>0 AND nullif(p_data->>'existing_payment_id','') IS NULL THEN
   IF coalesce((p_data->>'confirm_new_payment')::boolean,false) IS NOT TRUE THEN
     RAISE EXCEPTION 'Atualize o aplicativo: antes de criar um pagamento e necessario conferir o historico e confirmar que ele ainda nao foi lancado.';
   END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(statement_payment_candidates(card.id,(p_data->>'month')::date,(p_data->>'total')::numeric,nullif(p_data->>'cycle_id','')::uuid)) candidate WHERE candidate->>'linked_cycle_id' IS NULL) THEN
     RAISE EXCEPTION 'Ja existe pagamento deste cartao no periodo. Escolha Vincular pagamento ja lancado; nao sera criada outra saida.';
   END IF;
 END IF;
$guard$||marker);
  -- A few cents of import/statement rounding must not force users to duplicate payments.
  marker:='   SELECT * INTO existing FROM transactions WHERE id=(p_data->>''existing_payment_id'')::uuid AND user_id=u FOR UPDATE;';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected existing payment routine'; END IF;
  definition:=replace(definition,marker,marker||$guard$
   IF FOUND AND coalesce(c.total_paid,0)=0 AND abs(existing.amount-c.total_spent)<=0.05 AND existing.credit_card_id IS NULL AND existing.type IN ('expense','despesa') THEN
     UPDATE billing_cycles SET total_spent=existing.amount,updated_at=now() WHERE id=c.id RETURNING * INTO c;
   END IF;
$guard$);
  EXECUTE definition;
 END IF;
 definition:=pg_get_functiondef('public.save_statement_bundle(jsonb)'::regprocedure);
 definition:=replace(definition,'AND abs(existing.amount-c.total_spent)<=0.05 AND existing.amount>c.total_spent','AND abs(existing.amount-c.total_spent)<=0.05');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.pay_card_statement(uuid,uuid,numeric,date,uuid)'::regprocedure);
 IF position('historical_payment_guard_v1' IN definition)=0 THEN
  marker:=' IF NOT FOUND THEN RAISE EXCEPTION ''Fatura nao encontrada''; END IF;';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected payment routine'; END IF;
  definition:=replace(definition,marker,marker||$guard$
 -- historical_payment_guard_v1: also protect old/direct payment clients.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(statement_payment_candidates(v_cycle.credit_card_id,v_cycle.cycle_start_date,v_cycle.total_spent,v_cycle.id)) candidate WHERE candidate->>'linked_cycle_id' IS NULL) THEN
   RAISE EXCEPTION 'Pagamento anterior encontrado para este cartao. Vincule o lancamento existente em vez de pagar novamente.';
 END IF;
$guard$);
  EXECUTE definition;
 END IF;
END $patch$;
NOTIFY pgrst,'reload schema';
