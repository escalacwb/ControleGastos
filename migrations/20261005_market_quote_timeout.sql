-- The official Treasury CSV takes longer than the default 8-second
-- authenticated REST statement timeout. Scope the longer limit to this
-- quotation refresh; all account balances remain subject to its existing
-- per-position validation and rollback on failure.
ALTER FUNCTION public.refresh_market_investments()
  SET statement_timeout TO '40s';

NOTIFY pgrst, 'reload config';
