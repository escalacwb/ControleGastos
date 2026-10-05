# Investimentos 2.2.10

Em ações e Tesouro, use **Comprar** ou **Vender** na posição. Informe quantidade, preço por unidade, custos e data. A venda reduz a quantidade e o saldo atual; venda integral zera a posição sem apagar avaliações e transações. O valor líquido e o ganho realizado ficam no Histórico. Quando o preço médio não foi informado, a primeira venda usa o custo inicial dividido pela quantidade atual como base estimada; confira o preço médio no cadastro antes de vender se houve compras anteriores não registradas.

O lançamento na conta é opcional. Se o dinheiro já entrou em outro lançamento, deixe **Não, já registrei em outro lugar** para não duplicar o saldo. Se ainda não entrou, escolha a conta para registrar o líquido da venda uma única vez. Compras seguem a mesma regra para a saída. Fundos e outros investimentos manuais continuam com Aporte/Resgate por valor; o saldo pode ser atualizado manualmente. Operações gravadas não podem ser editadas pelo lançamento bancário isolado, pois isso quebraria a quantidade da posição.

O cadastro separa ações/papéis da B3, Tesouro Direto e fundos/outros. Ações usam código B3 e quantidade inteira; Tesouro usa tipo de título, vencimento exato e quantidade fracionária. O saldo atual é a quantidade multiplicada pela cotação datada, sem alterar contas bancárias. Enquanto faltarem esses dados, os saldos antigos ficam preservados e a tela indica o que preencher. O Trend Investback permanece manual até haver identificação da classe/CNPJ e fonte de cotas confiável.

O Tesouro utiliza o CSV diário oficial do Tesouro Transparente, filtrado pelo tipo e vencimento do título. O PU Base Manhã é o preço de marcação a mercado da posição; a cotação pode estar defasada nos fins de semana e feriados. A fonte é consultada ao abrir investimentos ou no botão de atualização, com cache no banco. Caso o preço do título não esteja publicado recentemente, o saldo é mantido e o motivo é exibido. Impostos e taxas pessoais não são estimados.

Os saldos anteriores e históricos manuais não são substituídos por estimativas. Para atualizar uma posição existente, informe a quantidade real e corrija a data de compra caso esteja errada. Acompanhamento de rentabilidade com compras e resgates em dias diferentes exige registrar essas movimentações. A ação só é atualizada enquanto o aplicativo é usado; não existe coleta em segundo plano com o aplicativo fechado.

O valor de referencia cadastrado representa o valor da compra. O ganho desde a compra usa valor atual menos compra, desconta aportes posteriores, soma resgates e proventos. O percentual desde a compra usa o capital aplicado (compra mais aportes). O total da carteira pode incluir investimentos comprados em datas diferentes.

A lista mostra compra, valor atual e ganho. Ver graficos abre um modal com comparacao, evolucao do saldo, evolucao do ganho e cotacao de mercado. Os periodos ficam dentro desse modal.

Avaliacoes sao fechamentos diarios. Corrigir uma data substitui seu fechamento; registrar saldo antigo nao sobrescreve o atual. Nao movimenta contas bancarias.

## Mercado ativo

As funcoes SQL get_investment_market e refresh_market_investments consultam a interface publica de graficos do Yahoo Finance pelo Supabase (extensao http), com cache de 15 minutos por papel e periodo. Nao dependem de chave brapi ou deploy de Edge Function. Esta interface publica pode ficar indisponivel; falhas preservam os saldos.

Somente usuarios autenticados consultam investimentos de seu proprio espaco familiar. Codigos sao validados, o host de consulta e fixo e existe timeout. A data da cotacao e exibida; pode haver atraso.

A atualizacao da posicao exige quantidade de papeis. Sem quantidade, o grafico de mercado continua disponivel e o saldo nao e alterado. O sistema nao presume quantidade com base em cotacao historica, nem inventa compras ou vendas. Com quantidade preenchida, atualiza ao abrir investimentos ou no botao Atualizar pela cotacao. Dividendos, desdobramentos e alteracoes de quantidade precisam ser registrados.
