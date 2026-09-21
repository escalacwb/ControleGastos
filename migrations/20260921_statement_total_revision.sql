-- Reuse the existing invoice; revise an unpaid total only with explicit confirmation.
DO $$
DECLARE definition text; previous text; replacement text;
BEGIN
 definition:=pg_get_functiondef('public.save_statement_bundle(jsonb)'::regprocedure);
 previous:=$old$IF round((p_data->>'total')::numeric,2)<>c.total_spent THEN RAISE EXCEPTION 'O total mudou. Reabra a fatura.'; END IF;$old$;
 replacement:=$new$IF round((p_data->>'total')::numeric,2)<>c.total_spent THEN
     -- statement_total_revision_v1
     IF coalesce((p_data->>'confirm_total_revision')::boolean,false) IS NOT TRUE
        OR (p_data->>'expected_total') IS NULL
        OR round((p_data->>'expected_total')::numeric,2) IS DISTINCT FROM c.total_spent
        OR coalesce(c.total_paid,0)<>0
        OR EXISTS(SELECT 1 FROM card_payments WHERE billing_cycle_id=c.id)
        OR coalesce((p_data->>'total')::numeric,0)<=0 THEN
       RAISE EXCEPTION 'Confira o total da fatura existente. Apenas faturas sem pagamento podem ter o total corrigido por esta importacao.';
     END IF;
     UPDATE billing_cycles SET total_spent=round((p_data->>'total')::numeric,2),updated_at=now() WHERE id=c.id RETURNING * INTO c;
   END IF;$new$;
 IF position('statement_total_revision_v1' in definition)>0 THEN RETURN; END IF;
 IF position(previous in definition)=0 THEN RAISE EXCEPTION 'Versao inesperada de save_statement_bundle'; END IF;
 EXECUTE replace(definition,previous,replacement);
END $$;
NOTIFY pgrst,'reload schema';
