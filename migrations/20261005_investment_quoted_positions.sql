-- Positions keep their recorded balance until the user supplies an exact quantity.
-- Treasury prices come from the daily official Tesouro Transparente CSV (PU Base Manha).
ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS quote_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS treasury_title text;
ALTER TABLE public.investments DROP CONSTRAINT IF EXISTS investments_quote_mode_check;
ALTER TABLE public.investments ADD CONSTRAINT investments_quote_mode_check
  CHECK (quote_mode IN ('manual','stock','treasury'));
ALTER TABLE public.investments DROP CONSTRAINT IF EXISTS investments_treasury_title_check;
ALTER TABLE public.investments ADD CONSTRAINT investments_treasury_title_check
  CHECK (treasury_title IS NULL OR treasury_title IN ('Tesouro Selic','Tesouro IPCA+','Tesouro Prefixado'));

UPDATE public.investments SET quote_mode='stock',ticker=coalesce(ticker,upper(name))
  WHERE type='stocks' AND upper(name) ~ '^[A-Z]{4}[0-9]{1,2}$' AND quote_mode='manual';
UPDATE public.investments SET quote_mode='treasury',
  treasury_title=CASE WHEN name ILIKE 'Tesouro Selic%' THEN 'Tesouro Selic'
    WHEN name ILIKE 'Tesouro IPCA +%' OR name ILIKE 'Tesouro IPCA+%' OR name ILIKE 'Tesoura IPCA +%' THEN 'Tesouro IPCA+'
    WHEN name ILIKE 'Tesouro Prefixado%' THEN 'Tesouro Prefixado' END
  WHERE (name ILIKE 'Tesouro Selic%' OR name ILIKE 'Tesouro IPCA +%' OR name ILIKE 'Tesoura IPCA +%'
    OR name ILIKE 'Tesouro IPCA+%' OR name ILIKE 'Tesouro Prefixado%') AND quote_mode='manual';

CREATE TABLE IF NOT EXISTS public.treasury_quote_cache (
  title text NOT NULL, maturity_date date NOT NULL, quote_date date NOT NULL,
  base_price numeric(18,2) NOT NULL CHECK(base_price>0),
  sale_price numeric(18,2) NOT NULL CHECK(sale_price>0),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(title,maturity_date,quote_date)
);
REVOKE ALL ON public.treasury_quote_cache FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.treasury_quote_cache TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_treasury_quote_cache() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE response extensions.http_response; lines text[]; cells text[]; row_text text;
  newest text; line_no integer; count_rows integer:=0; value_base numeric; value_sale numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre novamente'; END IF;
  IF (SELECT max(fetched_at) FROM public.treasury_quote_cache)>now()-interval '12 hours' THEN
    RETURN 0;
  END IF;
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','30000');
  SELECT * INTO response FROM extensions.http_get(
    'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv');
  IF response.status<>200 OR length(response.content)<100 THEN RAISE EXCEPTION 'Precos do Tesouro indisponiveis'; END IF;
  lines:=string_to_array(replace(response.content,E'\r',''),E'\n');
  IF lines[1] NOT LIKE 'Tipo Titulo;Data Vencimento;Data Base;%PU Base Manha%' THEN
    RAISE EXCEPTION 'Formato da fonte oficial mudou';
  END IF;
  newest:=split_part(lines[2],';',3);
  IF newest !~ '^\d{2}/\d{2}/\d{4}$' OR to_date(newest,'DD/MM/YYYY')<current_date-7 THEN
    RAISE EXCEPTION 'Fonte oficial sem precos recentes';
  END IF;
  FOR line_no IN 2..coalesce(array_length(lines,1),1) LOOP
    row_text:=lines[line_no];cells:=string_to_array(row_text,';');
    IF cardinality(cells)<8 THEN CONTINUE; END IF;
    IF cells[3]<>newest THEN EXIT; END IF;
    IF cells[1] NOT IN ('Tesouro Selic','Tesouro IPCA+','Tesouro Prefixado')
      OR cells[2] !~ '^\d{2}/\d{2}/\d{4}$'
      OR cells[7] !~ '^[0-9.]+,[0-9]{2}$' OR cells[8] !~ '^[0-9.]+,[0-9]{2}$' THEN CONTINUE; END IF;
    value_base:=replace(replace(cells[8],'.',''),',','.')::numeric;
    value_sale:=replace(replace(cells[7],'.',''),',','.')::numeric;
    IF value_base<=0 OR value_sale<=0 THEN CONTINUE; END IF;
    INSERT INTO public.treasury_quote_cache(title,maturity_date,quote_date,base_price,sale_price)
      VALUES(cells[1],to_date(cells[2],'DD/MM/YYYY'),to_date(newest,'DD/MM/YYYY'),value_base,value_sale)
      ON CONFLICT(title,maturity_date,quote_date) DO UPDATE
      SET base_price=excluded.base_price,sale_price=excluded.sale_price,fetched_at=now();
    count_rows:=count_rows+1;
  END LOOP;
  IF count_rows=0 THEN RAISE EXCEPTION 'Nenhum titulo valido na fonte oficial'; END IF;
  RETURN count_rows;
END $$;
REVOKE ALL ON FUNCTION public.refresh_treasury_quote_cache() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.refresh_treasury_quote_cache() TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_market_investments() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE i investments; quote jsonb; price numeric; quote_time timestamptz; quote_date date;
  last_date date; updated integer:=0; failures jsonb:='[]'::jsonb;
  treasury_date date; treasury_price numeric; treasury_error text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre novamente'; END IF;
  FOR i IN SELECT * FROM investments WHERE user_id=current_finance_owner() AND quote_mode='stock' LOOP
    BEGIN
      IF i.quantity IS NULL OR i.quantity<=0 THEN
        failures:=failures||jsonb_build_array(jsonb_build_object('name',i.name,'reason','Informe a quantidade de papeis'));CONTINUE;
      END IF;
      quote:=get_investment_market(i.id,'1mo');
      price:=(quote#>>'{meta,regularMarketPrice}')::numeric;
      quote_time:=to_timestamp((quote#>>'{meta,regularMarketTime}')::numeric);
      quote_date:=(quote_time AT TIME ZONE 'America/Sao_Paulo')::date;
      SELECT max(date) INTO last_date FROM investment_valuations WHERE investment_id=i.id;
      IF quote_time>now()+interval '5 minutes' OR quote_time<now()-interval '7 days'
        OR quote_date<coalesce(last_date,i.purchase_date) THEN
        failures:=failures||jsonb_build_array(jsonb_build_object('name',i.name,'reason','Cotacao desatualizada; saldo preservado'));CONTINUE;
      END IF;
      PERFORM record_investment_valuation(i.id,quote_date,round(price*i.quantity,2),i.current_value,price,i.quantity,quote_time);
      updated:=updated+1;
    EXCEPTION WHEN OTHERS THEN
      failures:=failures||jsonb_build_array(jsonb_build_object('name',i.name,'reason','Cotacao indisponivel; saldo preservado'));
    END;
  END LOOP;
  IF EXISTS(SELECT 1 FROM investments WHERE user_id=current_finance_owner() AND quote_mode='treasury' AND quantity>0 AND maturity_date IS NOT NULL) THEN
    BEGIN PERFORM refresh_treasury_quote_cache();
    EXCEPTION WHEN OTHERS THEN treasury_error:='Fonte oficial indisponivel; saldo preservado'; END;
  END IF;
  FOR i IN SELECT * FROM investments WHERE user_id=current_finance_owner() AND quote_mode='treasury' LOOP
    BEGIN
      IF i.quantity IS NULL OR i.quantity<=0 OR i.maturity_date IS NULL OR i.treasury_title IS NULL THEN
        failures:=failures||jsonb_build_array(jsonb_build_object('name',i.name,'reason','Informe titulo, vencimento e quantidade'));CONTINUE;
      END IF;
      IF treasury_error IS NOT NULL THEN
        failures:=failures||jsonb_build_array(jsonb_build_object('name',i.name,'reason',treasury_error));CONTINUE;
      END IF;
      SELECT q.quote_date,q.base_price INTO treasury_date,treasury_price FROM public.treasury_quote_cache q
        WHERE q.title=i.treasury_title AND q.maturity_date=i.maturity_date ORDER BY q.quote_date DESC LIMIT 1;
      SELECT max(date) INTO last_date FROM investment_valuations WHERE investment_id=i.id;
      IF treasury_date IS NULL OR treasury_date<current_date-7 OR treasury_date<coalesce(last_date,i.purchase_date) THEN
        failures:=failures||jsonb_build_array(jsonb_build_object('name',i.name,'reason','Sem preco recente para este titulo e vencimento'));CONTINUE;
      END IF;
      PERFORM record_investment_valuation(i.id,treasury_date,round(treasury_price*i.quantity,2),i.current_value,treasury_price,i.quantity,treasury_date::timestamptz);
      updated:=updated+1;
    EXCEPTION WHEN OTHERS THEN
      failures:=failures||jsonb_build_array(jsonb_build_object('name',i.name,'reason','Confira data da compra, titulo e quantidade; saldo preservado'));
    END;
  END LOOP;
  RETURN jsonb_build_object('updated',updated,'failures',failures);
END $$;
NOTIFY pgrst,'reload schema';
