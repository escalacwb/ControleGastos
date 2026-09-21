CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
CREATE TABLE IF NOT EXISTS public.market_quote_cache(symbol text NOT NULL,range text NOT NULL,payload jsonb NOT NULL,fetched_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(symbol,range));
REVOKE ALL ON public.market_quote_cache FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_investment_market(p_investment uuid,p_range text DEFAULT '1y')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE i investments; v_symbol text; cached market_quote_cache; response extensions.http_response; doc jsonb; result jsonb; meta jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre novamente'; END IF;
 SELECT * INTO i FROM investments WHERE id=p_investment AND user_id=current_finance_owner();
 IF NOT FOUND THEN RAISE EXCEPTION 'Investimento nao encontrado'; END IF;
 v_symbol:=upper(coalesce(nullif(i.ticker,''),i.name));
 IF v_symbol !~ '^[A-Z]{4}[0-9]{1,2}$' THEN RAISE EXCEPTION 'Informe o codigo do papel no cadastro'; END IF;
 IF p_range NOT IN ('1d','5d','1mo','3mo','1y','2y','5y','10y','ytd') THEN RAISE EXCEPTION 'Periodo invalido'; END IF;
 SELECT * INTO cached FROM market_quote_cache WHERE market_quote_cache.symbol=v_symbol||'.SA' AND range=p_range;
 IF FOUND AND cached.fetched_at>now()-interval '15 minutes' THEN RETURN cached.payload; END IF;
 PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','8000');
 SELECT * INTO response FROM extensions.http_get('https://query1.finance.yahoo.com/v8/finance/chart/'||v_symbol||'.SA?range='||p_range||'&interval='||CASE WHEN p_range='1d' THEN '5m' ELSE '1d' END);
 IF response.status<>200 THEN RAISE EXCEPTION 'Cotacao temporariamente indisponivel. Saldo preservado.'; END IF;
 doc:=response.content::jsonb;result:=doc#>'{chart,result,0}';meta:=result->'meta';
 IF result IS NULL OR meta->>'symbol'<>v_symbol||'.SA' OR meta->>'currency'<>'BRL' OR coalesce((meta->>'regularMarketPrice')::numeric,0)<=0 OR (meta->>'regularMarketTime') IS NULL THEN RAISE EXCEPTION 'Resposta de mercado invalida'; END IF;
 INSERT INTO market_quote_cache(symbol,range,payload) VALUES(v_symbol||'.SA',p_range,result)
 ON CONFLICT ON CONSTRAINT market_quote_cache_pkey DO UPDATE SET payload=excluded.payload,fetched_at=now();
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_investment_market(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_investment_market(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_market_investments()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE i investments; quote jsonb; price numeric; quote_time timestamptz; quote_date date; last_date date; updated integer:=0; failures jsonb:='[]'::jsonb;
BEGIN
 FOR i IN SELECT * FROM investments WHERE user_id=current_finance_owner() AND upper(coalesce(nullif(ticker,''),name)) ~ '^[A-Z]{4}[0-9]{1,2}$' LOOP
  BEGIN
   quote:=get_investment_market(i.id,'1mo');
   IF i.quantity IS NULL OR i.quantity<=0 THEN failures:=failures||jsonb_build_array(jsonb_build_object('name',i.name,'reason','Informe a quantidade de papeis'));CONTINUE; END IF;
   price:=(quote#>>'{meta,regularMarketPrice}')::numeric;
   quote_time:=to_timestamp((quote#>>'{meta,regularMarketTime}')::numeric);
   quote_date:=current_date;
   SELECT max(date) INTO last_date FROM investment_valuations WHERE investment_id=i.id;
   IF quote_time>now()+interval '5 minutes' OR quote_time<now()-interval '7 days' OR quote_date<coalesce(last_date,i.purchase_date) THEN failures:=failures||jsonb_build_array(jsonb_build_object('name',i.name,'reason','Cotacao desatualizada; saldo preservado'));CONTINUE; END IF;
   PERFORM record_investment_valuation(i.id,quote_date,round(price*i.quantity,2),i.current_value,price,i.quantity,quote_time);
   updated:=updated+1;
  EXCEPTION WHEN OTHERS THEN failures:=failures||jsonb_build_array(jsonb_build_object('name',i.name,'reason','Consulta indisponivel; saldo preservado'));
  END;
 END LOOP;
 RETURN jsonb_build_object('updated',updated,'failures',failures);
END $$;
REVOKE ALL ON FUNCTION public.refresh_market_investments() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.refresh_market_investments() TO authenticated;
NOTIFY pgrst,'reload schema';
