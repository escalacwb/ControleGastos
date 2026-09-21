import { allocatedCashRows, dnaBreakdown } from "../lib/statements";
import { DNADetailModal } from "./DNADetailModal";
import { InvestmentPortfolio } from "./InvestmentPortfolio";
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
} from "react-native";
import { useData } from "./context";
import { useActions } from "./actions";
import { S, Page, Card, Kpi, MonthPicker, Empty, Chips, Button } from "./ui";
import {
  money,
  cents,
  today,
  monthRange,
  shiftMonth,
  monthLabel,
  formatDate,
  transactionType,
  inPeriod,
  reportingRows,
  totals,
  categoryTotals,
  outstanding,
  filterRows,
  spendingDNA,
  spendingArea,
  cardSchedule,
} from "../lib/finance";
import { supabase } from "../lib/supabase";
import { colors } from "../lib/theme";
const typeOptions = [
  { value: "all", label: "Todos" },
  { value: "expense", label: "Despesas" },
  { value: "income", label: "Receitas" },
  { value: "transfer", label: "Transferências" },
];
function Bars({ items, onPress }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return items.length ? (
    items.map((i) => (
      <TouchableOpacity
        key={i.id || i.name}
        style={{ gap: 8, minHeight: onPress ? 44 : 0 }}
        disabled={!onPress}
        onPress={() => onPress?.(i)}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={
          onPress ? `Ver gastos de ${i.name}: ${money(i.value)}` : undefined
        }
      >
        <View style={S.row}>
          <Text style={[S.text, { flex: 1 }]}>{i.name}</Text>
          <Text style={[S.text, { fontWeight: "600" }]}>{money(i.value)}</Text>
        </View>
        <View style={S.barTrack}>
          <View
            style={[S.bar, { width: Math.max(1, (i.value / max) * 100) + "%" }]}
          />
        </View>
      </TouchableOpacity>
    ))
  ) : (
    <Empty title="Sem gastos neste período" />
  );
}
function TransactionRow({ item, actions = true }) {
  const { rows } = useData(),
    a = useActions(),
    type = transactionType(item.type);
  const category = rows("categories").find((c) => c.id === item.category_id),
    account = rows("accounts").find((c) => c.id === item.account_id),
    card = rows("credit_cards").find((c) => c.id === item.credit_card_id);
  return (
    <View style={S.transaction}>
      <View style={S.row}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[S.text, { fontWeight: "600" }]}>
            {item.description || "Sem descrição"}
          </Text>
          <Text style={S.muted}>
            {formatDate(item.date)} ·{" "}
            {card ? card.bank_name : account?.name || "Sem conta"}
          </Text>
        </View>
        <Text
          style={[
            S.text,
            { fontWeight: "700" },
            type === "income"
              ? S.positive
              : type === "expense"
                ? S.negative
                : null,
          ]}
        >
          {type === "income" ? "+ " : type === "expense" ? "− " : ""}
          {money(item.amount)}
        </Text>
      </View>
      <Text style={S.muted}>
        {type === "transfer"
          ? "Transferência → " +
            (rows("accounts").find((x) => x.id === item.transfer_to_account_id)
              ?.name || "Conta")
          : category?.name || "Sem categoria"}
        {card ? " · detalhe do cartão · fora das saídas" : ""}
      </Text>
      {actions && (
        <View style={S.wrap}>
          <Button secondary onPress={() => a.transaction(item)}>
            Editar
          </Button>
          <Button secondary onPress={() => a.transaction(item, true)}>
            Repetir
          </Button>
          <TouchableOpacity
            style={{ padding: 12 }}
            onPress={() => a.deleteTransaction(item)}
          >
            <Text style={S.error}>Excluir</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
export function Overview() {
  const { rows } = useData(),
    a = useActions();
  const [month, setMonth] = useState(today().slice(0, 7));
  const range = monthRange(month),
    cash = allocatedCashRows(
      rows("transactions"),
      rows("card_payments"),
      rows("billing_cycles"),
    ),
    monthly = inPeriod(cash, range.start, range.end),
    sum = totals(monthly),
    debt = rows("billing_cycles")
      .filter((c) => outstanding(c) > 0)
      .sort((x, y) => x.due_date.localeCompare(y.due_date)),
    balance =
      rows("accounts")
        .filter((x) => !["credit", "credit_card"].includes(x.type))
        .reduce((n, x) => n + cents(x.balance), 0) / 100;
  const trend = Array.from({ length: 6 }, (_, i) => {
    const m = shiftMonth(month, i - 5),
      r = monthRange(m);
    return {
      name: monthLabel(m),
      value: totals(inPeriod(cash, r.start, r.end)).expense,
    };
  });
  return (
    <Page
      title="Seu mês, com clareza"
      subtitle="O dinheiro que entra, o que sai e o que merece atenção."
    >
      <MonthPicker value={month} onChange={setMonth} />
      <Kpi
        primary
        title="Saldo disponível agora"
        value={balance}
        note="Saldo atual das contas"
      />
      <View style={{ gap: 12 }}>
        <Kpi
          title="Saídas do mês"
          value={sum.expense}
          note="Despesas e pagamentos das contas"
        />
        <Kpi title="Entradas do mês" value={sum.income} />
      </View>
      <Button onPress={() => a.transaction()}>＋ Novo lançamento</Button>
      <Card title="Para onde vai o dinheiro?">
        <Bars items={categoryTotals(monthly, rows("categories")).slice(0, 7)} />
        <Text style={S.muted}>
          Compras no cartão ficam separadas nos relatórios. Aqui entram os
          pagamentos das faturas.
        </Text>
      </Card>
      <Card title="Faturas a pagar">
        {debt.length ? (
          debt.slice(0, 4).map((c) => (
            <View key={c.id} style={{ gap: 10 }}>
              <View style={S.row}>
                <View style={{ flex: 1 }}>
                  <Text style={S.text}>
                    {rows("credit_cards").find((x) => x.id === c.credit_card_id)
                      ?.bank_name || "Cartão"}
                  </Text>
                  <Text style={c.due_date < today() ? S.error : S.muted}>
                    {formatDate(c.due_date)}
                    {c.due_date < today() ? " · Vencida" : ""}
                  </Text>
                </View>
                <Text style={S.text}>{money(outstanding(c))}</Text>
              </View>
              <Button secondary onPress={() => a.pay(c)}>
                Registrar pagamento
              </Button>
            </View>
          ))
        ) : (
          <Empty title="Nenhuma fatura em aberto" />
        )}
      </Card>
      <Card title="Últimos lançamentos">
        {inPeriod(rows("transactions"), range.start, range.end)
          .sort(
            (x, y) =>
              y.date.localeCompare(x.date) ||
              String(y.created_at).localeCompare(String(x.created_at)),
          )
          .slice(0, 5)
          .map((t) => (
            <TransactionRow key={t.id} item={t} />
          ))}
        {!monthly.length && (
          <Text style={S.muted}>Os movimentos deste mês aparecerão aqui.</Text>
        )}
      </Card>
      <Card title="Saídas nos últimos 6 meses">
        <Bars items={trend} />
      </Card>
    </Page>
  );
}
export function Transactions() {
  const { rows, loading, error, refresh } = useData(),
    a = useActions();
  const [month, setMonth] = useState(today().slice(0, 7)),
    [all, setAll] = useState(false),
    [query, setQuery] = useState(""),
    [type, setType] = useState("all"),
    [account, setAccount] = useState("all");
  const range = all ? {} : monthRange(month);
  const list = useMemo(
    () =>
      filterRows(
        rows("transactions"),
        { ...range, query, type, account },
        rows("accounts"),
        rows("categories"),
      ),
    [
      rows("transactions"),
      rows("accounts"),
      rows("categories"),
      month,
      all,
      query,
      type,
      account,
    ],
  );
  return (
    <View style={S.page}>
      <FlatList
        data={list}
        keyExtractor={(x) => x.id}
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={7}
        contentContainerStyle={S.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => refresh().catch(() => {})}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 15 }}>
            <Text style={S.eyebrow}>SEU HISTÓRICO</Text>
            <Text style={S.title}>Lançamentos</Text>
            {!!error && <Text style={S.error}>{error}</Text>}
            <MonthPicker value={month} onChange={setMonth} />
            <Chips
              value={all ? "all" : "month"}
              onChange={(v) => setAll(v === "all")}
              options={[
                { value: "month", label: "Mês selecionado" },
                { value: "all", label: "Todo o histórico" },
              ]}
            />
            <TextInput
              style={S.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar descrição, conta ou categoria"
            />
            <Chips value={type} options={typeOptions} onChange={setType} />
            <Chips
              value={account}
              options={[
                { value: "all", label: "Todas as contas" },
                ...rows("accounts").map((x) => ({
                  value: x.id,
                  label: x.name,
                })),
              ]}
              onChange={setAccount}
            />
            <View style={S.row}>
              <Text style={S.muted}>{list.length} lançamentos</Text>
              <Button secondary onPress={() => a.exportCsv(list)}>
                Exportar CSV
              </Button>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Empty
            title="Nenhum lançamento encontrado"
            detail="Ajuste os filtros ou registre seu primeiro gasto."
          />
        }
        renderItem={({ item }) => <TransactionRow item={item} />}
      />
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Novo lançamento"
        style={S.fab}
        onPress={() => a.transaction()}
      >
        <Text style={S.buttonText}>＋ Lançar</Text>
      </TouchableOpacity>
    </View>
  );
}
export function Reports() {
  const { rows } = useData(),
    a = useActions();
  const [detail, setDetail] = useState(null);
  const openDetails = (area, selectedMonth) =>
    setDetail({
      ...dnaBreakdown(
        rows("transactions"),
        rows("installments"),
        rows("categories"),
        rows("card_payments"),
        rows("billing_cycles"),
        { basis, area, month: selectedMonth },
      ),
      area,
      month: selectedMonth,
      basis,
    });
  const [month, setMonth] = useState(today().slice(0, 7)),
    [basis, setBasis] = useState("cash"),
    [view, setView] = useState("report"),
    [count, setCount] = useState(6);
  const source =
      basis === "card"
        ? cardSchedule(rows("transactions"), rows("installments"))
        : allocatedCashRows(
            rows("transactions"),
            rows("card_payments"),
            rows("billing_cycles"),
          ),
    r = monthRange(month),
    list = inPeriod(source, r.start, r.end),
    sum = totals(list),
    dna = spendingDNA(source, rows("categories"), month, count);
  return (
    <Page
      title="Entenda seus gastos"
      subtitle="Números para decidir melhor no dia a dia."
    >
      <DNADetailModal
        detail={detail}
        onClose={() => setDetail(null)}
        rows={rows}
      />
      <MonthPicker value={month} onChange={setMonth} />
      <Chips
        value={view}
        onChange={setView}
        options={[
          { value: "report", label: "Relatório do mês" },
          { value: "dna", label: "DNA dos gastos" },
        ]}
      />
      <Chips
        value={basis}
        onChange={setBasis}
        options={[
          { value: "cash", label: "Saídas das contas" },
          { value: "card", label: "Compras e parcelas no cartão" },
        ]}
      />
      <Text style={S.muted}>
        {basis === "cash"
          ? "Inclui pagamentos de faturas. Compras no cartão não são somadas novamente."
          : "Mostra compras e parcelas detalhadas por data. Faturas sem itens lançados não aparecem aqui."}
      </Text>
      {view === "report" ? (
        <>
          <Kpi
            primary
            title={
              basis === "cash" ? "Saídas do mês" : "Compras e parcelas do mês"
            }
            value={sum.expense}
          />
          {basis === "cash" && (
            <>
              <Kpi title="Entradas" value={sum.income} />
              <Kpi title="Resultado do mês" value={sum.balance} />
            </>
          )}
          <Card title="Gastos por categoria">
            <Bars items={categoryTotals(list, rows("categories"))} onPress={g=>setDetail({...dnaBreakdown(rows('transactions'),rows('installments'),rows('categories'),rows('card_payments'),rows('billing_cycles'),{basis,categoryId:g.id,start:r.start,end:r.end}),categoryName:g.name,start:r.start,end:r.end,basis})} />
          </Card>
          <Button secondary onPress={() => a.exportCsv(list)}>
            Exportar este relatório
          </Button>
          <Card title={`${list.length} movimentos no período`}>
            {list.slice(0, 20).map((t) => (
              <TransactionRow key={t.id} item={t} actions={false} />
            ))}
            {list.length > 20 && (
              <Text style={S.muted}>
                Mostrando 20 registros. A exportação inclui todos.
              </Text>
            )}
            {!list.length && <Empty />}
          </Card>
        </>
      ) : (
        <>
          <Chips
            value={String(count)}
            onChange={(v) => setCount(Number(v))}
            options={[3, 6, 12].map((n) => ({
              value: String(n),
              label: n + " meses",
            }))}
          />
          <Kpi
            primary
            title="Custo médio mensal"
            value={dna.average}
            note={`${dna.months.length} meses completos anteriores ao mês selecionado`}
          />
          <Kpi
            title="Parte habitual estimada"
            value={dna.habitual}
            note="Áreas com gastos em pelo menos 2/3 dos meses"
          />
          <View style={S.note}>
            <Text style={S.muted}>
              A média inclui meses sem gastos. Habitual indica frequência no
              histórico, não uma conta fixa contratada. O mês em andamento tem
              comparação parcial. Ajuste as áreas em Categorias.
            </Text>
            {dna.months.length < 3 && (
              <Text style={S.error}>
                Histórico curto: use pelo menos três meses completos para
                estimar hábitos.
              </Text>
            )}
          </View>
          {dna.areas.map((g) => (
            <Card key={g.area} title={g.area}>
              <Text style={S.value}>
                {money(g.average)}
                <Text style={S.muted}> / mês</Text>
              </Text>
              <Text style={S.muted}>
                {g.recurring ? "Habitual · " : ""}
                {g.frequency} de {dna.months.length} meses com gastos
              </Text>
              <Text style={S.text}>No mês: {money(g.current)}</Text>
              <Text style={S.muted}>{g.categories.join(" · ")}</Text>
              <Bars
                onPress={(item) => openDetails(g.area, item.month)}
                items={g.monthly.map((v, i) => ({
                  month: dna.months[i],
                  name: monthLabel(dna.months[i]),
                  value: v,
                }))}
              />
              <Text style={S.muted}>
                Toque em uma barra para ver os gastos.
              </Text>
            </Card>
          ))}
          {!dna.areas.length && (
            <Empty
              title="Seu histórico começa aqui"
              detail="As médias aparecem conforme os gastos são registrados."
            />
          )}
        </>
      )}
    </Page>
  );
}
export function Cards() {
  const { rows } = useData(),
    a = useActions();
  const [showPaid, setShowPaid] = useState(false);
  return (
    <Page
      title="Cartões e faturas"
      subtitle="Acompanhe vencimentos e registre pagamentos com uma só ação."
    >
      <Button onPress={() => a.card()}>＋ Novo cartão</Button>
      {rows("credit_cards").map((c) => {
        const cycles = rows("billing_cycles")
          .filter((x) => x.credit_card_id === c.id)
          .sort((x, y) => y.due_date.localeCompare(x.due_date));
        return (
          <Card key={c.id} title={c.bank_name + " · " + c.last_four_digits}>
            <Text style={S.muted}>
              {c.holder_name} · Fecha dia {c.closing_day} · Vence dia{" "}
              {c.due_day}
            </Text>
            <Text style={S.text}>
              Faturas em aberto:{" "}
              {money(cycles.reduce((n, x) => n + outstanding(x), 0))}
            </Text>
            <Text style={S.muted}>
              Limite informado: {money(c.credit_limit)}
            </Text>
            <View style={S.wrap}>
              <Button secondary onPress={() => a.card(c)}>
                Editar cartão
              </Button>
              <Button onPress={() => a.statement(c, null, true, true)}>
                Importar fatura do mês
              </Button>
              <Button secondary onPress={() => a.statement(c)}>
                Registrar sem arquivo
              </Button>
            </View>
            {cycles
              .filter((x) => showPaid || outstanding(x) > 0)
              .map((x) => (
                <View
                  key={x.id}
                  style={{
                    gap: 10,
                    borderTopWidth: 1,
                    borderColor: colors.border,
                    paddingTop: 14,
                  }}
                >
                  <View style={S.row}>
                    <View>
                      <Text style={S.text}>{formatDate(x.due_date)}</Text>
                      <Text
                        style={
                          x.due_date < today() && outstanding(x) > 0
                            ? S.error
                            : S.muted
                        }
                      >
                        {outstanding(x) === 0
                          ? "Paga"
                          : x.due_date < today()
                            ? "Vencida"
                            : "Em aberto"}
                      </Text>
                    </View>
                    <View>
                      <Text style={S.text}>{money(outstanding(x))}</Text>
                      <Text style={S.muted}>Total {money(x.total_spent)}</Text>
                    </View>
                  </View>
                  <Button secondary onPress={() => a.statement(c, x)}>
                    Detalhar / anexar
                  </Button>
                  {outstanding(x) > 0 && (
                    <Button secondary onPress={() => a.pay(x)}>
                      Pagar fatura
                    </Button>
                  )}
                </View>
              ))}
          </Card>
        );
      })}
      {!rows("credit_cards").length && (
        <Empty
          title="Organize seus cartões"
          detail="Cadastre o cartão e informe a fatura para acompanhar o vencimento."
        />
      )}
      <Button secondary onPress={() => setShowPaid(!showPaid)}>
        {showPaid ? "Ocultar faturas pagas" : "Mostrar também as faturas pagas"}
      </Button>
    </Page>
  );
}
export function More() {
  const { rows, user, workspace } = useData(),
    a = useActions();
  const [section, setSection] = useState("menu");
  const pending = rows("pending_transactions").filter(
    (p) => p.status === "pending_review",
  );
  const titles = {
    menu: "Sua organização",
    accounts: "Contas",
    categories: "Categorias",
    investments: "Investimentos",
    pending: "Conferir lançamentos",
  };
  return (
    <Page
      title={titles[section]}
      subtitle={
        section === "menu"
          ? "Tudo o que dá suporte à sua rotina financeira."
          : undefined
      }
    >
      {section !== "menu" && (
        <Button secondary onPress={() => setSection("menu")}>
          ‹ Voltar à organização
        </Button>
      )}
      {section === "menu" ? (
        <>
          <Card title="Ajustes da sua rotina">
            {[
              ["accounts", "Contas e saldos"],
              ["categories", "Categorias e áreas do DNA"],
              ["investments", "Investimentos"],
              ["pending", `Conferir lançamentos (${pending.length})`],
            ].map(([v, label]) => (
              <Button key={v} secondary onPress={() => setSection(v)}>
                {label} →
              </Button>
            ))}
          </Card>
          <Card title="Seus dados">
            <Button secondary onPress={a.importCsv}>
              Importar extrato CSV
            </Button>
            <Button secondary onPress={() => a.exportCsv(rows("transactions"))}>
              Exportar todos os lançamentos
            </Button>
            <Text style={S.muted}>
              A importação permite mapear colunas e conferir os registros antes
              de salvar.
            </Text>
          </Card>
          <Card title="Sua sessão">
            <Text style={S.text}>
              {workspace?.shared
                ? "Espaço compartilhado da família"
                : "Espaço pessoal"}
            </Text>
            <Text style={S.text}>{user.email}</Text>
            <Text style={S.muted}>Em Casa · versão 2.2.4</Text>
            <Button
              secondary
              onPress={() =>
                Alert.alert(
                  "Sair da conta?",
                  "Você poderá entrar novamente com seu e-mail e senha.",
                  [
                    { text: "Cancelar", style: "cancel" },
                    {
                      text: "Sair",
                      onPress: () =>
                        supabase.auth
                          .signOut({ scope: "local" })
                          .then(({ error }) => {
                            if (error)
                              Alert.alert("Falha ao sair", error.message);
                          }),
                    },
                  ],
                )
              }
            >
              Sair neste aparelho
            </Button>
          </Card>
        </>
      ) : section === "accounts" ? (
        <>
          <Button onPress={() => a.account()}>＋ Nova conta</Button>
          {rows("accounts").map((x) => (
            <Card key={x.id} title={x.name}>
              <Text style={S.value}>{money(x.balance)}</Text>
              <View style={S.wrap}>
                <Button secondary onPress={() => a.account(x)}>
                  Editar / conciliar
                </Button>
                <Button secondary onPress={() => a.deleteItem("accounts", x)}>
                  Excluir
                </Button>
              </View>
            </Card>
          ))}
        </>
      ) : section === "categories" ? (
        <>
          <Button onPress={() => a.category()}>＋ Nova categoria</Button>
          {rows("categories")
            .sort((x, y) => x.name.localeCompare(y.name))
            .map((x) => (
              <Card key={x.id} title={x.name}>
                <Text style={S.muted}>
                  {transactionType(x.type) === "income" ? "Receita" : "Despesa"}{" "}
                  · {spendingArea(x)}
                </Text>
                <View style={S.wrap}>
                  <Button secondary onPress={() => a.category(x)}>
                    Editar
                  </Button>
                  <Button
                    secondary
                    onPress={() => a.deleteItem("categories", x)}
                  >
                    Excluir
                  </Button>
                </View>
              </Card>
            ))}
        </>
      ) : section === "investments" ? (
        <InvestmentPortfolio />
      ) : (
        <>
          {pending.map((p) => (
            <Card key={p.id} title="Sugestão recebida">
              <Text style={S.text}>{p.raw_message}</Text>
              <View style={S.wrap}>
                <Button onPress={() => a.transaction(null, false, p)}>
                  Conferir e lançar
                </Button>
                <Button secondary onPress={() => a.rejectPending(p)}>
                  Descartar
                </Button>
              </View>
            </Card>
          ))}
          {!pending.length && (
            <Empty
              title="Tudo conferido"
              detail="Novas sugestões vinculadas à sua conta aparecem aqui."
            />
          )}
        </>
      )}
    </Page>
  );
}
