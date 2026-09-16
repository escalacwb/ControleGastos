export const money = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value) || 0,
  );
export const cents = (value) => Math.round((Number(value) || 0) * 100);
export function parseMoney(value) {
  let text = String(value ?? "")
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "");
  if (!text || !/^-?[\d.,]+$/.test(text)) return NaN;
  const comma = text.lastIndexOf(","),
    dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0)
    text =
      comma > dot
        ? text.replace(/\./g, "").replace(",", ".")
        : text.replace(/,/g, "");
  else if (comma >= 0) {
    if ((text.match(/,/g) || []).length > 1) return NaN;
    text = text.replace(",", ".");
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return NaN;
  return Number(text);
}
export const dateISO = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const today = () => dateISO();
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const d = new Date(value + "T12:00:00");
  return Number.isFinite(+d) && dateISO(d) === value;
}
export const formatDate = (value) =>
  validDate(String(value).slice(0, 10))
    ? String(value).slice(0, 10).split("-").reverse().join("/")
    : "—";
export function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw Error("Mês inválido");
  const [y, m] = month.split("-").map(Number);
  if (m < 1 || m > 12) throw Error("Mês inválido");
  return { start: month + "-01", end: dateISO(new Date(y, m, 0, 12)) };
}
export function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  return dateISO(new Date(y, m - 1 + delta, 1, 12)).slice(0, 7);
}
export function addMonthsClamped(value, offset) {
  const [y, m, d] = value.split("-").map(Number);
  const target = new Date(y, m - 1 + offset, 1, 12);
  return dateISO(
    new Date(
      target.getFullYear(),
      target.getMonth(),
      Math.min(
        d,
        new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate(),
      ),
      12,
    ),
  );
}
export const monthLabel = (month) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(month + "-01T12:00:00"),
  );
export const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export const transactionType = (value) =>
  ({ despesa: "expense", receita: "income", transferencia: "transfer" })[
    value
  ] || value;
export function inPeriod(rows, start, end) {
  return rows.filter(
    (t) => (!start || t.date >= start) && (!end || t.date <= end),
  );
}
export function reportingRows(rows, basis = "cash") {
  return rows.filter((t) =>
    basis === "card" ? Boolean(t.credit_card_id) : !t.credit_card_id,
  );
}
export function totals(rows) {
  let income = 0,
    expense = 0;
  for (const t of rows) {
    const type = transactionType(t.type);
    if (type === "income") income += cents(t.amount);
    if (type === "expense") expense += cents(t.amount);
  }
  return {
    income: income / 100,
    expense: expense / 100,
    balance: (income - expense) / 100,
    count: rows.length,
  };
}
export function categoryTotals(rows, categories = []) {
  const map = new Map();
  for (const t of rows) {
    if (transactionType(t.type) !== "expense") continue;
    const id = t.category_id || "";
    map.set(id, (map.get(id) || 0) + cents(t.amount));
  }
  return [...map]
    .map(([id, value]) => ({
      id,
      name: categories.find((c) => c.id === id)?.name || "Sem categoria",
      color: categories.find((c) => c.id === id)?.color || "#84968f",
      value: value / 100,
    }))
    .sort((a, b) => b.value - a.value);
}
export const outstanding = (cycle) =>
  Math.max(0, cents(cycle.total_spent) - cents(cycle.total_paid)) / 100;
export function installmentAmounts(amount, count) {
  const total = cents(amount);
  if (!Number.isInteger(count) || count < 1 || count > 60 || total < count)
    throw Error("Parcelamento inválido");
  const base = Math.floor(total / count);
  return Array.from(
    { length: count },
    (_, i) => (base + (i < total % count ? 1 : 0)) / 100,
  );
}
export function parseCsv(text) {
  text = String(text).replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/)[0] || "";
  const separator =
    (first.match(/;/g) || []).length > (first.match(/,/g) || []).length
      ? ";"
      : ",";
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === separator && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw Error("CSV com aspas não fechadas.");
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function csvDate(value) {
  const t = String(value || "").trim();
  if (validDate(t)) return t;
  const m = t.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) {
    const d = `${m[3]}-${m[2]}-${m[1]}`;
    if (validDate(d)) return d;
  }
  return "";
}
export function filterRows(
  rows,
  {
    start = "",
    end = "",
    type = "all",
    account = "all",
    category = "all",
    query = "",
  } = {},
  accounts = [],
  categories = [],
) {
  const q = normalize(query);
  return inPeriod(rows, start, end)
    .filter(
      (t) =>
        (type === "all" || transactionType(t.type) === type) &&
        (account === "all" ||
          t.account_id === account ||
          t.transfer_to_account_id === account) &&
        (category === "all" ||
          (category === "none"
            ? !t.category_id
            : t.category_id === category)) &&
        (!q ||
          normalize(
            [
              t.description,
              accounts.find((a) => a.id === t.account_id)?.name,
              categories.find((c) => c.id === t.category_id)?.name,
              money(t.amount),
              formatDate(t.date),
            ].join(" "),
          ).includes(q)),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        String(b.created_at || "").localeCompare(String(a.created_at || "")) ||
        a.id.localeCompare(b.id),
    );
}
export function cardSchedule(rows, installments = []) {
  return rows
    .filter((t) => t.credit_card_id)
    .flatMap((t) => {
      const parts = installments.filter((p) => p.transaction_id === t.id);
      return parts.length
        ? parts.map((p) => ({
            ...t,
            id: p.id,
            date: p.installment_date,
            amount: Number(p.installment_amount),
            description: `${t.description} · ${p.current_installment}/${p.total_installments}`,
          }))
        : [t];
    });
}
export function spendingArea(category) {
  if (category?.spending_area) return category.spending_area;
  const n = normalize(category?.name);
  const groups = [
    ["Moradia", /habit|morad|aluguel|condomin|energia|agua|luz|domestic|casa/],
    ["Alimentação", /alimenta|mercado|restaurante|feira|padaria|delivery/],
    ["Saúde e cuidados", /saude|farmac|medic|beleza|academia/],
    ["Filhos e educação", /crianca|infantil|escola|educa|filho/],
    ["Transporte", /veicul|combust|transporte|uber|estacion|carro/],
    ["Lazer e viagens", /lazer|cultura|viage|cinema/],
    ["Compras pessoais", /vestuar|roupa|calcad|compra/],
    ["Animais", /anima|pet|veterin/],
    [
      "Serviços e assinaturas",
      /mensalidade|assinatura|internet|telefone|servico/,
    ],
    ["Faturas sem detalhamento", /fatura/],
  ];
  return (
    groups.find(([, regex]) => regex.test(n))?.[0] ||
    category?.name ||
    "Sem categoria"
  );
}
export function spendingDNA(rows, categories, anchorMonth, count = 6) {
  // Only completed months, including zero-spend months after history begins.
  const expense = rows.filter((t) => transactionType(t.type) === "expense");
  const earliest = expense.map((t) => t.date.slice(0, 7)).sort()[0];
  const months = Array.from({ length: count }, (_, i) =>
    shiftMonth(anchorMonth, i - count),
  ).filter((m) => earliest && m >= earliest);
  const groups = new Map();
  for (const t of expense) {
    const month = t.date.slice(0, 7);
    if (!months.includes(month) && month !== anchorMonth) continue;
    const category = categories.find((c) => c.id === t.category_id);
    const area = spendingArea(category);
    if (!groups.has(area))
      groups.set(area, {
        area,
        monthly: months.map(() => 0),
        current: 0,
        categories: new Set(),
      });
    const group = groups.get(area);
    group.categories.add(category?.name || "Sem categoria");
    const index = months.indexOf(month);
    if (index >= 0) group.monthly[index] += cents(t.amount);
    if (month === anchorMonth) group.current += cents(t.amount);
  }
  const areas = [...groups.values()]
    .map((g) => {
      const frequency = g.monthly.filter((n) => n > 0).length;
      const average = months.length
        ? Math.round(g.monthly.reduce((a, b) => a + b, 0) / months.length) / 100
        : 0;
      return {
        ...g,
        monthly: g.monthly.map((n) => n / 100),
        current: g.current / 100,
        average,
        frequency,
        recurring:
          months.length >= 3 && frequency >= Math.ceil((months.length * 2) / 3),
        categories: [...g.categories],
      };
    })
    .sort((a, b) => b.average - a.average || b.current - a.current);
  return {
    months,
    areas,
    average:
      Math.round(areas.reduce((sum, g) => sum + cents(g.average), 0)) / 100,
    habitual:
      Math.round(
        areas
          .filter((g) => g.recurring)
          .reduce((sum, g) => sum + cents(g.average), 0),
      ) / 100,
  };
}
