-- Correct or remove an accidental manual valuation without leaving a later
-- date behind or making investments.current_value disagree with the history.
CREATE OR REPLACE FUNCTION public.revise_investment_valuation(
  p_valuation uuid, p_date date, p_value numeric, p_expected numeric)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE i investments; v investment_valuations; was_latest boolean; latest_value numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre novamente'; END IF;
  SELECT * INTO v FROM investment_valuations
    WHERE id=p_valuation AND user_id=current_finance_owner();
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaliacao nao encontrada'; END IF;
  SELECT * INTO i FROM investments WHERE id=v.investment_id AND user_id=v.user_id FOR UPDATE;
  SELECT * INTO v FROM investment_valuations WHERE id=p_valuation FOR UPDATE;
  IF v.source<>'manual' THEN RAISE EXCEPTION 'Avaliacao automatica nao pode ser alterada; corrija a posicao ou a operacao'; END IF;
  IF i.current_value IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'O saldo mudou. Atualize a tela antes de salvar.'; END IF;
  IF p_date IS NULL OR p_date>current_date OR p_date<i.purchase_date
    OR p_value IS NULL OR p_value<0 OR p_value::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Informe data e saldo validos';
  END IF;
  IF EXISTS(SELECT 1 FROM investment_valuations WHERE investment_id=i.id AND date=p_date AND id<>v.id) THEN
    RAISE EXCEPTION 'Ja existe uma avaliacao nesta data';
  END IF;
  was_latest:=v.date=(SELECT max(date) FROM investment_valuations WHERE investment_id=i.id);
  UPDATE investment_valuations SET date=p_date,value=round(p_value,2),updated_at=now() WHERE id=v.id;
  IF was_latest OR p_date=(SELECT max(date) FROM investment_valuations WHERE investment_id=i.id) THEN
    SELECT value INTO latest_value FROM investment_valuations
      WHERE investment_id=i.id ORDER BY date DESC LIMIT 1;
    PERFORM set_config('finance.valuation_rpc','yes',true);
    UPDATE investments SET current_value=latest_value,updated_at=now() WHERE id=i.id;
    PERFORM set_config('finance.valuation_rpc','',true);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.revise_investment_valuation(uuid,date,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revise_investment_valuation(uuid,date,numeric,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_investment_valuation(
  p_valuation uuid, p_expected numeric)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE i investments; v investment_valuations; was_latest boolean; latest_value numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre novamente'; END IF;
  SELECT * INTO v FROM investment_valuations
    WHERE id=p_valuation AND user_id=current_finance_owner();
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaliacao nao encontrada'; END IF;
  SELECT * INTO i FROM investments WHERE id=v.investment_id AND user_id=v.user_id FOR UPDATE;
  SELECT * INTO v FROM investment_valuations WHERE id=p_valuation FOR UPDATE;
  IF v.source<>'manual' THEN RAISE EXCEPTION 'So avaliacoes manuais podem ser excluidas'; END IF;
  IF i.current_value IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'O saldo mudou. Atualize a tela antes de excluir.'; END IF;
  was_latest:=v.date=(SELECT max(date) FROM investment_valuations WHERE investment_id=i.id);
  IF was_latest AND i.current_value IS DISTINCT FROM v.value THEN
    RAISE EXCEPTION 'O saldo atual difere desta avaliacao. Atualize a carteira antes de excluir.';
  END IF;
  DELETE FROM investment_valuations WHERE id=v.id;
  IF was_latest THEN
    SELECT value INTO latest_value FROM investment_valuations
      WHERE investment_id=i.id ORDER BY date DESC LIMIT 1;
    IF latest_value IS NULL THEN RAISE EXCEPTION 'Esta e a unica avaliacao. Corrija a data em vez de excluir.'; END IF;
    PERFORM set_config('finance.valuation_rpc','yes',true);
    UPDATE investments SET current_value=latest_value,updated_at=now() WHERE id=i.id;
    PERFORM set_config('finance.valuation_rpc','',true);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.delete_investment_valuation(uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_investment_valuation(uuid,numeric) TO authenticated;

-- A recorded sale may predate automatic quotes. Revalue the remaining units
-- at those same historical unit prices, while refusing to rewrite manual
-- valuations or replay later trades implicitly.
CREATE OR REPLACE FUNCTION public.record_investment_trade(
 p_investment uuid,p_side text,p_quantity numeric,p_unit_price numeric,p_fees numeric,
 p_date date,p_account uuid,p_description text,p_request uuid,
 p_expected_quantity numeric,p_expected_value numeric)
RETURNS public.investment_transactions
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE i investments; result investment_transactions; uid uuid:=public.current_finance_owner();
  gross numeric; cash_amount numeric; basis numeric; new_quantity numeric; new_value numeric;
  avg_cost numeric; category_id uuid; cash_type text; latest date; latest_value numeric; trade_day_value numeric;
  backdated boolean:=false;
BEGIN
 IF auth.uid() IS NULL OR p_request IS NULL OR p_side NOT IN ('buy','sale')
  OR p_quantity IS NULL OR p_quantity<=0 OR p_unit_price IS NULL OR p_unit_price<=0
  OR p_fees IS NULL OR p_fees<0 OR p_date IS NULL OR p_date>current_date
  OR p_quantity::text IN ('NaN','Infinity','-Infinity')
  OR p_unit_price::text IN ('NaN','Infinity','-Infinity')
  OR p_fees::text IN ('NaN','Infinity','-Infinity') THEN
  RAISE EXCEPTION 'Informe quantidade, preco, custos e data validos';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 SELECT * INTO result FROM public.investment_transactions WHERE user_id=uid AND client_request_id=p_request;
 IF FOUND THEN
  IF result.investment_id<>p_investment OR result.type<>p_side THEN RAISE EXCEPTION 'Solicitacao reutilizada em outra operacao'; END IF;
  RETURN result;
 END IF;
 SELECT * INTO i FROM public.investments WHERE id=p_investment AND user_id=uid FOR UPDATE;
 IF NOT FOUND OR i.quote_mode NOT IN ('stock','treasury') THEN RAISE EXCEPTION 'Selecione uma posicao de acoes ou Tesouro'; END IF;
 IF i.quantity IS NULL OR (p_side='sale' AND i.quantity<=0) OR i.current_value IS DISTINCT FROM p_expected_value
  OR i.quantity IS DISTINCT FROM p_expected_quantity THEN
  RAISE EXCEPTION 'Posicao alterada ou quantidade ausente. Atualize a carteira antes de registrar.';
 END IF;
 IF p_date<i.purchase_date THEN RAISE EXCEPTION 'A operacao nao pode anteceder a compra cadastrada'; END IF;
 SELECT max(date) INTO latest FROM public.investment_valuations WHERE investment_id=i.id;
 IF latest IS NOT NULL AND p_date<latest THEN
  IF p_side<>'sale' OR EXISTS(
    SELECT 1 FROM public.investment_valuations WHERE investment_id=i.id
      AND date>p_date AND (source NOT IN ('quote','baseline') OR (source='quote' AND (price IS NULL OR price<=0)))
  ) OR EXISTS(
    SELECT 1 FROM public.investment_transactions WHERE investment_id=i.id AND date>p_date AND type IN ('buy','sale')
  ) THEN
    RAISE EXCEPTION 'Ha avaliacao manual ou outra negociacao posterior. Corrija o historico antes de registrar.';
  END IF;
  SELECT value INTO latest_value FROM public.investment_valuations
    WHERE investment_id=i.id ORDER BY date DESC LIMIT 1;
  IF latest_value IS DISTINCT FROM i.current_value THEN
    RAISE EXCEPTION 'Saldo atual divergente do historico. Corrija a avaliacao antes de registrar.';
  END IF;
  backdated:=true;
 END IF;
 IF i.quote_mode='stock' AND p_quantity<>trunc(p_quantity) THEN RAISE EXCEPTION 'Informe um numero inteiro de acoes'; END IF;
 IF p_side='sale' AND p_quantity>i.quantity THEN RAISE EXCEPTION 'Quantidade vendida maior que a posicao atual'; END IF;
 gross:=round(p_quantity*p_unit_price,2);
 cash_amount:=CASE WHEN p_side='sale' THEN gross-round(p_fees,2) ELSE gross+round(p_fees,2) END;
 IF cash_amount<=0 THEN RAISE EXCEPTION 'Valor liquido invalido'; END IF;
 avg_cost:=coalesce(i.average_price,i.initial_amount/nullif(i.quantity,0),0);
 IF avg_cost IS NULL OR avg_cost<0 THEN RAISE EXCEPTION 'Informe o preco medio de compra antes de vender'; END IF;
 basis:=round(avg_cost*p_quantity,2);
 IF p_account IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_account AND user_id=uid) THEN RAISE EXCEPTION 'Conta invalida'; END IF;
  cash_type:=CASE WHEN p_side='sale' THEN 'income' ELSE 'expense' END;
  SELECT id INTO category_id FROM public.categories WHERE user_id=uid AND name='Movimentacao de investimentos'
   AND type=cash_type ORDER BY created_at LIMIT 1;
  IF category_id IS NULL THEN
   INSERT INTO public.categories(user_id,name,type,spending_area)
   VALUES(uid,'Movimentacao de investimentos',cash_type,'Investimentos') RETURNING id INTO category_id;
  END IF;
  PERFORM public.save_financial_transaction(jsonb_build_object(
   'type',cash_type,'amount',cash_amount,'date',p_date,'account_id',p_account,
   'category_id',category_id,'description',coalesce(nullif(btrim(p_description),''),i.name||' - '||CASE WHEN p_side='sale' THEN 'venda' ELSE 'compra' END),
   'client_request_id',p_request));
 END IF;
 new_quantity:=CASE WHEN p_side='sale' THEN i.quantity-p_quantity ELSE i.quantity+p_quantity END;
 new_value:=CASE WHEN p_side='sale' THEN
   CASE WHEN new_quantity=0 THEN 0 ELSE round(i.current_value*new_quantity/i.quantity,2) END
   ELSE round(i.current_value+gross,2) END;
 INSERT INTO public.investment_transactions(user_id,investment_id,account_id,type,amount,date,description,
  client_request_id,quantity,unit_price,fees,cost_basis,realized_gain)
 VALUES(uid,i.id,p_account,p_side,cash_amount,p_date,nullif(btrim(p_description),''),p_request,
  p_quantity,p_unit_price,round(p_fees,2),CASE WHEN p_side='sale' THEN basis ELSE cash_amount END,
  CASE WHEN p_side='sale' THEN cash_amount-basis ELSE NULL END) RETURNING * INTO result;
 IF backdated THEN
  UPDATE public.investment_valuations SET
    value=CASE WHEN source='quote' THEN round(price*new_quantity,2)
      ELSE round(value*new_quantity/i.quantity,2) END,
    quantity=CASE WHEN source='quote' THEN new_quantity ELSE quantity END,
    updated_at=now()
  WHERE investment_id=i.id AND date>p_date AND source IN ('quote','baseline');
  SELECT value INTO new_value FROM public.investment_valuations
    WHERE investment_id=i.id ORDER BY date DESC LIMIT 1;
 END IF;
 trade_day_value:=CASE WHEN backdated THEN round(p_unit_price*new_quantity,2) ELSE new_value END;
 PERFORM set_config('finance.valuation_rpc','yes',true);
 UPDATE public.investments SET quantity=new_quantity,current_value=new_value,
  average_price=CASE WHEN p_side='sale' THEN avg_cost
   ELSE (i.quantity*avg_cost+cash_amount)/new_quantity END,updated_at=now()
  WHERE id=i.id;
 PERFORM set_config('finance.valuation_rpc','',true);
 INSERT INTO public.investment_valuations(user_id,investment_id,date,value,source)
   VALUES(i.user_id,i.id,p_date,trade_day_value,'balance')
   ON CONFLICT(investment_id,date) DO UPDATE SET value=excluded.value,source='balance',
     price=NULL,quantity=NULL,quoted_at=NULL,updated_at=now();
 RETURN result;
END $$;

NOTIFY pgrst,'reload schema';
