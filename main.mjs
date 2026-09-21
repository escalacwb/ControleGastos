import { allocatedCashRows, dnaBreakdown } from "./statements.mjs";
import { openStatementEditor } from "./statement-ui.mjs";
import { investmentUI } from "./investment-ui.mjs";
import {
  investmentPeriods,
  portfolioPerformance,
  portfolioHistory,
  periodStart,
  refreshInvestmentQuotes,
  quoteRefreshDue,
} from "./investments.mjs";
let investmentPeriod = "all";
let investmentQuoteStatus = "";
import {
  money,
  cents,
  parseMoney,
  today,
  dateISO,
  validDate,
  formatDate,
  monthRange,
  shiftMonth,
  monthLabel,
  normalize,
  transactionType,
  inPeriod,
  reportingRows,
  totals,
  categoryTotals,
  outstanding,
  parseCsv,
  csvCell,
  csvDate,
  filterRows,
  spendingDNA,
  spendingArea,
  cardSchedule,
} from "./finance.mjs";

const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  home: "M3 10 12 3l9 7M5 9v12h14V9M9 21v-8h6v8",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  card: "M3 5h18v14H3zM3 9h18M6 15h4",
  chart: "M4 20V4M4 20h17M8 16v-5M13 16V7M18 16V3",
  wallet: "M3 5h16v15H3zM3 5l13-3v3M14 11h7v5h-7z",
  tag: "M3 3h8l10 10-8 8L3 11zM7 7h.01",
  leaf: "M20 3C8 3 3 7 4 14c1 6 9 7 13 1 3-4 3-12 3-12ZM3 21l12-12",
  inbox: "M4 4h16l2 12v4H2v-4L4 4ZM2 16h6l2 2h4l2-2h6",
  upload: "M12 16V3M7 8l5-5 5 5M3 15v6h18v-6",
  edit: "m16 3 5 5-12 12-6 1 1-6L16 3ZM14 5l5 5",
  trash: "M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  arrow: "M4 12h16M14 6l6 6-6 6",
  down: "M12 3v18M5 14l7 7 7-7",
  up: "M12 21V3M5 10l7-7 7 7",
  dna: "M6 3c0 8 12 10 12 18M18 3C18 11 6 13 6 21M7 6h10M8 18h8M10 10h4M10 14h4",
  copy: "M8 8h13v13H8zM16 8V3H3v13h5",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.wallet}"/></svg>`;
const nav = [
  ["overview", "Visão geral", "home"],
  ["transactions", "Lançamentos", "list"],
  ["cards", "Cartões e faturas", "card"],
  ["reports", "Relatórios", "chart"],
  ["dna", "DNA dos gastos", "dna"],
  ["accounts", "Contas", "wallet"],
  ["categories", "Categorias", "tag"],
  ["investments", "Investimentos", "leaf"],
  ["pending", "Pendências", "inbox"],
  ["import", "Importar CSV", "upload"],
];
const state = {
  user: null,
  workspace: null,
  view: "overview",
  month: today().slice(0, 7),
  data: {},
  loaded: false,
  loading: null,
  lastLoad: 0,
  page: 1,
  filters: {
    ...monthRange(today().slice(0, 7)),
    type: "all",
    account: "all",
    category: "all",
    query: "",
  },
  reportBasis: "cash",
  reportStart: monthRange(today().slice(0, 7)).start,
  reportEnd: monthRange(today().slice(0, 7)).end,
  dnaBasis: "cash",
  dnaMonths: 6,
  importRows: null,
};
const config = window.APP_CONFIG;
const client = window.supabase.createClient(
  config.SUPABASE_URL,
  config.SUPABASE_KEY,
);
const rows = (name) =>
  name === "billing_cycles"
    ? (state.data[name] || []).filter((c) => !c.archived_at)
    : state.data[name] || [];
const byId = (table, id) => rows(table).find((x) => x.id === id);
const accountName = (id) => byId("accounts", id)?.name || "Sem conta";
const categoryName = (id) => byId("categories", id)?.name || "Sem categoria";
const color = (value) =>
  /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#8ca879";
const palette = [
  "#174f42",
  "#7f9c68",
  "#b8c993",
  "#dcd6b4",
  "#aba38e",
  "#88a69e",
];
const button = (label, action, id = "", style = "") =>
  `<button class="button ${style}" data-action="${action}"${id ? ` data-id="${esc(id)}"` : ""}>${label}</button>`;
function toast(message, error = false) {
  const el = document.createElement("div");
  el.className = "toast" + (error ? " error" : "");
  el.textContent = message;
  $("#toasts").replaceChildren(el);
  setTimeout(() => el.remove(), error ? 8000 : 4500);
}
function message(error) {
  const text = error?.message || String(error);
  if (/fetch|network|offline/i.test(text))
    return "Não foi possível conectar. Confira a internet e tente novamente.";
  if (/jwt|session|token.*expired/i.test(text))
    return "Sua sessão expirou. Entre novamente.";
  return text;
}
function empty(title, detail = "", action = "") {
  return `<div class="empty"><strong>${esc(title)}</strong>${esc(detail)}${action}</div>`;
}
function heading(
  title,
  subtitle,
  actions = "",
  eyebrow = "SUAS FINANÇAS, COM CLAREZA",
) {
  return `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function periodPicker() {
  return `<div class="period-picker"><button class="icon-button" data-action="previous-month" aria-label="Mês anterior">‹</button><input type="month" id="period" aria-label="Mês de referência" value="${state.month}"><button class="icon-button" data-action="next-month" aria-label="Próximo mês">›</button></div>`;
}
function kpi(label, value, note, symbol = "wallet", featured = false) {
  return `<div class="kpi ${featured ? "featured" : ""}"><div class="kpi-top">${label}${icon(symbol)}</div><div class="kpi-value financial-value">${money(value)}</div><div class="kpi-note">${note}</div></div>`;
}
function optionList(items, selected = "", blank = "Selecione…") {
  return (
    `<option value="">${esc(blank)}</option>` +
    items
      .map(
        (item) =>
          `<option value="${esc(item.id)}"${item.id === selected ? " selected" : ""}>${esc(item.name || item.bank_name)}</option>`,
      )
      .join("")
  );
}
function bankAccounts() {
  return rows("accounts").filter(
    (a) => !["credit_card", "cartao", "cartão"].includes(normalize(a.type)),
  );
}
async function fetchAll(table, ownerId) {
  let result = [];
  for (let offset = 0; ; offset += 500) {
    let query = client
      .from(table)
      .select("*")
      .order("id")
      .range(offset, offset + 499);
    if (table !== "pending_transactions") query = query.eq("user_id", ownerId);
    const { data, error } = await query;
    if (error) throw error;
    result.push(...data);
    if (data.length < 500) return result;
    if (offset > 100000)
      throw Error(
        "Histórico muito grande. Entre em contato para ampliar a paginação.",
      );
  }
}
async function loadData({ silent = false } = {}) {
  if (state.loading) return state.loading;
  if (!state.user) return;
  const userId = state.user.id;
  $("#sync-status").textContent = "Atualizando…";
  $("#refresh").disabled = true;
  if (!state.loaded)
    $("#content").innerHTML =
      '<div class="kpi-grid">' +
      Array(4).fill('<div class="skeleton"></div>').join("") +
      '</div><p class="loading-message">Organizando seus lançamentos…</p>';
  state.loading = (async () => {
    try {
      const workspace = await rpc("get_finance_workspace", {});
      if (!workspace?.owner_id)
        throw Error(
          "Não foi possível identificar seu espaço financeiro. Entre novamente.",
        );
      const tables = [
        "accounts",
        "categories",
        "transactions",
        "credit_cards",
        "billing_cycles",
        "card_payments",
        "installments",
        "investments",
        "investment_transactions",
        "investment_valuations",
        "pending_transactions",
      ];
      const values = await Promise.all(
        tables.map((table) => fetchAll(table, workspace.owner_id)),
      );
      if (state.user?.id !== userId) return;
      state.workspace = workspace;
      $("#workspace-name").textContent = workspace.shared
        ? "Espaço compartilhado"
        : "Espaço pessoal";
      $("#workspace-breadcrumb").textContent = workspace.shared
        ? "Nossa família"
        : "Meu espaço";
      state.data = Object.fromEntries(
        tables.map((name, i) => [name, values[i]]),
      );
      state.loaded = true;
      state.lastLoad = Date.now();
      $("#sync-status").textContent = "Atualizado agora";
      render();
    } catch (error) {
      $("#sync-status").textContent = "Falha ao atualizar";
      if (!state.loaded)
        $("#content").innerHTML =
          `<div class="error-panel"><h2>Não conseguimos carregar seus dados.</h2><p>${esc(message(error))}</p>${button("Tentar novamente", "refresh", "", "primary")}</div>`;
      else if (!silent) toast(message(error), true);
      throw error;
    } finally {
      state.loading = null;
      $("#refresh").disabled = false;
    }
  })();
  return state.loading;
}
function render() {
  if (!state.loaded) return;
  $("#navigation").innerHTML =
    nav
      .map(
        ([id, label, symbol], i) =>
          `${i === 5 ? '<div class="nav-separator"></div>' : ""}<a href="#${id}" class="nav-link ${state.view === id ? "active" : ""}" ${state.view === id ? 'aria-current="page"' : ""}>${icon(symbol)}<span>${label}</span></a>`,
      )
      .join("") +
    '<button type="button" id="more-nav" class="nav-link mobile-more" data-action="toggle-nav" aria-expanded="false"><span class="more-symbol">☷</span><span>Mais</span></button>';
  $("#view-name").textContent =
    nav.find((n) => n[0] === state.view)?.[1] || "Visão geral";
  const views = {
    overview: renderOverview,
    transactions: renderTransactions,
    cards: renderCards,
    reports: renderReports,
    dna: renderDNA,
    accounts: renderAccounts,
    categories: renderCategories,
    investments: renderInvestments,
    pending: renderPending,
    import: renderImport,
  };
  $("#content").innerHTML = (views[state.view] || renderOverview)();
}
function navigate(view) {
  $("#navigation").classList.remove("expanded");
  state.view = nav.some((n) => n[0] === view) ? view : "overview";
  render();
  window.scrollTo({ top: 0 });
}
function trendMarkup() {
  const months = Array.from({ length: 6 }, (_, i) =>
    shiftMonth(state.month, i - 5),
  );
  const series = months.map((month) => {
    const r = monthRange(month);
    return totals(
      inPeriod(
        allocatedCashRows(
          rows("transactions"),
          rows("card_payments"),
          rows("billing_cycles"),
        ),
        r.start,
        r.end,
      ),
    );
  });
  const max = Math.max(1, ...series.flatMap((x) => [x.income, x.expense]));
  const point = (v, i) => `${40 + i * 92},${155 - (v / max) * 130}`;
  const line = (key) => series.map((v, i) => point(v[key], i)).join(" ");
  return `<svg class="trend" viewBox="0 0 540 177" role="img" aria-label="Entradas e saídas nos últimos seis meses">${[0, 1, 2, 3].map((i) => `<line x1="35" y1="${25 + i * 43.3}" x2="510" y2="${25 + i * 43.3}" stroke="#edf0e7" stroke-dasharray="3 5"/><text x="0" y="${28 + i * 43.3}" fill="#96a090" font-size="8">${Math.round((max * (3 - i)) / 3 / 1000)}k</text>`).join("")}<polygon points="40,155 ${line("income")} 500,155" fill="#eaf2e2" opacity=".55"/><polyline points="${line("expense")}" fill="none" stroke="#b9cb9a" stroke-width="2.5"/><polyline points="${line("income")}" fill="none" stroke="#245c49" stroke-width="2.5"/>${series.map((v, i) => `<circle cx="${40 + i * 92}" cy="${155 - (v.income / max) * 130}" r="3" fill="#245c49"><title>${monthLabel(months[i])}: entradas ${money(v.income)}; saídas ${money(v.expense)}</title></circle>`).join("")}</svg><div class="chart-labels">${months.map((m) => `<span>${new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(m + "-01T12:00:00"))}</span>`).join("")}</div>`;
}
function categoryMarkup(list) {
  if (!list.length)
    return empty("Tudo tranquilo por aqui", "Nenhuma despesa neste período.");
  const total = list.reduce((n, c) => n + c.value, 0);
  const shown = list.slice(0, 4);
  if (list.length > 4)
    shown.push({
      name: "Outras",
      value: list.slice(4).reduce((n, c) => n + c.value, 0),
    });
  let cursor = 0;
  const segments = shown.map((c, i) => {
    const start = cursor;
    cursor += (c.value / total) * 100;
    return `${palette[i]} ${start}% ${cursor}%`;
  });
  return `<div class="category-summary"><div class="donut" style="background:conic-gradient(${segments.join(",")})"><div class="donut-center">Total do mês<strong>${money(total)}</strong></div></div><div class="category-legend">${shown.map((c, i) => `<div class="category-legend-item"><span class="dot" style="background:${palette[i]}"></span><span title="${esc(c.name)}">${esc(c.name)}</span><strong>${Math.round((c.value / total) * 100)}%</strong></div>`).join("")}</div></div>`;
}
function transactionTable(items, { compact = false } = {}) {
  if (!items.length)
    return empty(
      "Nenhum lançamento por aqui",
      "Adicione um lançamento ou ajuste os filtros.",
      button("＋ Novo lançamento", "new-transaction", "", "primary small"),
    );
  return `<div class="table-wrap"><table class="${compact ? "" : "transaction-table"}"><thead><tr><th>Lançamento</th><th>Categoria</th><th>Data</th><th class="amount">Valor</th>${compact ? "" : '<th><span class="muted">Ações</span></th>'}</tr></thead><tbody>${items
    .map((t) => {
      const type = transactionType(t.type);
      const parts = rows("installments").filter(
        (p) => p.transaction_id === t.id,
      ).length;
      return `<tr><td><div class="transaction-name"><span class="transaction-symbol ${type}">${type === "income" ? "↙" : type === "transfer" ? "⇄" : "↗"}</span><div><strong>${esc(t.description || "Sem descrição")}</strong><small>${esc(t.credit_card_id ? byId("credit_cards", t.credit_card_id)?.bank_name || "Cartão" : accountName(t.account_id))}${type === "transfer" ? ` → ${esc(accountName(t.transfer_to_account_id))}` : ""}${parts ? ` · ${parts} parcelas` : ""}${t.credit_card_id ? " · detalhe do cartão · fora do total de saídas" : ""}</small></div></div></td><td><span class="pill">${esc(type === "transfer" ? "Transferência" : categoryName(t.category_id))}</span></td><td>${formatDate(t.date)}</td><td class="amount ${type === "income" ? "positive" : type === "expense" ? "negative" : ""}">${type === "income" ? "+ " : type === "expense" ? "− " : ""}${money(t.amount)}</td>${compact ? "" : `<td><div class="row-actions"><button class="icon-button" data-action="edit-transaction" data-id="${t.id}" title="Editar" aria-label="Editar ${esc(t.description)}">${icon("edit")}</button><button class="icon-button" data-action="duplicate-transaction" data-id="${t.id}" title="Repetir lançamento" aria-label="Repetir ${esc(t.description)}">${icon("copy")}</button><button class="icon-button" data-action="delete-transaction" data-id="${t.id}" title="Excluir" aria-label="Excluir ${esc(t.description)}">${icon("trash")}</button></div></td>`}</tr>`;
    })
    .join("")}</tbody></table></div>`;
}
function renderOverview() {
  const range = monthRange(state.month),
    cash = allocatedCashRows(
      rows("transactions"),
      rows("card_payments"),
      rows("billing_cycles"),
    ),
    monthly = inPeriod(cash, range.start, range.end),
    sum = totals(monthly);
  const balance =
    bankAccounts().reduce((n, a) => n + cents(a.balance), 0) / 100;
  const unpaid = rows("billing_cycles")
    .filter((c) => outstanding(c) > 0)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const debt = unpaid.reduce((n, c) => n + cents(outstanding(c)), 0) / 100;
  const name = state.user.email.split("@")[0].split(/[._]/)[0];
  const dna = spendingDNA(cash, rows("categories"), state.month);
  return (
    heading(
      `Seu mês, com clareza.`,
      `Um olhar para ${esc(monthLabel(state.month))}. Sem complicar.`,
      periodPicker(),
      "VISÃO GERAL",
    ) +
    `<div class="kpi-grid">${kpi("Saldo disponível", balance, "Saldo atual das suas contas", "wallet", true)}${kpi("Entradas do mês", sum.income, `${monthly.filter((t) => transactionType(t.type) === "income").length} lançamentos de receita`, "down")}${kpi("Saídas do mês", sum.expense, "Pagamentos e despesas das contas", "up")}${kpi("Faturas a pagar", debt, `${unpaid.length} fatura${unpaid.length === 1 ? "" : "s"} com saldo em aberto`, "card")}</div><div class="overview-grid"><section class="panel"><div class="panel-heading"><div><h3>O ritmo das suas finanças</h3><p>Entradas e saídas das contas · últimos 6 meses</p></div><div class="legend"><span>Entradas</span><span>Saídas</span></div></div>${trendMarkup()}<div class="chart-summary"><span>Resultado do mês<strong class="${sum.balance < 0 ? "negative" : "positive"}">${money(sum.balance)}</strong></span><span>Média mensal de saídas<strong>${money(dna.average)}</strong></span><a href="#reports" class="button text small">Ver relatório →</a></div></section><section class="panel"><div class="panel-heading"><div><h3>Para onde vai o dinheiro?</h3><p>Saídas por categoria · mês selecionado</p></div></div>${categoryMarkup(categoryTotals(monthly, rows("categories")))}<p class="subtle-note">Faturas detalhadas distribuem o valor pago entre as categorias. A soma permanece igual às saídas da conta.</p></section></div><section class="panel recent-panel"><div class="panel-heading"><div><h3>Últimos lançamentos</h3><p>Os movimentos mais recentes do mês.</p></div><a class="button text small" href="#transactions">Ver todos →</a></div>${transactionTable(
      inPeriod(rows("transactions"), range.start, range.end)
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) ||
            String(b.created_at).localeCompare(String(a.created_at)),
        )
        .slice(0, 5),
      { compact: true },
    )}</section><div class="bottom-grid"><section class="panel"><div class="panel-heading"><div><h3>Fique de olho nas faturas</h3><p>Próximos vencimentos e valores em aberto.</p></div><a class="button text small" href="#cards">Ver cartões →</a></div>${
      unpaid
        .slice(0, 3)
        .map(
          (c) =>
            `<div class="bill-item"><span class="bill-icon">${icon("card")}</span><div class="bill-copy"><strong>${esc(byId("credit_cards", c.credit_card_id)?.bank_name || "Cartão")}</strong><small>Vence em ${formatDate(c.due_date)}</small></div><div class="bill-value">${money(outstanding(c))}<small>${c.due_date < today() ? '<span class="pill danger">Vencida</span>' : '<span class="pill">Em aberto</span>'}</small></div>${button("Pagar", "pay-cycle", c.id, "small")}</div>`,
        )
        .join("") ||
      empty("Nenhuma fatura em aberto", "As próximas faturas aparecem aqui.")
    }</section><section class="panel"><div class="panel-heading"><div><h3>O jeito da sua família gastar</h3><p>Médias do histórico, organizadas por área.</p></div><a class="button text small" href="#dna">Ver DNA →</a></div>${
      dna.areas
        .slice(0, 3)
        .map(
          (g) =>
            `<div class="account-row"><span class="avatar">${esc(g.area[0])}</span><div class="bill-copy"><strong>${esc(g.area)}</strong><small>${g.recurring ? "Gasto habitual" : `${g.frequency} de ${dna.months.length} meses com gastos`}</small></div><div class="bill-value">${money(g.average)}<small class="muted">média / mês</small></div></div>`,
        )
        .join("") ||
      empty(
        "Seu histórico conta uma história",
        "As médias aparecem com os meses de uso.",
      )
    }</section></div>`
  );
}

function filtered() {
  return filterRows(
    rows("transactions"),
    state.filters,
    rows("accounts"),
    rows("categories"),
  );
}
function transactionResults() {
  const list = filtered(),
    sum = totals(reportingRows(list)),
    pages = Math.max(1, Math.ceil(list.length / 30));
  state.page = Math.min(state.page, pages);
  return `<div class="totals-strip"><span>Entradas <strong class="positive">${money(sum.income)}</strong></span><span>Saídas <strong class="negative">${money(sum.expense)}</strong></span><span>Resultado <strong>${money(sum.balance)}</strong></span><span class="count">${list.length} lançamentos · totais das contas</span></div><section class="panel">${transactionTable(list.slice((state.page - 1) * 30, state.page * 30))}<div class="pagination"><span>Página ${state.page} de ${pages} · 30 por página</span><div><button class="button small" data-action="previous-page" ${state.page <= 1 ? "disabled" : ""}>← Anterior</button><button class="button small" data-action="next-page" ${state.page >= pages ? "disabled" : ""}>Próxima →</button></div></div></section>`;
}
function renderTransactions() {
  const f = state.filters;
  return (
    heading(
      "Seus lançamentos",
      "Encontre, confira e organize cada movimento.",
      button(
        `${icon("upload")} Exportar CSV`,
        "export-transactions",
        "",
        "small",
      ),
      "DIA A DIA",
    ) +
    `<div class="filters"><label>Pesquisar<input type="search" id="filter-query" placeholder="Descrição, conta ou valor" value="${esc(f.query)}"></label><label>Tipo<select id="filter-type">${[
      ["all", "Todos os tipos"],
      ["expense", "Despesas"],
      ["income", "Receitas"],
      ["transfer", "Transferências"],
    ]
      .map(
        ([v, l]) =>
          `<option value="${v}" ${f.type === v ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Conta<select id="filter-account"><option value="all">Todas as contas</option>${optionList(rows("accounts"), f.account, "Sem filtro")}</select></label><label>Categoria<select id="filter-category"><option value="all">Todas as categorias</option><option value="none" ${f.category === "none" ? "selected" : ""}>Sem categoria</option>${optionList(rows("categories"), f.category, "Sem filtro")}</select></label><div class="date-filters"><span class="filter-label">Período</span><input type="date" id="filter-start" aria-label="Data inicial" value="${f.start}"><span class="muted">até</span><input type="date" id="filter-end" aria-label="Data final" value="${f.end}">${button("Este mês", "filter-current", "", "small")}${button("Mês anterior", "filter-previous", "", "small")}${button("Todo o histórico", "filter-all", "", "text small")}<a class="button text small" href="#import">Importar CSV</a></div></div><div id="transaction-results">${transactionResults()}</div>`
  );
}
function renderCards() {
  const active = rows("credit_cards").filter((c) => c.is_active);
  const cycles = rows("billing_cycles")
    .filter((c) => Number(c.total_spent) > 0)
    .sort((a, b) => b.due_date.localeCompare(a.due_date));
  return (
    heading(
      "Cartões e faturas",
      "Compras organizadas. Vencimentos à vista.",
      button("＋ Novo cartão", "new-card", "", "primary"),
      "SEM SURPRESAS",
    ) +
    `<div class="cards-grid">${
      active
        .map((card) => {
          const debt =
            cycles
              .filter((c) => c.credit_card_id === card.id)
              .reduce((n, c) => n + cents(outstanding(c)), 0) / 100;
          return `<article class="bank-card"><div class="bank-card-header"><h3>${esc(card.bank_name)}</h3><span>${esc(card.card_network)}</span></div><div class="card-number">•••• &nbsp; •••• &nbsp; ${esc(card.last_four_digits)}</div><p>${esc(card.holder_name)} · fecha dia ${card.closing_day} · vence dia ${card.due_day}</p><div class="card-footer"><div><small>Faturas em aberto</small><br><strong>${money(debt)}</strong></div>${button("Importar fatura do mês", "import-card-statement", card.id, "small")}${button("Registrar sem arquivo", "new-statement", card.id, "small")}</div><div class="card-footer">${button("Ver compras", "card-purchases", card.id, "small")}${button("Editar", "edit-card", card.id, "small")}</div></article>`;
        })
        .join("") ||
      empty(
        "Cadastre seu primeiro cartão",
        "Acompanhe os totais das faturas e as compras detalhadas.",
      )
    }</div><div class="section-label"><h2>Suas faturas</h2><small>Pagamento registrado uma única vez na conta.</small></div><section class="panel"><div class="table-wrap"><table><thead><tr><th>Cartão</th><th>Referência</th><th>Vencimento</th><th class="amount">Total</th><th class="amount">Em aberto</th><th>Status</th><th>Ações</th></tr></thead><tbody>${cycles.map((c) => `<tr><td>${esc(byId("credit_cards", c.credit_card_id)?.bank_name || "Cartão")}</td><td>${c.cycle_start_date.slice(0, 7).split("-").reverse().join("/")}</td><td>${formatDate(c.due_date)}</td><td class="amount">${money(c.total_spent)}</td><td class="amount">${money(outstanding(c))}</td><td><span class="pill ${outstanding(c) <= 0 ? "positive" : c.due_date < today() ? "danger" : "warning"}">${outstanding(c) <= 0 ? "Paga" : Number(c.total_paid) > 0 ? "Parcial" : c.due_date < today() ? "Vencida" : "Em aberto"}</span></td><td>${button("Detalhar / anexar", "statement-details", c.id, "small")} ${outstanding(c) > 0 ? button("Pagar", "pay-cycle", c.id, "small") : ""}</td></tr>`).join("")}</tbody></table></div>${cycles.length ? "" : empty("Nenhuma fatura registrada", "Use “Registrar fatura” no cartão e informe o total do mês.")}</section><p class="form-note">O total da fatura é informado por você. Compras e parcelas detalhadas servem para analisar os gastos; não aumentam automaticamente uma fatura já registrada.</p>`
  );
}
function reportRows() {
  return state.reportBasis === "card"
    ? cardSchedule(rows("transactions"), rows("installments"))
    : allocatedCashRows(
        rows("transactions"),
        rows("card_payments"),
        rows("billing_cycles"),
      );
}
function renderReports() {
  const list = inPeriod(reportRows(), state.reportStart, state.reportEnd),
    sum = totals(list),
    groups = categoryTotals(list, rows("categories"));
  return (
    heading(
      "Relatórios que fazem sentido",
      "O que entrou, o que saiu e onde vale olhar mais de perto.",
      button("Exportar CSV", "export-report", "", "small") +
        button("Imprimir", "print", "", "small"),
      "VISÃO CLARA",
    ) +
    `<div class="filters"><label>Visão<select id="report-basis"><option value="cash" ${state.reportBasis === "cash" ? "selected" : ""}>Movimentação das contas</option><option value="card" ${state.reportBasis === "card" ? "selected" : ""}>Compras e parcelas no cartão</option></select></label><label>De<input id="report-start" type="date" value="${state.reportStart}"></label><label>Até<input id="report-end" type="date" value="${state.reportEnd}"></label><label>Atalho<select id="report-preset"><option value="">Escolher período</option><option value="month">Este mês</option><option value="last">Mês anterior</option><option value="year">Este ano</option><option value="all">Todo o histórico</option></select></label></div><div class="info-banner">${state.reportBasis === "cash" ? "Esta visão mostra o dinheiro que entrou e saiu das contas. Transferências entre suas contas não são despesas. Faturas entram no pagamento, distribuídas entre as categorias dos itens anexados." : "Esta visão mostra as compras do cartão. Compras parceladas são distribuídas pelas datas das parcelas. Pagamentos de faturas ficam fora para evitar dupla contagem."}</div><div class="report-summary">${kpi("Entradas", sum.income, "No período selecionado", "down")}${kpi("Despesas", sum.expense, `${list.filter((t) => transactionType(t.type) === "expense").length} lançamentos`, "up")}${kpi(state.reportBasis === "card" ? "Total de compras" : "Resultado", state.reportBasis === "card" ? sum.expense : sum.balance, state.reportBasis === "card" ? "Inclui parcelas no período" : "Entradas menos saídas", "chart", true)}</div><div class="bottom-grid"><section class="panel"><div class="panel-heading"><h3>Despesas por categoria</h3><span class="pill">${groups.length} categorias</span></div>${groups.map((g, i) => `<div class="report-category"><div class="line"><strong>${esc(g.name)}</strong><span>${money(g.value)} · ${Math.round((g.value / (sum.expense || 1)) * 100)}%</span></div><div class="progress"><span style="width:${(g.value / (groups[0]?.value || 1)) * 100}%;background:${palette[i % palette.length]}"></span></div></div>`).join("") || empty("Sem despesas neste período")}</section><section class="panel"><div class="panel-heading"><h3>Resumo prático</h3></div><div class="account-row"><div class="bill-copy"><strong>Maior concentração</strong><small>${esc(groups[0]?.name || "Sem dados")}</small></div><div class="bill-value">${money(groups[0]?.value)}</div></div><div class="account-row"><div class="bill-copy"><strong>Sem categoria</strong><small>Classifique para melhorar seus relatórios.</small></div><div class="bill-value">${money(groups.find((g) => g.id === "")?.value)}</div></div><div class="account-row"><div class="bill-copy"><strong>Compras no cartão</strong><small>Consulte a visão de cartões para detalhar.</small></div><div class="bill-value">${money(totals(inPeriod(cardSchedule(rows("transactions"), rows("installments")), state.reportStart, state.reportEnd)).expense)}</div></div><p class="subtle-note">Quer entender o custo habitual da casa? O DNA dos gastos compara meses completos por área, sem misturar o mês em andamento à média.</p><a class="button text" href="#dna">Conhecer meu DNA dos gastos →</a></section></div><section class="panel recent-panel"><div class="panel-heading"><h3>Lançamentos do período</h3><span class="muted">${list.length} registros · exporte para ver todos</span></div>${transactionTable(list.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15), { compact: true })}</section>`
  );
}
function renderDNA() {
  const source =
    state.dnaBasis === "card"
      ? cardSchedule(rows("transactions"), rows("installments"))
      : allocatedCashRows(
          rows("transactions"),
          rows("card_payments"),
          rows("billing_cycles"),
        );
  const dna = spendingDNA(
    source,
    rows("categories"),
    state.month,
    state.dnaMonths,
  );
  const now = state.month === today().slice(0, 7);
  return (
    heading(
      "O DNA dos seus gastos",
      "Entenda quanto a rotina costuma custar — e onde ela está mudando.",
      periodPicker(),
      "UM RETRATO DA SUA ROTINA",
    ) +
    `<div class="filters"><label>O que analisar<select id="dna-basis"><option value="cash" ${state.dnaBasis === "cash" ? "selected" : ""}>Saídas das contas</option><option value="card" ${state.dnaBasis === "card" ? "selected" : ""}>Compras e parcelas no cartão</option></select></label><label>Histórico<select id="dna-window">${[3, 6, 12].map((n) => `<option value="${n}" ${state.dnaMonths === n ? "selected" : ""}>Últimos ${n} meses completos</option>`).join("")}</select></label></div><div class="report-summary">${kpi("Custo médio mensal", dna.average, `${dna.months.length} meses completos analisados`, "wallet", true)}${kpi("Parte habitual estimada", dna.habitual, "Áreas presentes em pelo menos 2/3 dos meses", "dna")}${kpi("No mês selecionado", totals(inPeriod(source, monthRange(state.month).start, monthRange(state.month).end)).expense, now ? "Mês em andamento · comparação parcial" : "Total do mês selecionado", "chart")}</div><div class="info-banner">Média = soma dos gastos ÷ meses analisados, incluindo meses sem gastos. “Habitual” indica frequência no histórico, não uma conta fixa contratada. ${state.dnaBasis === "cash" ? "Faturas detalhadas distribuem os pagamentos por categoria; o que falta detalhar aparece sem categoria." : "Somente compras e parcelas detalhadas. Faturas sem itens importados não aparecem nesta visão."} As áreas podem ser ajustadas em Categorias.</div>${dna.months.length < 3 ? '<div class="info-banner warning">Histórico ainda curto: as estimativas ficam mais úteis a partir de três meses completos.</div>' : ""}<div class="dna-grid">${
      dna.areas
        .map((g) => {
          const max = Math.max(1, ...g.monthly);
          const difference = g.current - g.average;
          return `<article class="dna-card"><div class="line"><h3>${esc(g.area)}</h3><span class="pill ${g.recurring ? "positive" : ""}">${g.recurring ? "Habitual" : `${g.frequency}/${dna.months.length} meses`}</span></div><div class="dna-amount">${money(g.average)} <small class="muted">/ mês</small></div><p>${now ? "Até agora" : "No mês"}: <strong>${money(g.current)}</strong> · ${difference > 0 ? `${money(difference)} acima da média` : `${money(-difference)} abaixo da média`}</p><div class="dna-months" role="group" aria-label="Detalhar gastos por mês de ${esc(g.area)}">${g.monthly.map((v, i) => `<button type="button" class="dna-bar" data-action="dna-details" data-area="${esc(g.area)}" data-month="${dna.months[i]}" aria-label="Ver gastos de ${esc(g.area)}, ${monthLabel(dna.months[i])}: ${money(v)}" title="Clique para detalhar: ${money(v)}"><span class="dna-fill" style="height:${Math.max(4, (Math.abs(v) / Math.max(1, ...g.monthly.map(Math.abs))) * 100)}%"></span><small>${dna.months[i].slice(5)}/${dna.months[i].slice(2, 4)}</small></button>`).join("")}</div><p class="subtle-note">Clique em uma barra para ver os gastos.</p><details><summary>O que entra nesta área?</summary><ul>${g.categories.map((c) => `<li>${esc(c)}</li>`).join("")}</ul><p>Presente em ${g.frequency} dos ${dna.months.length} meses analisados.</p></details></article>`;
        })
        .join("") ||
      empty(
        "Vamos construir seu histórico",
        "Os gastos já lançados serão agrupados aqui.",
      )
    }</div>`
  );
}

function openDNADetails(area, month) {
  const detail = dnaBreakdown(
    rows("transactions"),
    rows("installments"),
    rows("categories"),
    rows("card_payments"),
    rows("billing_cycles"),
    { basis: state.dnaBasis, area, month },
  );
  openDialog(
    area + " · " + monthLabel(month),
    `<div class="info-banner">${state.dnaBasis === "cash" ? "Saídas das contas · data do pagamento. Nas faturas, os valores mostram a parte de cada compra incluída no pagamento, com os créditos descontados." : "Compras e parcelas no cartão · data da compra ou parcela. Estornos reduzem o total."}</div><div class="dna-detail-total"><span>${detail.items.length} registros · total da barra</span><strong>${money(detail.total)}</strong></div><div class="dna-detail-list">${detail.items.map((t) => `<article class="dna-detail-row"><div><strong>${esc(t.description || "Sem descrição")}</strong><small>${formatDate(t.date)} · ${esc(categoryName(t.category_id))}</small><small>${esc(t.credit_card_id ? byId("credit_cards", t.credit_card_id)?.bank_name || "Cartão" : accountName(t.account_id))}${t.allocated ? " · pago pela conta " + esc(accountName(t.account_id)) : ""}</small>${t.allocated ? `<small>Compra${t.purchase_date ? " de " + formatDate(t.purchase_date) : ""}: ${money(t.original_amount)} · valor contabilizado neste pagamento ao lado</small>` : ""}</div><strong class="${t.contribution < 0 ? "positive" : ""}" data-contribution="${t.contribution}">${money(t.contribution)}</strong></article>`).join("") || empty("Nenhum gasto neste mês", "Esta barra representa um mês sem gastos nesta área.")}</div><div class="form-actions"><button type="button" class="button" data-action="close-dialog">Fechar</button></div>`,
    { wide: true },
  );
}

function renderAccounts() {
  return (
    heading(
      "Suas contas",
      "Cada saldo no seu lugar. Transferências sem confusão.",
      button("＋ Nova conta", "new-account", "", "primary"),
      "ORGANIZAÇÃO",
    ) +
    `<div class="entity-grid">${
      rows("accounts")
        .map(
          (a) =>
            `<article class="entity-card"><div class="entity-top"><span class="avatar">${esc(a.name[0])}</span><span class="pill">${esc({ checking: "Conta corrente", savings: "Poupança", cash: "Dinheiro", investment: "Investimento", credit_card: "Conta de cartão" }[a.type] || a.type)}</span></div><h3>${esc(a.name)}</h3><div class="entity-amount">${money(a.balance)}</div><p>Saldo atual informado e movimentado pelos lançamentos.</p><div class="entity-actions">${button("Editar", "edit-account", a.id, "small")}${button("Ver lançamentos", "account-transactions", a.id, "small")}${button(icon("trash"), "delete-account", a.id, "small")}</div></article>`,
        )
        .join("") ||
      empty(
        "Onde você movimenta seu dinheiro?",
        "Adicione uma conta para começar.",
      )
    }</div><p class="form-note">Atualizar a tela não altera saldos. Receitas, despesas e transferências ajustam as contas na mesma operação do lançamento.</p>`
  );
}
function renderCategories() {
  const cats = [...rows("categories")].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );
  return (
    heading(
      "Categorias e áreas",
      "Organize os gastos do jeito que faz sentido para vocês.",
      button("＋ Nova categoria", "new-category", "", "primary"),
      "CADA GASTO NO SEU LUGAR",
    ) +
    `<div class="info-banner">A área agrupa categorias no DNA dos gastos. Você pode usar, por exemplo, “Moradia” para aluguel, energia e condomínio.</div><div class="entity-grid">${cats.map((c) => `<article class="entity-card"><div class="entity-top"><span class="dot" style="background:${color(c.color)};width:14px;height:14px"></span><span class="pill">${c.type === "income" ? "Receita" : "Despesa"}</span></div><h3>${esc(c.name)}</h3><p>Área: ${esc(spendingArea(c))}${c.spending_area ? "" : " · sugerida"}</p><div class="entity-actions">${button("Editar", "edit-category", c.id, "small")}${button("Ver gastos", "category-transactions", c.id, "small")}${button(icon("trash"), "delete-category", c.id, "small")}</div></article>`).join("") || empty("Categorias deixam tudo mais claro", "Crie a primeira para classificar seus lançamentos.")}</div>`
  );
}
function renderInvestments() {
  if (
    rows("investments").some((i) => i.quantity) &&
    quoteRefreshDue(state.workspace.owner_id, today())
  )
    refreshInvestmentQuotes(client)
      .then(() => loadData())
      .catch((e) => toast(e.message, true));
  return investmentScreens().render();
}
function investmentScreens() {
  return investmentUI({
    rows,
    esc,
    button,
    money,
    formatDate,
    today,
    heading,
    kpi,
    openDialog,
    rpc,
  });
}
function investmentValuationDialog(id, pointId) {
  const i = byId("investments", id),
    v = byId("investment_valuations", pointId);
  simpleDialog(
    v ? "Corrigir avaliação" : "Atualizar saldo · " + i.name,
    inputField("Data da avaliação", "date", v?.date || today(), {
      type: "date",
    }) +
      inputField(
        "Saldo total nessa data",
        "value",
        v?.value ?? i.current_value,
        { extra: 'inputmode="decimal"' },
      ),
    async (form) => {
      const fd = new FormData(form),
        value = parseMoney(fd.get("value"));
      if (!Number.isFinite(value) || value < 0)
        throw Error("Informe um saldo válido.");
      await rpc("record_investment_valuation", {
        p_investment: id,
        p_date: fd.get("date"),
        p_value: value,
        p_expected: i.current_value,
      });
    },
    "Não movimenta contas. Uma avaliação na mesma data corrige o fechamento daquele dia. Datas antigas preservam o saldo mais recente.",
  );
}
function investmentPoint(id) {
  const v = byId("investment_valuations", id),
    i = byId("investments", v.investment_id);
  openDialog(
    i.name,
    `<p>${formatDate(v.date)}</p><h2>${money(v.value)}</h2><p>${esc({ manual: "Saldo informado", baseline: "Início do histórico disponível", quote: "Cotação de mercado", balance: "Saldo após edição ou movimentação" }[v.source] || v.source)}</p>${v.price ? `<p>${esc(v.quantity)} cotas × ${money(v.price)}</p>` : ""}${button("Corrigir avaliação", "investment-correct", id, "primary")}`,
  );
}
function renderPending() {
  const pending = rows("pending_transactions")
    .filter((p) => p.status === "pending_review")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    heading(
      "Só falta conferir",
      "Revise os lançamentos recebidos antes de incluí-los nas contas.",
      "",
      "DA MENSAGEM AO LANÇAMENTO",
    ) +
    pending
      .map((p) => {
        const d = p.extracted_data || {};
        return `<article class="pending-card"><div class="line"><h3>${esc(d.description || "Lançamento recebido")}</h3><strong>${money(parseMoney(d.amount))}</strong></div><p>${esc(d.category || "Categoria a definir")} · ${esc(d.account || "Conta a definir")} · ${formatDate(d.date)}</p><div class="raw-message">${esc(p.raw_message)}</div><div class="buttons">${button("Revisar e lançar", "review-pending", p.id, "primary small")}${button("Descartar", "reject-pending", p.id, "small")}</div></article>`;
      })
      .join("") +
    (pending.length
      ? ""
      : empty(
          "Tudo conferido!",
          "Novas mensagens vinculadas à sua conta aparecem aqui.",
        ))
  );
}
function renderImport() {
  return (
    heading(
      "Seu extrato, sem digitar tudo",
      "Importe um CSV, confira os dados e só então confirme.",
      "",
      "MENOS TRABALHO REPETIDO",
    ) +
    `<section class="panel"><h3>Importar lançamentos</h3><p class="form-note">Aceita arquivos separados por vírgula ou ponto e vírgula. Selecione as colunas de data, descrição e valor na próxima etapa.</p><label class="upload-zone">${icon("upload")}<strong>Escolha seu arquivo CSV</strong><span>Extrato bancário ou compras da fatura · até 2 MB</span><input type="file" id="csv-file" accept=".csv,text/csv"></label><div id="import-preview"></div><div class="hint-grid"><div><strong>1. Escolha o destino</strong>Conta ou cartão ao qual os lançamentos pertencem.</div><div><strong>2. Confira as colunas</strong>Veja a prévia e escolha uma categoria inicial.</div><div><strong>3. Importe com controle</strong>Linhas iguais a lançamentos existentes são sinalizadas para revisão.</div></div></section>`
  );
}
let dialogTask = null,
  dialogBusy = false,
  dialogDirty = false;
function openDialog(title, body, { wide = false, onSubmit = null } = {}) {
  $("#dialog-title").textContent = title;
  $("#dialog-body").innerHTML = body;
  $("#dialog").classList.toggle("dialog-wide", wide);
  dialogTask = onSubmit;
  dialogDirty = false;
  if (!$("#dialog").open) $("#dialog").showModal();
  setTimeout(
    () =>
      $("#dialog-body input:not([type=hidden]),#dialog-body select")?.focus(),
    30,
  );
}
function closeDialog() {
  if (dialogBusy) return;
  if (dialogDirty && !confirm("Sair sem salvar as alterações?")) return;
  $("#dialog").close();
  dialogTask = null;
  dialogDirty = false;
}
function formWrap(fields, label = "Salvar", note = "") {
  return `<form id="edit-form">${fields}<p class="form-error" id="form-error" role="alert"></p>${note ? `<p class="form-note">${note}</p>` : ""}<div class="form-actions"><button class="button" type="button" data-action="close-dialog">Cancelar</button><button class="button primary" type="submit">${label}</button></div></form>`;
}
function inputField(
  label,
  name,
  value = "",
  { type = "text", required = true, full = false, extra = "" } = {},
) {
  return `<label class="${full ? "full" : ""}">${label}<input name="${name}" id="field-${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} ${extra}></label>`;
}
async function rpc(name, params) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw error;
  return data;
}
async function saveRow(table, payload, id) {
  if (
    ("name" in payload && !payload.name?.trim()) ||
    ("bank_name" in payload && !payload.bank_name?.trim())
  )
    throw Error("Preencha o nome.");
  const query = id
    ? client
        .from(table)
        .update(payload)
        .eq("id", id)
        .eq("user_id", state.workspace.owner_id)
    : client
        .from(table)
        .insert({ ...payload, user_id: state.workspace.owner_id });
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}
function transactionDialog(
  id = null,
  { duplicate = false, pending = null } = {},
) {
  const old = byId("transactions", id);
  if (old?.billing_cycle_id && !duplicate) {
    simpleDialog(
      "Categoria da compra",
      '<p class="full form-note">' +
        esc(old.description) +
        " · " +
        money(old.amount) +
        ' · detalhe da fatura, sem nova saída da conta.</p><label class="full">Categoria<select name="category">' +
        optionList(
          rows("categories").filter((c) => c.type === "expense"),
          old.category_id,
        ) +
        "</select></label>",
      async (form) =>
        rpc("categorize_statement_item", {
          p_id: old.id,
          p_category: new FormData(form).get("category"),
          p_expected: old.updated_at,
        }),
    );
    return;
  }
  if (
    old &&
    !duplicate &&
    rows("card_payments").some((p) => p.transaction_id === old.id)
  ) {
    toast(
      "Para corrigir um pagamento, exclua o lançamento para estorná-lo e registre novamente.",
      true,
    );
    return;
  }
  if (
    old &&
    !duplicate &&
    rows("installments").some((p) => p.transaction_id === old.id)
  ) {
    toast(
      "Este lançamento tem parcelas. Exclua a compra completa e cadastre novamente para alterar os valores.",
      true,
    );
    return;
  }
  const extracted = pending?.extracted_data || {};
  const match = (table, name) =>
    rows(table).find((r) => normalize(r.name) === normalize(name));
  const t = old
    ? { ...old, date: duplicate ? today() : old.date }
    : {
        type: transactionType(extracted.type) || "expense",
        description: extracted.description || "",
        amount: extracted.amount || "",
        date: csvDate(extracted.date) || today(),
        account_id: match("accounts", extracted.account)?.id || "",
        category_id: match("categories", extracted.category)?.id || "",
      };
  const requestId = crypto.randomUUID();
  let selectedType = transactionType(t.type);
  let method = t.credit_card_id ? "card" : "cash";
  function fields() {
    return `<div class="segmented" role="group" aria-label="Tipo de lançamento">${[
      ["expense", "Despesa"],
      ["income", "Receita"],
      ["transfer", "Transferência"],
    ]
      .map(
        ([v, l]) =>
          `<button type="button" data-transaction-type="${v}" class="${selectedType === v ? "active" : ""}">${l}</button>`,
      )
      .join(
        "",
      )}</div><input type="hidden" name="type" value="${selectedType}"><div class="form-grid">${inputField("Descrição", "description", t.description, { full: true, extra: 'maxlength="250" placeholder="Ex.: mercado da semana"' })}${inputField("Valor (R$)", "amount", t.amount, { extra: 'inputmode="decimal" placeholder="0,00"' })}${inputField("Data", "date", t.date, { type: "date" })}${selectedType === "expense" ? `<label>Forma de lançamento<select name="method" id="field-method"><option value="cash" ${method === "cash" ? "selected" : ""}>Conta / dinheiro</option><option value="card" ${method === "card" ? "selected" : ""}>Compra no cartão</option></select></label>` : ""}<label>${method === "card" && selectedType === "expense" ? "Cartão" : "Conta de origem"}<select name="account" id="field-account" required>${optionList(method === "card" && selectedType === "expense" ? rows("credit_cards").filter((c) => c.is_active) : bankAccounts(), method === "card" ? t.credit_card_id : t.account_id)}</select></label>${
      selectedType === "transfer"
        ? `<label>Conta de destino<select name="destination" required>${optionList(bankAccounts(), t.transfer_to_account_id)}</select></label>`
        : `<label class="${selectedType === "income" ? "full" : ""}">Categoria<select name="category" id="field-category">${optionList(
            rows("categories").filter(
              (c) => transactionType(c.type) === selectedType,
            ),
            t.category_id,
            "Sem categoria",
          )}</select></label>`
    }${method === "card" && selectedType === "expense" && (!id || duplicate) && !pending ? `<label>Número de parcelas<select name="installments">${Array.from({ length: 24 }, (_, i) => `<option value="${i + 1}">${i === 0 ? "À vista" : `${i + 1} parcelas`}</option>`).join("")}</select><small>O valor informado é o total da compra.</small></label>` : ""}</div>`;
  }
  function repaint() {
    openDialog(
      pending
        ? "Conferir lançamento"
        : id && !duplicate
          ? "Editar lançamento"
          : duplicate
            ? "Repetir lançamento"
            : "Novo lançamento",
      formWrap(
        fields(),
        pending ? "Confirmar lançamento" : "Salvar lançamento",
        method === "card"
          ? "A compra organiza seus gastos. O dinheiro sai da conta quando você registra o pagamento da fatura."
          : "",
      ),
      { onSubmit: submit },
    );
  }
  async function submit(form) {
    const fd = new FormData(form),
      type = fd.get("type"),
      amount = parseMoney(fd.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0)
      throw Error("Informe um valor positivo, como 125,90.");
    if (!validDate(fd.get("date"))) throw Error("Informe uma data válida.");
    const isCard = fd.get("method") === "card" && type === "expense";
    const card = isCard ? byId("credit_cards", fd.get("account")) : null;
    const data = {
      type,
      amount,
      description: String(fd.get("description")).trim(),
      date: fd.get("date"),
      account_id: card?.account_id || fd.get("account"),
      category_id: type === "transfer" ? null : fd.get("category") || null,
      credit_card_id: card?.id || null,
      transfer_to_account_id:
        type === "transfer" ? fd.get("destination") : null,
      client_request_id: requestId,
    };
    if (!data.description) throw Error("Descreva o lançamento.");
    if (type === "transfer" && data.account_id === data.transfer_to_account_id)
      throw Error("Escolha contas diferentes para a transferência.");
    if (pending)
      await rpc("approve_pending_transaction", {
        p_pending: pending.id,
        p_data: data,
      });
    else if (Number(fd.get("installments")) > 1)
      await rpc("save_installment_purchase", {
        p_data: data,
        p_count: Number(fd.get("installments")),
      });
    else
      await rpc("save_financial_transaction", {
        p_data: data,
        p_id: id && !duplicate ? id : null,
        p_expected_updated_at: id && !duplicate ? old.updated_at : null,
      });
  }
  repaint();
  $("#dialog-body").onclick = (event) => {
    const target = event.target.closest("[data-transaction-type]");
    if (!target) return;
    const fd = new FormData($("#edit-form"));
    Object.assign(t, {
      description: fd.get("description"),
      amount: fd.get("amount"),
      date: fd.get("date"),
      account_id: method === "cash" ? fd.get("account") : t.account_id,
      credit_card_id: method === "card" ? fd.get("account") : null,
      category_id: fd.get("category"),
    });
    selectedType = target.dataset.transactionType;
    if (selectedType !== "expense") method = "cash";
    repaint();
    dialogDirty = true;
  };
  $("#dialog-body").onchange = (event) => {
    if (event.target.id !== "field-method") return;
    const fd = new FormData($("#edit-form"));
    Object.assign(t, {
      description: fd.get("description"),
      amount: fd.get("amount"),
      date: fd.get("date"),
      category_id: fd.get("category"),
    });
    method = event.target.value;
    repaint();
    dialogDirty = true;
  };
}
function simpleDialog(title, fields, submit, note = "") {
  openDialog(
    title,
    formWrap(`<div class="form-grid">${fields}</div>`, "Salvar", note),
    { onSubmit: submit },
  );
}
function accountDialog(id) {
  const a = byId("accounts", id) || {};
  simpleDialog(
    id ? "Editar conta" : "Nova conta",
    inputField("Nome da conta", "name", a.name, { full: true }) +
      `<label>Tipo<select name="type">${[["checking", "Conta corrente"], ["savings", "Poupança"], ["cash", "Dinheiro"], ["investment", "Conta de investimento"], ...(!["checking", "savings", "cash", "investment", undefined].includes(a.type) ? [[a.type, a.type]] : [])].map(([v, l]) => `<option value="${esc(v)}" ${a.type === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>` +
      inputField(
        id ? "Saldo atual (ajuste manual)" : "Saldo inicial",
        "balance",
        a.balance ?? "0",
        { extra: 'inputmode="decimal"' },
      ),
    async (form) => {
      const fd = new FormData(form);
      const balance = parseMoney(fd.get("balance"));
      if (!Number.isFinite(balance)) throw Error("Informe um saldo válido.");
      await rpc("save_financial_account", {
        p_id: id || null,
        p_name: String(fd.get("name")).trim(),
        p_type: fd.get("type"),
        p_balance: balance,
        p_expected_balance: id ? Number(a.balance || 0) : null,
      });
    },
    id
      ? "Ajuste o saldo apenas para conciliar com seu banco. Lançamentos futuros usam este valor como base."
      : "Informe o saldo disponível agora. Os próximos lançamentos irão movimentar este valor.",
  );
}
function categoryDialog(id) {
  const c = byId("categories", id) || {};
  simpleDialog(
    id ? "Editar categoria" : "Nova categoria",
    inputField("Nome", "name", c.name, { full: true }) +
      `<label>Tipo<select name="type" ${id ? "disabled" : ""}><option value="expense" ${c.type !== "income" ? "selected" : ""}>Despesa</option><option value="income" ${c.type === "income" ? "selected" : ""}>Receita</option></select></label>` +
      inputField("Cor", "color", color(c.color), { type: "color" }) +
      inputField(
        "Área no DNA dos gastos",
        "spending_area",
        c.spending_area || spendingArea(c.name ? c : null),
        {
          required: false,
          full: true,
          extra: 'list="area-suggestions" placeholder="Ex.: Moradia"',
        },
      ) +
      '<datalist id="area-suggestions">' +
      [
        "Moradia",
        "Alimentação",
        "Saúde e cuidados",
        "Filhos e educação",
        "Transporte",
        "Lazer e viagens",
        "Compras pessoais",
        "Animais",
        "Serviços e assinaturas",
        "Faturas sem detalhamento",
      ]
        .map((n) => `<option value="${n}">`)
        .join("") +
      "</datalist>",
    async (form) => {
      const fd = new FormData(form);
      await saveRow(
        "categories",
        {
          name: String(fd.get("name")).trim(),
          type: c.type || fd.get("type"),
          color: fd.get("color"),
          spending_area: String(fd.get("spending_area")).trim() || null,
        },
        id,
      );
    },
  );
}
function cardDialog(id) {
  const c = byId("credit_cards", id) || {};
  simpleDialog(
    id ? "Editar cartão" : "Novo cartão",
    inputField("Nome do cartão / banco", "bank_name", c.bank_name, {
      full: true,
    }) +
      inputField("Titular", "holder_name", c.holder_name) +
      inputField("Últimos 4 dígitos", "last_four_digits", c.last_four_digits, {
        extra: 'inputmode="numeric" pattern="[0-9]{4}" maxlength="4"',
      }) +
      `<label>Bandeira<select name="card_network">${["Visa", "Mastercard", "Elo", "American Express", "Outra"].map((n) => `<option ${normalize(c.card_network) === normalize(n) ? "selected" : ""}>${n}</option>`).join("")}</select></label>` +
      inputField("Limite (R$)", "credit_limit", c.credit_limit || 0, {
        extra: 'inputmode="decimal"',
      }) +
      inputField("Dia do fechamento", "closing_day", c.closing_day || 20, {
        type: "number",
        extra: 'min="1" max="31"',
      }) +
      inputField("Dia do vencimento", "due_day", c.due_day || 5, {
        type: "number",
        extra: 'min="1" max="31"',
      }) +
      `<label class="full">Conta vinculada<select name="account_id" required>${optionList(bankAccounts(), c.account_id)}</select></label>`,
    async (form) => {
      const fd = new FormData(form);
      const limit = parseMoney(fd.get("credit_limit"));
      if (!Number.isFinite(limit) || limit < 0)
        throw Error("Informe um limite válido.");
      await saveRow(
        "credit_cards",
        {
          bank_name: String(fd.get("bank_name")).trim(),
          holder_name: String(fd.get("holder_name")).trim(),
          last_four_digits: fd.get("last_four_digits"),
          card_network: fd.get("card_network"),
          card_type: c.card_type || "credit",
          closing_day: Number(fd.get("closing_day")),
          due_day: Number(fd.get("due_day")),
          credit_limit: limit,
          account_id: fd.get("account_id"),
          is_active: true,
        },
        id,
      );
    },
  );
}
function statementDialog(
  cardId,
  cycle = null,
  pay = false,
  autoImport = false,
) {
  return openStatementEditor({
    card: byId("credit_cards", cardId),
    cycle,
    pay,
    autoImport,
    month: state.month,
    rows,
    rpc,
    client,
    formWrap,
    showDialog: (title, body, onSubmit) =>
      openDialog(title, body, { wide: true, onSubmit }),
  });
}
function payDialog(id) {
  const cycle = byId("billing_cycles", id);
  return statementDialog(cycle.credit_card_id, cycle, true);
}
function investmentDialog(id) {
  const i = byId("investments", id) || {};
  simpleDialog(
    id ? "Atualizar investimento" : "Novo investimento",
    inputField("Nome", "name", i.name, { full: true }) +
      inputField("Tipo", "type", i.type || "Renda fixa") +
      inputField("Papel na B3 (opcional)", "ticker", i.ticker || "", {
        required: false,
      }) +
      inputField(
        "Quantidade atual (para cotação)",
        "quantity",
        i.quantity ?? "",
        { required: false, extra: 'inputmode="decimal"' },
      ) +
      inputField(
        "Preço médio por papel (opcional)",
        "average_price",
        i.average_price ?? "",
        { required: false, extra: 'inputmode="decimal"' },
      ) +
      inputField("Instituição", "institution", i.institution, {
        required: false,
      }) +
      inputField(
        "Valor de referência",
        "initial_amount",
        i.initial_amount || 0,
        { extra: 'inputmode="decimal"' },
      ) +
      inputField("Valor atual", "current_value", i.current_value || 0, {
        extra: 'inputmode="decimal"',
      }) +
      inputField(
        "Data de início",
        "purchase_date",
        i.purchase_date || today(),
        { type: "date" },
      ) +
      inputField(
        "Vencimento (opcional)",
        "maturity_date",
        i.maturity_date || "",
        { type: "date", required: false },
      ),
    async (form) => {
      const fd = new FormData(form),
        initial = parseMoney(fd.get("initial_amount")),
        current = parseMoney(fd.get("current_value"));
      if (
        !Number.isFinite(initial) ||
        !Number.isFinite(current) ||
        initial < 0 ||
        current < 0
      )
        throw Error("Informe valores válidos e não negativos.");
      await saveRow(
        "investments",
        {
          name: String(fd.get("name")).trim(),
          ...investmentMarketFields(fd),
          type: String(fd.get("type")).trim(),
          institution: String(fd.get("institution")).trim() || null,
          initial_amount: initial,
          current_value: current,
          purchase_date: fd.get("purchase_date"),
          maturity_date: fd.get("maturity_date") || null,
          updated_at: new Date().toISOString(),
        },
        id,
      );
    },
    "Esta atualização registra o valor do investimento; não movimenta automaticamente suas contas.",
  );
}
function investmentMarketFields(fd) {
  const ticker = String(fd.get("ticker") || "")
    .trim()
    .toUpperCase();
  const quantity = String(fd.get("quantity") || "").trim()
    ? parseMoney(fd.get("quantity"))
    : null;
  const average_price = String(fd.get("average_price") || "").trim()
    ? parseMoney(fd.get("average_price"))
    : null;
  if (
    ticker &&
    (!/^[A-Z]{4}\d{1,2}$/.test(ticker) ||
      !Number.isFinite(quantity) ||
      quantity < 0)
  )
    throw Error("Informe um papel válido (ex.: PETR4) e sua quantidade atual.");
  if (
    (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) ||
    (average_price !== null &&
      (!Number.isFinite(average_price) || average_price < 0))
  )
    throw Error("Quantidade ou preço médio inválido.");
  return { ticker: ticker || null, quantity, average_price };
}
function investmentHistory(id) {
  const i = byId("investments", id);
  const list = rows("investment_transactions")
    .filter((t) => t.investment_id === id)
    .sort((a, b) => b.date.localeCompare(a.date));
  openDialog(
    i.name,
    `<div class="info-banner">Valor atual: ${money(i.current_value)}</div>${button("＋ Movimentação", "investment-movement", id, "primary small")}<h3>Avaliações de saldo</h3>${rows(
      "investment_valuations",
    )
      .filter((v) => v.investment_id === id)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(
        (v) =>
          `<p>${formatDate(v.date)} · ${money(v.value)} ${button("Detalhar / corrigir", "investment-point", v.id, "small")}</p>`,
      )
      .join(
        "",
      )}<h3>Movimentações</h3><div class="table-wrap" style="margin-top:20px"><table><thead><tr><th>Data</th><th>Tipo</th><th class="amount">Valor</th></tr></thead><tbody>${list.map((t) => `<tr><td>${formatDate(t.date)}</td><td>${esc({ contribution: "Aporte", withdrawal: "Resgate", yield: "Rendimento", dividend: "Dividendo" }[t.type] || t.type)}</td><td class="amount">${money(t.amount)}</td></tr>`).join("")}</tbody></table></div>${list.length ? "" : empty("Nenhuma movimentação registrada")}`,
  );
}
function investmentMovement(id) {
  simpleDialog(
    "Movimentar investimento",
    `<label>Tipo<select name="type"><option value="contribution">Aporte</option><option value="withdrawal">Resgate</option><option value="yield">Rendimento incorporado</option><option value="dividend">Dividendo recebido</option></select></label>` +
      inputField("Valor", "amount", "", { extra: 'inputmode="decimal"' }) +
      inputField("Data", "date", today(), { type: "date" }) +
      `<label>Conta (aporte, resgate ou dividendo)<select name="account">${optionList(bankAccounts())}</select></label>` +
      inputField("Descrição", "description", "", {
        full: true,
        required: false,
      }),
    async (form) => {
      const fd = new FormData(form),
        amount = parseMoney(fd.get("amount"));
      if (!Number.isFinite(amount) || amount <= 0)
        throw Error("Informe um valor positivo.");
      await rpc("record_investment_movement", {
        p_investment: id,
        p_type: fd.get("type"),
        p_amount: amount,
        p_date: fd.get("date"),
        p_account: fd.get("account") || null,
        p_description: fd.get("description"),
        p_request:
          form.dataset.requestId ||
          (form.dataset.requestId = crypto.randomUUID()),
      });
    },
    "Aportes e resgates movimentam a conta escolhida. Rendimento incorporado altera apenas o investimento; dividendo entra na conta.",
  );
}
function confirmDelete(kind, id) {
  const tables = {
    transaction: "transactions",
    account: "accounts",
    category: "categories",
    investment: "investments",
  };
  const table = tables[kind],
    item = byId(table, id);
  const hasPayment =
    kind === "transaction" &&
    rows("card_payments").some((p) => p.transaction_id === id);
  openDialog(
    hasPayment ? "Estornar pagamento?" : "Excluir este registro?",
    formWrap(
      `<p>${esc(item.description || item.name)}</p><p class="form-note">${kind === "transaction" ? "O efeito nas contas será revertido junto com a exclusão. Se houver parcelas vinculadas, todas serão excluídas." : kind === "investment" ? "Investimentos com histórico de movimentações não podem ser excluídos." : "Registros usados por lançamentos não podem ser excluídos."}</p>`,
      "Confirmar exclusão",
    ),
    {
      onSubmit: async () => {
        if (kind === "transaction")
          await rpc("delete_financial_transaction", {
            p_id: id,
            p_expected_updated_at: item.updated_at,
          });
        else {
          const { error } = await client
            .from(table)
            .delete()
            .eq("id", id)
            .eq("user_id", state.workspace.owner_id);
          if (error)
            throw Error(
              error.code === "23503"
                ? "Este registro está em uso. Preserve-o ou altere os vínculos antes de excluir."
                : error.message,
            );
        }
      },
    },
  );
}

function downloadCsv(list, name) {
  const header = [
    "Data",
    "Descrição",
    "Tipo",
    "Valor",
    "Conta",
    "Categoria",
    "Cartão",
  ];
  const body = list.map((t) => [
    t.date,
    t.description,
    { income: "Receita", expense: "Despesa", transfer: "Transferência" }[
      transactionType(t.type)
    ] || t.type,
    Number(t.amount).toFixed(2).replace(".", ","),
    accountName(t.account_id),
    categoryName(t.category_id),
    byId("credit_cards", t.credit_card_id)?.bank_name || "",
  ]);
  const csv =
    "\uFEFF" +
    [header, ...body].map((row) => row.map(csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function readCsv(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) throw Error("Escolha um CSV de até 2 MB.");
  const parsed = parseCsv(await file.text());
  if (parsed.length < 2)
    throw Error("O arquivo precisa de cabeçalho e pelo menos um lançamento.");
  if (parsed.length > 501)
    throw Error(
      "Importe até 500 lançamentos por vez. Divida o arquivo em partes.",
    );
  state.importRows = {
    headers: parsed[0],
    lines: parsed.slice(1),
    requests: parsed.slice(1).map(() => crypto.randomUUID()),
    preview: [],
  };
  const headers = parsed[0];
  const guessed = (terms) =>
    Math.max(
      0,
      headers.findIndex((h) => terms.some((t) => normalize(h).includes(t))),
    );
  const select = (name, index) =>
    `<select id="import-${name}">${headers.map((h, i) => `<option value="${i}" ${i === index ? "selected" : ""}>${esc(h || "Coluna " + (i + 1))}</option>`).join("")}</select>`;
  $("#import-preview").innerHTML =
    `<div class="form-grid"><label>Coluna de data${select("date", guessed(["data", "date"]))}</label><label>Coluna de descrição${select("description", guessed(["descri", "description", "historico", "estabelecimento"]))}</label><label>Coluna de valor${select("amount", guessed(["valor", "amount", "total"]))}</label><label>Tipo<select id="import-type"><option value="expense">Todos como despesa</option><option value="income">Todos como receita</option><option value="signed">Negativo = despesa; positivo = receita</option></select></label><label>Destino<select id="import-target"><optgroup label="Contas">${bankAccounts()
      .map((a) => `<option value="account:${a.id}">${esc(a.name)}</option>`)
      .join("")}</optgroup><optgroup label="Compras no cartão">${rows(
      "credit_cards",
    )
      .filter((c) => c.is_active)
      .map((c) => `<option value="card:${c.id}">${esc(c.bank_name)}</option>`)
      .join(
        "",
      )}</optgroup></select></label><label>Categoria inicial<select id="import-category">${optionList(rows("categories"), "", "Sem categoria")}</select></label></div><p class="form-note">Linhas inválidas e duplicadas serão excluídas da importação. A prévia mostra até 15 linhas; o resumo considera o arquivo inteiro. Nenhuma informação sai do seu navegador até você confirmar.</p><div class="form-actions">${button("Conferir prévia", "preview-import", "", "primary")}</div><div id="import-results"></div>`;
}
function importFingerprint(t) {
  return [
    t.date,
    cents(t.amount),
    normalize(t.description),
    t.account_id || "",
    t.credit_card_id || "",
    transactionType(t.type),
  ].join("|");
}
function previewImport() {
  const imp = state.importRows;
  if (!imp) return;
  const columns = {
    date: Number($("#import-date").value),
    description: Number($("#import-description").value),
    amount: Number($("#import-amount").value),
  };
  if (new Set(Object.values(columns)).size !== 3)
    throw Error(
      "Selecione três colunas diferentes para data, descrição e valor.",
    );
  const [targetType, targetId] = ($("#import-target").value || "").split(":");
  if (!targetId) throw Error("Cadastre uma conta ou cartão antes de importar.");
  const card = targetType === "card" ? byId("credit_cards", targetId) : null;
  const requestedType = $("#import-type").value;
  const cat = byId("categories", $("#import-category").value);
  const existing = new Set(rows("transactions").map(importFingerprint));
  let invalid = 0,
    duplicates = 0;
  const preview = [];
  for (const [lineIndex, line] of imp.lines.entries()) {
    const value = parseMoney(line[columns.amount]),
      date = csvDate(line[columns.date]),
      description = String(line[columns.description] || "").trim();
    const type =
      requestedType === "signed"
        ? value < 0
          ? "expense"
          : "income"
        : requestedType;
    if (
      !Number.isFinite(value) ||
      value === 0 ||
      !date ||
      !description ||
      (card && type !== "expense")
    ) {
      invalid++;
      continue;
    }
    const t = {
      date,
      description,
      type,
      amount: Math.abs(value),
      account_id: card?.account_id || targetId,
      credit_card_id: card?.id || null,
      category_id: transactionType(cat?.type) === type ? cat.id : null,
      client_request_id: imp.requests[lineIndex],
    };
    const key = importFingerprint(t);
    if (existing.has(key)) {
      duplicates++;
      continue;
    }
    existing.add(key);
    preview.push(t);
  }
  imp.preview = preview;
  imp.settings = JSON.stringify(
    [...document.querySelectorAll("#import-preview select")].map(
      (el) => el.value,
    ),
  );
  $("#import-results").innerHTML =
    `<div class="info-banner">${preview.length} prontos para importar · ${duplicates} duplicados ignorados · ${invalid} inválidos ignorados. Total: ${money(preview.reduce((n, t) => n + cents(t.amount), 0) / 100)}.</div>${transactionTable(
      preview.slice(0, 15).map((t, i) => ({ ...t, id: String(i) })),
      { compact: true },
    )}${preview.length ? `<div class="form-actions">${button(`Confirmar ${preview.length} lançamentos`, "confirm-import", "", "primary")}</div>` : ""}`;
}
async function confirmImport(target) {
  const imp = state.importRows;
  if (!imp?.preview.length) return;
  if (
    imp.settings !==
    JSON.stringify(
      [...document.querySelectorAll("#import-preview select")].map(
        (el) => el.value,
      ),
    )
  )
    throw Error("As opções mudaram. Confira a prévia novamente.");
  target.disabled = true;
  try {
    await rpc("import_financial_transactions", { p_rows: imp.preview });
    toast(`${imp.preview.length} lançamentos importados.`);
    state.importRows = null;
    await loadData();
  } finally {
    target.disabled = false;
  }
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target || target.disabled) return;
  const action = target.dataset.action,
    id = target.dataset.id;
  try {
    switch (action) {
      case "dna-details":
        openDNADetails(target.dataset.area, target.dataset.month);
        break;
      case "toggle-nav": {
        const expanded = $("#navigation").classList.toggle("expanded");
        target.setAttribute("aria-expanded", String(expanded));
        target.lastElementChild.textContent = expanded ? "Fechar" : "Mais";
        break;
      }
      case "new-transaction":
        transactionDialog();
        break;
      case "edit-transaction":
        transactionDialog(id);
        break;
      case "duplicate-transaction":
        transactionDialog(id, { duplicate: true });
        break;
      case "delete-transaction":
        confirmDelete("transaction", id);
        break;
      case "new-account":
        accountDialog();
        break;
      case "edit-account":
        accountDialog(id);
        break;
      case "delete-account":
        confirmDelete("account", id);
        break;
      case "new-category":
        categoryDialog();
        break;
      case "edit-category":
        categoryDialog(id);
        break;
      case "delete-category":
        confirmDelete("category", id);
        break;
      case "new-card":
        cardDialog();
        break;
      case "edit-card":
        cardDialog(id);
        break;
      case "statement-details": {
        const cycle = byId("billing_cycles", id);
        statementDialog(cycle.credit_card_id, cycle);
        break;
      }
      case "import-card-statement":
        statementDialog(id, null, true, true);
        break;
      case "new-statement":
        statementDialog(id);
        break;
      case "pay-cycle":
        payDialog(id);
        break;
      case "new-investment":
        investmentDialog();
        break;
      case "investment-period":
        investmentPeriod = id;
        render();
        break;
      case "investment-chart":
        investmentScreens().open(id);
        break;
      case "portfolio-point": {
        const point = portfolioHistory(
          rows("investments"),
          rows("investment_valuations"),
          investmentPeriod,
          today(),
        ).find((p) => p.date === id);
        openDialog(
          "Carteira · " + formatDate(id),
          `<h2>${money(point.value)}</h2>${point.items.map((i) => `<p><strong>${esc(i.name)}</strong> · ${money(i.value)}<br><small>Avaliado em ${formatDate(i.date)}</small></p>`).join("")}`,
        );
        break;
      }
      case "investment-value":
        investmentValuationDialog(id);
        break;
      case "investment-point":
        investmentPoint(id);
        break;
      case "investment-correct":
        investmentValuationDialog(
          byId("investment_valuations", id).investment_id,
          id,
        );
        break;
      case "investment-quotes": {
        const result = await refreshInvestmentQuotes(client);
        await loadData();
        toast(
          `${result.updated || 0} cotações atualizadas.${result.failures?.length ? " Alguns papéis não puderam ser atualizados." : ""}`,
        );
        break;
      }
      case "edit-investment":
        investmentDialog(id);
        break;
      case "delete-investment":
        confirmDelete("investment", id);
        break;
      case "investment-history":
        investmentHistory(id);
        break;
      case "investment-movement":
        investmentMovement(id);
        break;
      case "review-pending":
        transactionDialog(null, { pending: byId("pending_transactions", id) });
        break;
      case "reject-pending":
        openDialog(
          "Descartar pendência?",
          formWrap(
            "<p>Esta mensagem não será transformada em lançamento.</p>",
            "Descartar",
          ),
          {
            onSubmit: async () => {
              const { error } = await client
                .from("pending_transactions")
                .update({
                  status: "rejected",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", id)
                .eq("status", "pending_review");
              if (error) throw error;
            },
          },
        );
        break;
      case "close-dialog":
        closeDialog();
        break;
      case "refresh":
        await loadData();
        break;
      case "previous-month":
      case "next-month":
        state.month = shiftMonth(
          state.month,
          action === "previous-month" ? -1 : 1,
        );
        render();
        break;
      case "previous-page":
        state.page = Math.max(1, state.page - 1);
        $("#transaction-results").innerHTML = transactionResults();
        break;
      case "next-page":
        state.page++;
        $("#transaction-results").innerHTML = transactionResults();
        break;
      case "filter-current":
      case "filter-previous":
        Object.assign(
          state.filters,
          monthRange(
            action === "filter-current"
              ? today().slice(0, 7)
              : shiftMonth(today().slice(0, 7), -1),
          ),
        );
        state.page = 1;
        render();
        break;
      case "filter-all":
        Object.assign(state.filters, {
          start: "",
          end: "",
          query: "",
          type: "all",
          category: "all",
          account: "all",
        });
        state.page = 1;
        render();
        break;
      case "account-transactions":
        state.filters = {
          start: "",
          end: "",
          type: "all",
          query: "",
          category: "all",
          account: id,
        };
        state.page = 1;
        location.hash = "transactions";
        if (state.view === "transactions") render();
        break;
      case "category-transactions":
        state.filters = {
          start: "",
          end: "",
          type: "all",
          query: "",
          category: id,
          account: "all",
        };
        state.page = 1;
        location.hash = "transactions";
        break;
      case "card-purchases":
        openDialog(
          "Compras e parcelas do cartão",
          transactionTable(
            cardSchedule(rows("transactions"), rows("installments"))
              .filter((t) => t.credit_card_id === id)
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 100),
            { compact: true },
          ),
          { wide: true },
        );
        break;
      case "export-transactions":
        downloadCsv(filtered(), "lancamentos-" + today());
        break;
      case "export-report":
        downloadCsv(
          inPeriod(reportRows(), state.reportStart, state.reportEnd),
          "relatorio-" + today(),
        );
        break;
      case "print":
        window.print();
        break;
      case "preview-import":
        previewImport();
        break;
      case "confirm-import":
        await confirmImport(target);
        break;
    }
  } catch (error) {
    toast(message(error), true);
  }
});
document.addEventListener("change", async (event) => {
  const el = event.target;
  try {
    if (el.id === "period" && el.value) {
      state.month = el.value;
      render();
    }
    if (el.id.startsWith("filter-")) {
      const key = el.id.slice(7);
      state.filters[key] =
        el.value ||
        (["account", "category", "type"].includes(key) ? "all" : "");
      state.page = 1;
      if (
        state.filters.start &&
        state.filters.end &&
        state.filters.start > state.filters.end
      ) {
        toast("A data inicial deve vir antes da final.", true);
        return;
      }
      $("#transaction-results").innerHTML = transactionResults();
    }
    if (el.id === "report-basis") {
      state.reportBasis = el.value;
      render();
    }
    if (el.id === "report-start" || el.id === "report-end") {
      state[el.id === "report-start" ? "reportStart" : "reportEnd"] = el.value;
      render();
    }
    if (el.id === "report-preset" && el.value) {
      const now = today().slice(0, 7);
      const range =
        el.value === "month"
          ? monthRange(now)
          : el.value === "last"
            ? monthRange(shiftMonth(now, -1))
            : el.value === "year"
              ? {
                  start: today().slice(0, 4) + "-01-01",
                  end: today().slice(0, 4) + "-12-31",
                }
              : { start: "", end: "" };
      state.reportStart = range.start;
      state.reportEnd = range.end;
      render();
    }
    if (el.id === "dna-basis") {
      state.dnaBasis = el.value;
      render();
    }
    if (el.id === "dna-window") {
      state.dnaMonths = Number(el.value);
      render();
    }
    if (el.id === "csv-file") await readCsv(el.files[0]);
  } catch (error) {
    toast(message(error), true);
  }
});
let searchTimer;
document.addEventListener("input", (event) => {
  if (event.target.closest("#edit-form")) dialogDirty = true;
  if (event.target.id === "filter-query") {
    state.filters.query = event.target.value;
    state.page = 1;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if ($("#transaction-results"))
        $("#transaction-results").innerHTML = transactionResults();
    }, 120);
  }
});
document.addEventListener("submit", async (event) => {
  if (event.target.id !== "edit-form") return;
  event.preventDefault();
  if (dialogBusy || !dialogTask) return;
  dialogBusy = true;
  const form = event.target;
  form.querySelectorAll("button").forEach((b) => (b.disabled = true));
  $("#form-error").textContent = "";
  try {
    await dialogTask(form);
    dialogDirty = false;
    $("#dialog").close();
    dialogTask = null;
    toast("Salvo. Tudo atualizado!");
    await loadData().catch(() =>
      toast(
        "O registro foi salvo, mas a lista não atualizou. Use Atualizar.",
        true,
      ),
    );
  } catch (error) {
    if ($("#form-error")) $("#form-error").textContent = message(error);
  } finally {
    dialogBusy = false;
    form.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
});
$("#close-dialog").onclick = closeDialog;
$("#dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDialog();
});
$("#show-password").onclick = () => {
  const input = $("#login-password");
  input.type = input.type === "password" ? "text" : "password";
  $("#show-password").textContent =
    input.type === "password" ? "Mostrar" : "Ocultar";
  $("#show-password").setAttribute(
    "aria-label",
    input.type === "password" ? "Mostrar senha" : "Ocultar senha",
  );
};
$("#login-form").onsubmit = async (event) => {
  event.preventDefault();
  $("#login-submit").disabled = true;
  $("#login-error").textContent = "";
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: $("#login-email").value.trim(),
      password: $("#login-password").value,
    });
    if (error) throw error;
    $("#login-password").value = "";
    await enterApp(data.user);
  } catch (error) {
    $("#login-error").textContent = /invalid.*credentials/i.test(error.message)
      ? "E-mail ou senha não conferem. Tente novamente."
      : message(error);
  } finally {
    $("#login-submit").disabled = false;
  }
};
async function enterApp(user) {
  state.user = user;
  $("#auth").hidden = true;
  $("#app").hidden = false;
  $("#user-name").textContent = user.email.split("@")[0];
  $("#user-avatar").textContent = user.email[0].toUpperCase();
  state.view = location.hash.slice(1) || "overview";
  if (!nav.some((n) => n[0] === state.view)) state.view = "overview";
  await loadData();
}
async function logout() {
  if (dialogBusy) return;
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) {
    toast(message(error), true);
    return;
  }
  state.user = null;
  state.workspace = null;
  state.data = {};
  state.loaded = false;
  $("#app").hidden = true;
  $("#auth").hidden = false;
  $("#content").innerHTML = "";
  if ($("#dialog").open) $("#dialog").close();
}
$("#logout").onclick = logout;
$("#refresh").onclick = () => loadData().catch(() => {});
window.addEventListener("hashchange", () => navigate(location.hash.slice(1)));
document.addEventListener("visibilitychange", () => {
  if (
    !document.hidden &&
    state.user &&
    state.loaded &&
    !$("#dialog").open &&
    Date.now() - state.lastLoad > 60000 &&
    state.view !== "import"
  )
    loadData({ silent: true }).catch(() => {});
});
window.addEventListener("offline", () =>
  toast(
    "Você está sem conexão. Os dados exibidos são da última atualização.",
    true,
  ),
);
window.addEventListener("online", () => {
  if (state.user && !$("#dialog").open) loadData().catch(() => {});
});
client.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    state.workspace = null;
    state.user = null;
    state.loaded = false;
    state.data = {};
    $("#app").hidden = true;
    $("#auth").hidden = false;
    $("#content").innerHTML = "";
  }
});
// A mobile-accessible sign-out control, independent of the desktop sidebar.
const exitButton = document.createElement("button");
exitButton.className = "icon-button";
exitButton.title = "Sair da conta";
exitButton.setAttribute("aria-label", "Sair da conta");
exitButton.textContent = "↪";
exitButton.onclick = logout;
$(".topbar-actions").append(exitButton);
const { data: sessionData, error: sessionError } =
  await client.auth.getSession();
if (sessionError)
  $("#login-error").textContent = "Entre novamente para continuar.";
else if (sessionData.session)
  await enterApp(sessionData.session.user).catch(() => {});
