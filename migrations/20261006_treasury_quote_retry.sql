-- Retry stale official Treasury data sooner when the source publishes after an earlier check.
CREATE OR REPLACE FUNCTION public.refresh_treasury_quote_cache() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE response extensions.http_response; lines text[]; cells text[]; row_text text;
  newest text; line_no integer; count_rows integer:=0; value_base numeric; value_sale numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre novamente'; END IF;
  IF (SELECT max(quote_date) FROM public.treasury_quote_cache)>=current_date THEN
    RETURN 0;
  END IF;
  IF (SELECT max(fetched_at) FROM public.treasury_quote_cache)>now()-interval '3 hours' THEN
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

NOTIFY pgrst,'reload schema';
