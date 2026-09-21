# Investimentos

Avaliações de saldo são fechamentos por dia. A atualização de uma mesma data corrige o fechamento; uma data antiga não substitui o saldo mais recente. As contas bancárias não são movimentadas por avaliações.

Os investimentos anteriores à migração começam com o saldo disponível no dia da migração. Não atribuímos esse valor retroativamente à data de compra. Para completar períodos anteriores, informe saldos de extratos com as datas correspondentes.

Ganho = saldo final − saldo inicial − aportes + resgates + proventos recebidos. A rentabilidade percentual é uma estimativa pelo método Modified Dietz (capital ponderado pelas datas dos fluxos). Rendimento incorporado já está no saldo final. Períodos sem avaliações suficientes não exibem rentabilidade. A carteira só agrega resultados com as mesmas datas inicial e final; cada investimento mantém seu resultado individual.

## Cotações B3

O cadastro aceita ticker, quantidade atual e preço médio. A função `supabase/functions/investment-quotes/index.ts` consulta a brapi com autenticação do usuário, filtra o espaço financeiro e preserva os saldos em caso de indisponibilidade. O segredo `BRAPI_TOKEN` deve ficar no Supabase, nunca no site ou APK.

Ativação administrativa: configurar `BRAPI_TOKEN` e publicar a função `investment-quotes` no projeto Supabase. A publicação desta função exige acesso de gerenciamento do projeto, além das credenciais de banco. Sem essa configuração, o botão informa indisponibilidade e continua sendo possível atualizar os saldos manualmente.

Documentação do provedor: https://brapi.dev/docs/acoes . Quantidades precisam ser atualizadas após compras, vendas ou desdobramentos. O provedor não sincroniza a custódia nem a quantidade de papéis.
