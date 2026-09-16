-- Run after 20260915_financial_integrity.sql. Does not move or copy financial rows.
-- Membership is provisioned by the administrator, never by an app client.
CREATE TABLE IF NOT EXISTS public.finance_memberships (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_memberships_distinct CHECK (user_id <> owner_id)
);
CREATE INDEX IF NOT EXISTS finance_memberships_owner_idx ON public.finance_memberships(owner_id);
ALTER TABLE public.finance_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_memberships FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.current_finance_owner()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(
    (SELECT m.owner_id FROM public.finance_memberships m WHERE m.user_id = auth.uid()),
    auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.current_finance_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_finance_owner() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_finance_workspace()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'owner_id', public.current_finance_owner(),
    'shared', EXISTS(SELECT 1 FROM public.finance_memberships m WHERE m.owner_id = public.current_finance_owner())
  ) WHERE auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_finance_workspace() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_workspace() TO authenticated;

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'accounts','categories','transactions','credit_cards','billing_cycles',
    'card_payments','installments','investments','investment_transactions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('DROP POLICY IF EXISTS family_workspace_access ON public.%I', v_table);
    EXECUTE format('CREATE POLICY family_workspace_access ON public.%I FOR ALL TO authenticated USING (user_id=(SELECT public.current_finance_owner())) WITH CHECK (user_id=(SELECT public.current_finance_owner()))', v_table);
    -- Prevent old clients from splitting shared data into the member's personal user_id.
    -- This also limits any permissive legacy owner policies to the active workspace.
    EXECUTE format('DROP POLICY IF EXISTS family_workspace_boundary ON public.%I', v_table);
    EXECUTE format('CREATE POLICY family_workspace_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (user_id=(SELECT public.current_finance_owner())) WITH CHECK (user_id=(SELECT public.current_finance_owner()))', v_table);
  END LOOP;
END $$;

DROP POLICY IF EXISTS family_telegram_read ON public.telegram_users;
CREATE POLICY family_telegram_read ON public.telegram_users FOR SELECT TO authenticated
 USING (user_id=(SELECT public.current_finance_owner()));
DROP POLICY IF EXISTS pending_owner ON public.pending_transactions;
CREATE POLICY pending_owner ON public.pending_transactions FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.telegram_users u WHERE u.telegram_id=pending_transactions.telegram_user_id AND u.user_id IN ((SELECT auth.uid()),(SELECT public.current_finance_owner()))))
 WITH CHECK (EXISTS(SELECT 1 FROM public.telegram_users u WHERE u.telegram_id=pending_transactions.telegram_user_id AND u.user_id IN ((SELECT auth.uid()),(SELECT public.current_finance_owner()))));

-- Keep the tested atomic implementations and switch their identity to the shared
-- workspace. All operations and advisory locks use the same owner for both users.
-- SECURITY INVOKER and optimistic concurrency checks remain unchanged.
DO $$
DECLARE v_function regprocedure; v_definition text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.save_financial_transaction(jsonb,uuid,timestamptz)'::regprocedure,
    'public.delete_financial_transaction(uuid,timestamptz)'::regprocedure,
    'public.save_card_statement(uuid,date,date,numeric)'::regprocedure,
    'public.pay_card_statement(uuid,uuid,numeric,date,uuid)'::regprocedure,
    'public.save_financial_account(uuid,text,text,numeric,numeric)'::regprocedure,
    'public.save_installment_purchase(jsonb,integer)'::regprocedure,
    'public.record_investment_movement(uuid,text,numeric,date,uuid,text,uuid)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(v_function::oid) INTO v_definition;
    EXECUTE replace(v_definition, 'auth.uid()', 'public.current_finance_owner()');
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
