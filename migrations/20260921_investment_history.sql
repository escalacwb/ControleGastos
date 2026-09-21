-- Daily closing valuations. Existing balances begin their history today.
ALTER TABLE public.investments ADD COLUMN IF NOT EXISTS ticker text;
ALTER TABLE public.investments ADD COLUMN IF NOT EXISTS quantity numeric;
ALTER TABLE public.investments ADD COLUMN IF NOT EXISTS average_price numeric;
CREATE TABLE IF NOT EXISTS public.investment_valuations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 investment_id uuid NOT NULL REFERENCES public.investments(id) ON DELETE CASCADE,
 date date NOT NULL,
 value numeric(18,2) NOT NULL CHECK(value>=0),
 source text NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','baseline','quote','balance')),
 price numeric, quantity numeric, quoted_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(investment_id,date)
);
ALTER TABLE public.investment_valuations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace ON public.investment_valuations;
CREATE POLICY workspace ON public.investment_valuations FOR ALL TO authenticated
 USING(user_id=public.current_finance_owner())
 WITH CHECK(user_id=public.current_finance_owner() AND EXISTS(SELECT 1 FROM public.investments i WHERE i.id=investment_id AND i.user_id=public.current_finance_owner()));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.investment_valuations TO authenticated;
INSERT INTO public.investment_valuations(user_id,investment_id,date,value,source)
 SELECT user_id,id,current_date,current_value,'baseline' FROM public.investments
 ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.capture_investment_value()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF current_setting('finance.valuation_rpc',true)='yes' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.current_value IS NOT DISTINCT FROM OLD.current_value THEN RETURN NEW; END IF;
 END IF;
 INSERT INTO investment_valuations(user_id,investment_id,date,value,source)
 VALUES(NEW.user_id,NEW.id,current_date,NEW.current_value,CASE WHEN TG_OP='INSERT' THEN 'baseline' ELSE 'balance' END)
 ON CONFLICT(investment_id,date) DO UPDATE SET value=excluded.value,source=excluded.source,price=NULL,quantity=NULL,quoted_at=NULL,updated_at=now();
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS investment_value_history ON public.investments;
CREATE TRIGGER investment_value_history AFTER INSERT OR UPDATE OF current_value ON public.investments
 FOR EACH ROW EXECUTE FUNCTION public.capture_investment_value();

CREATE OR REPLACE FUNCTION public.record_investment_valuation(p_investment uuid,p_date date,p_value numeric,p_expected numeric,p_price numeric DEFAULT NULL,p_quantity numeric DEFAULT NULL,p_quoted_at timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE i investments; latest date;
BEGIN
 SELECT * INTO i FROM investments WHERE id=p_investment AND user_id=current_finance_owner() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Investimento nao encontrado'; END IF;
 IF i.current_value IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'O saldo mudou. Atualize a tela antes de salvar.'; END IF;
 IF p_date IS NULL OR p_date>current_date OR p_date<i.purchase_date OR p_value IS NULL OR p_value<0 OR p_value::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Informe data e saldo validos'; END IF;
 IF p_price IS NOT NULL AND (p_price<=0 OR p_quantity IS NULL OR p_quantity<0 OR round(p_price*p_quantity,2)<>round(p_value,2) OR p_quantity IS DISTINCT FROM i.quantity OR p_quoted_at IS NULL) THEN RAISE EXCEPTION 'Cotacao ou quantidade invalida'; END IF;
 SELECT max(date) INTO latest FROM investment_valuations WHERE investment_id=i.id;
 INSERT INTO investment_valuations(user_id,investment_id,date,value,source,price,quantity,quoted_at)
 VALUES(i.user_id,i.id,p_date,round(p_value,2),CASE WHEN p_price IS NULL THEN 'manual' ELSE 'quote' END,p_price,p_quantity,p_quoted_at)
 ON CONFLICT(investment_id,date) DO UPDATE SET value=excluded.value,source=excluded.source,price=excluded.price,quantity=excluded.quantity,quoted_at=excluded.quoted_at,updated_at=now();
 IF latest IS NULL OR p_date>=latest THEN
  PERFORM set_config('finance.valuation_rpc','yes',true);
  UPDATE investments SET current_value=round(p_value,2),updated_at=now() WHERE id=i.id;
  PERFORM set_config('finance.valuation_rpc','',true);
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.record_investment_valuation(uuid,date,numeric,numeric,numeric,numeric,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_investment_valuation(uuid,date,numeric,numeric,numeric,numeric,timestamptz) TO authenticated;
NOTIFY pgrst,'reload schema';
