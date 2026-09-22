-- Let a statement's due date be corrected without touching its payment or cash balance.
DO $patch$
DECLARE definition text; needle text; replacement text;
BEGIN
 definition:=pg_get_functiondef('public.save_statement_bundle(jsonb)'::regprocedure);
 IF position('statement_due_revision_v1' in definition)>0 THEN RETURN; END IF;
 needle:=$old$ END IF;
 IF doc IS NOT NULL AND doc<>'null'::jsonb$old$;
 replacement:=$new$ END IF;
 -- statement_due_revision_v1: due date is statement metadata and may be fixed even after payment.
 IF nullif(p_data->>'due','') IS NULL THEN RAISE EXCEPTION 'Informe o vencimento da fatura.'; END IF;
 IF c.due_date IS DISTINCT FROM (p_data->>'due')::date THEN
   UPDATE billing_cycles SET due_date=(p_data->>'due')::date,updated_at=now() WHERE id=c.id RETURNING * INTO c;
 END IF;
 IF doc IS NOT NULL AND doc<>'null'::jsonb$new$;
 IF position(needle in definition)=0 THEN RAISE EXCEPTION 'Versao inesperada de save_statement_bundle'; END IF;
 EXECUTE replace(definition,needle,replacement);
END $patch$;
NOTIFY pgrst,'reload schema';
