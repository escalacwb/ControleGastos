# Investimentos 2.2.1

O valor de referencia cadastrado representa o valor da compra. O ganho desde a compra usa valor atual menos compra, desconta aportes posteriores, soma resgates e proventos. O percentual desde a compra usa o capital aplicado (compra mais aportes). O total da carteira pode incluir investimentos comprados em datas diferentes.

A lista mostra compra, valor atual e ganho. Ver graficos abre um modal com comparacao, evolucao do saldo, evolucao do ganho e cotacao de mercado. Os periodos ficam dentro desse modal.

Avaliacoes sao fechamentos diarios. Corrigir uma data substitui seu fechamento; registrar saldo antigo nao sobrescreve o atual. Nao movimenta contas bancarias.

## Mercado ativo

As funcoes SQL get_investment_market e refresh_market_investments consultam a interface publica de graficos do Yahoo Finance pelo Supabase (extensao http), com cache de 15 minutos por papel e periodo. Nao dependem de chave brapi ou deploy de Edge Function. Esta interface publica pode ficar indisponivel; falhas preservam os saldos.

Somente usuarios autenticados consultam investimentos de seu proprio espaco familiar. Codigos sao validados, o host de consulta e fixo e existe timeout. A data da cotacao e exibida; pode haver atraso.

A atualizacao da posicao exige quantidade de papeis. Sem quantidade, o grafico de mercado continua disponivel e o saldo nao e alterado. O sistema nao presume quantidade com base em cotacao historica, nem inventa compras ou vendas. Com quantidade preenchida, atualiza ao abrir investimentos ou no botao Atualizar pela cotacao. Dividendos, desdobramentos e alteracoes de quantidade precisam ser registrados.
