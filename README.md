# Em Casa — finanças da família

### Correção 2.1.1 — conferir pagamentos antes de importar

A importação consulta pagamentos manuais e vinculados por cartão, período e valor. Um pagamento compatível e único é sugerido para vínculo; valores com até cinco centavos de diferença são conciliados preservando o lançamento original. Havendo mais de um candidato, é necessário escolher. A data e a conta do pagamento original são mantidas, sem outro débito.

Importar não cria mais um pagamento por padrão. Para uma nova saída, escolha **Registrar pagamento agora** e confirme que ela ainda não foi lançada. O banco bloqueia pagamentos novos quando encontra pagamentos manuais candidatos, inclusive em clientes antigos. Faturas já pagas recebem somente o detalhamento. Aplique `20260916_statement_payment_guard.sql` depois de `20260916_statement_details.sql`. Android 2.1.1, código 5.

### Versão 2.1.0 — faturas com compras detalhadas

Em **Cartões → Importar fatura do mês**, no card do próprio cartão, escolha CSV ou PDF: o cartão já vem definido e o histórico de pagamentos é conferido. Confira o vínculo sugerido ou escolha salvar apenas os detalhes. As compras aparecem em Lançamentos como detalhes do cartão, fora do total de saídas. O pagamento é a única despesa que movimenta a conta. Em uma fatura existente, **Detalhar / anexar** permite incluir o arquivo depois, inclusive quando já estiver paga.

Use **Já lancei o pagamento** para vincular uma despesa existente sem descontar o saldo novamente. Nos relatórios, gráficos e DNA, os pagamentos vinculados são distribuídos proporcionalmente entre as categorias dos itens; pagamentos parciais preservam os centavos. Valores ainda não detalhados ficam sem categoria. Se os detalhes excederem o total ou houver uma categoria com crédito líquido, a distribuição aguarda conciliação e o pagamento permanece inteiro.

Nubank e XP têm leitura de CSV; PDFs com texto incluem o formato CAIXA de duas colunas, créditos e parcelas. PDFs digitalizados, protegidos por senha ou com formatos não reconhecidos exigem CSV ou revisão manual. A leitura ocorre no dispositivo com PDF.js, sem serviço externo. Até 5 MB, 50 páginas e 1.000 itens. Confira a referência, vencimento, categorias e total antes de salvar. Parcelas importadas representam somente a parcela cobrada, sem criar novamente as futuras.

Pagamentos anteriores dentro do arquivo são excluídos dos itens. Repetições legítimas dentro do CSV são preservadas; reimportar o mesmo arquivo não duplica itens. Uma fatura aceita um arquivo de origem: outro arquivo é bloqueado para evitar duplicidade entre formatos. O anexo original fica disponível somente no espaço autenticado da família. Ajustes de categoria podem ser feitos em Lançamentos e são reaproveitados para o mesmo estabelecimento em próximas importações.

Aplique `20260916_statement_details.sql` depois das duas migrações anteriores. A importação, o anexo e o pagamento são atômicos. Android: versão 2.1.0, código 4, mesma assinatura e pacote. Testes: `node --test tests/*.test.mjs`; a suíte de interface aceita arquivos privados opcionais via `STATEMENT_FIXTURES_JSON`, sem publicá-los.

Aplicativo web estático e Android para acompanhar contas, gastos e faturas com o mesmo banco Supabase. A versão 2.0 organiza a rotina em lançamentos, cartões, relatórios e médias por área.

### Correção 2.0.1 — espaço compartilhado

O login de um membro da família agora resolve o titular do espaço antes de consultar ou salvar dados. Os dois logins autorizados enxergam e operam o mesmo histórico, sem copiar lançamentos. A interface identifica o espaço compartilhado. As operações atômicas e a proteção contra edições simultâneas usam o mesmo titular para ambos.

O administrador configura o vínculo em `finance_memberships`; usuários do aplicativo não podem conceder acesso por conta própria. A migração `20260916_family_workspace.sql` deve ser aplicada depois de `20260915_financial_integrity.sql`. Os registros financeiros existentes são preservados. O Android precisa ser atualizado para 2.0.1 para consultar o espaço compartilhado.

## O que mudou

- Interface responsiva; no celular, navegação com cinco entradas e menu Mais.
- Histórico completo carregado em páginas de 500, evitando o antigo corte em mil registros. A lista web apresenta 30 por página; o Android usa lista virtualizada.
- Busca por descrição, conta e categoria; filtros; repetição de lançamento; edição e exclusão com estorno consistente.
- Lançamentos e seus efeitos nas contas salvos numa única transação. Repetir a mesma solicitação não debita duas vezes. Alterações simultâneas são detectadas.
- Faturas com pagamento parcial ou integral. Excluir o pagamento também estorna a conta e a fatura.
- Parcelamentos preservam todos os centavos e ajustam corretamente datas no fim do mês.
- Importação CSV com mapeamento de colunas, prévia, descarte de repetições exatas e gravação integral do lote; exportação de relatórios.
- Contas com saldo inicial e conciliação manual; categorias com área do gasto; investimentos com aportes, resgates e rendimentos.
- Login persistente no Android e atualização ao voltar ao aplicativo, sem consultas contínuas em segundo plano.

## Como ler os números

**Movimentação das contas:** dinheiro que efetivamente entra ou sai. Transferências internas não são despesas; pagamento de fatura é saída. Compras no cartão ficam fora desta visão.

**Compras e parcelas no cartão:** detalhamento por categoria e data da parcela. Não inclui novamente o pagamento da fatura. Não some essa visão à movimentação das contas: são duas formas de observar o mesmo dinheiro.

**DNA dos gastos:** média das despesas por área nos 3, 6 ou 12 meses anteriores ao mês selecionado, a partir do primeiro mês com histórico. Inclui meses sem despesa no denominador. Uma área é habitual se teve gastos em pelo menos dois terços dos meses, com pelo menos três meses observados. Isso é uma estimativa histórica, não uma obrigação fixa contratada. Um histórico incompleto produz médias incompletas. Comparações com o mês em andamento são parciais.

Faturas são informadas pelo usuário. Registrar compras organiza o detalhamento, mas não substitui automaticamente o total do extrato da operadora. Saldo disponível e limite informado não são integração bancária.

## Estrutura e execução

- `index.html`, `ui.css`, `main.mjs`: aplicação web, sem etapa de build.
- `finance.mjs`: cálculos puros compartilhados com `mobile/src/lib/finance.js`.
- `vendor/`: Supabase JS 2.99.0 distribuído localmente.
- `migrations/`: funções transacionais e índices do banco.
- `tests/`: testes dos cálculos (`node --test tests/finance.test.mjs`).
- `mobile/`: projeto Expo/React Native; execute `npm ci`, depois `npm start`.

Sirva a pasta por HTTP para testar os módulos JavaScript. O site pode ser publicado diretamente pelo GitHub Pages a partir da raiz da branch principal. O Supabase deve conter as tabelas do sistema original e a migração `migrations/20260915_financial_integrity.sql`, aplicada em transação após backup.

A configuração pública contém apenas a chave `anon`. Chaves administrativas, conexões PostgreSQL, backups e chaves de assinatura não pertencem ao repositório.

## Android

Versão 2.0.1, código 3, pacote `com.awfinance.app`, Android 7 ou superior. O APK entregue usa a assinatura anterior para permitir atualização sobre o app existente; não desinstale a versão antiga para atualizar. O servidor mantém o histórico, mas confirme o acesso à conta antes de trocar de aparelho.

O projeto original usava uma assinatura de desenvolvimento, preservada nesta atualização. A chave está somente no backup local protegido. Uma compilação em outro computador deve restaurar essa mesma chave em `mobile/android/app/debug.keystore` depois do prebuild e antes do Gradle. Não publique a chave. Trocar a assinatura impede a atualização direta de instalações existentes.

Para gerar localmente no ambiente Windows original: `npm ci` e `npm run apk:local`. O script verifica falhas e entrega `android/app/build/outputs/apk/release/app-release.apk`. Outros computadores precisam ajustar os caminhos de JDK/SDK do script.

## Limites desta versão

- É necessário estar conectado para salvar. Não há fila de alterações offline.
- CSV admite até 500 linhas e 2 MB por arquivo; duplicatas são identificadas por data, descrição, valor, tipo e destino, não por inteligência artificial.
- Pendências do Telegram dependem de mensagens e vínculos já criados pela integração externa. GitHub Pages não executa webhooks de servidor.
- Contas de login distintas permanecem separadas até configurar um compartilhamento expressamente confirmado. Nenhum histórico é transferido automaticamente.
- Saldos antigos foram preservados. Se já estavam divergentes do banco, use a conciliação; não é possível deduzir um saldo bancário real apenas dos lançamentos.

## Validação

Foram exercitados cálculos de moeda/data/parcelamento, transações de banco revertidas ao final, importação integral, edição concorrente, estorno de faturas/investimentos, isolamento entre usuários, navegação web e histórico com mais de mil registros. Os testes de interface usam dados fictícios e não geram lançamentos de teste na família. A validação Android inclui compilação nativa e execução em emulador; não substitui a conferência no aparelho físico usado diariamente.
