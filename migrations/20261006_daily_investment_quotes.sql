-- Capture a single dated valuation for open quoted positions after B3 trading.
-- Supabase Cron uses GMT; 22:30 GMT is 19:30 in Sao Paulo.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE TABLE IF NOT EXISTS public.investment_quote_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL,
  ran_at timestamptz NOT NULL DEFAULT now(),
  updated_count integer NOT NULL DEFAULT 0,
  failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text
);
REVOKE ALL ON public.investment_quote_runs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.capture_daily_investment_quotes()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE workspace uuid; result jsonb; processed integer:=0;
BEGIN
  FOR workspace IN
    SELECT DISTINCT user_id FROM public.investments
    WHERE quote_mode IN ('stock','treasury') AND quantity>0
  LOOP
    PERFORM set_config('request.jwt.claim.sub',workspace::text,true);
    PERFORM set_config('request.jwt.claim.role','authenticated',true);
    BEGIN
      result:=public.refresh_market_investments();
      INSERT INTO public.investment_quote_runs(workspace_id,updated_count,failures)
      VALUES(workspace,coalesce((result->>'updated')::integer,0),coalesce(result->'failures','[]'::jsonb));
      processed:=processed+1;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.investment_quote_runs(workspace_id,error)
      VALUES(workspace,'Não foi possível atualizar as cotações; saldos preservados');
    END;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub','',true);
  RETURN processed;
END $$;
REVOKE ALL ON FUNCTION public.capture_daily_investment_quotes() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'investment-closing-prices',
  '30 22 * * 1-5',
  'SELECT public.capture_daily_investment_quotes()'
);
