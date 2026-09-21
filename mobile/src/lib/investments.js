export const investmentPeriods = [
  ["day", "Dia"],
  ["month", "Mês"],
  ["year", "Ano"],
  ["12m", "12 meses"],
  ["all", "Desde o início"],
];
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export function periodStart(period, end) {
  const d = new Date(end + "T12:00:00Z");
  if (period === "all") return "0000-01-01";
  if (period === "month") return end.slice(0, 7) + "-01";
  if (period === "year") return end.slice(0, 4) + "-01-01";
  if (period === "12m") {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    d.setUTCDate(
      Math.min(
        day,
        new Date(
          Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
        ).getUTCDate(),
      ),
    );
  }
  return d.toISOString().slice(0, 10);
}
export function investmentPerformance(
  investment,
  valuations,
  movements,
  period,
  end,
) {
  const history = valuations
    .filter((v) => v.investment_id === investment.id && v.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
  const start = periodStart(period, end);
  let base =
    period === "all"
      ? history[0]
      : history.filter((v) => v.date < start).at(-1);
  let last = history.at(-1);
  if (period === "all") {
    base = {
      date: investment.purchase_date,
      value: Number(investment.initial_amount),
      source: "purchase",
    };
    last = {
      date: last?.date || String(investment.updated_at || end).slice(0, 10),
      value: Number(investment.current_value),
    };
  }
  if (
    !base ||
    !last ||
    (period !== "all" && last.date === base.date) ||
    last.date < start
  )
    return {
      id: investment.id,
      name: investment.name,
      value: Number(investment.current_value),
      gain: null,
      percent: null,
      history,
      last,
    };
  const flows = movements.filter(
    (m) =>
      m.investment_id === investment.id &&
      m.date > base.date &&
      m.date <= last.date,
  );
  const sum = (type) =>
    flows
      .filter((m) => m.type === type)
      .reduce((n, m) => n + Number(m.amount), 0);
  const contributions = sum("contribution"),
    withdrawals = sum("withdrawal"),
    dividends = sum("dividend");
  const gain = round(
    Number(last.value) -
      Number(base.value) -
      contributions +
      withdrawals +
      dividends,
  );
  const duration = new Date(last.date) - new Date(base.date);
  let capital =
    Number(base.value) +
    flows.reduce(
      (n, m) =>
        n +
        (["contribution", "withdrawal"].includes(m.type)
          ? (Number(m.amount) *
              (m.type === "contribution" ? 1 : -1) *
              (new Date(last.date) - new Date(m.date))) /
            duration
          : 0),
      0,
    );
  if (period === "all")
    capital = Number(investment.initial_amount) + contributions;
  return {
    id: investment.id,
    name: investment.name,
    value: Number(investment.current_value),
    gain,
    percent: capital > 0 ? (gain / capital) * 100 : null,
    capital,
    contributions,
    withdrawals,
    dividends,
    history,
    last,
    base,
    approximate:
      period !== "all" &&
      base.date !==
        new Date(new Date(start + "T12:00:00Z").getTime() - 86400000)
          .toISOString()
          .slice(0, 10),
  };
}
export function portfolioPerformance(
  investments,
  valuations,
  movements,
  period,
  end,
) {
  const items = investments.map((i) =>
    investmentPerformance(i, valuations, movements, period, end),
  );
  const complete =
    items.length > 0 &&
    items.every((i) => i.gain !== null) &&
    (period === "all" ||
      new Set(items.map((i) => i.base?.date + ":" + i.last?.date)).size === 1);
  const capital = items.reduce((n, i) => n + (i.capital || 0), 0),
    gain = complete ? round(items.reduce((n, i) => n + i.gain, 0)) : null;
  return {
    items,
    value: round(items.reduce((n, i) => n + i.value, 0)),
    gain,
    percent: gain !== null && capital > 0 ? (gain / capital) * 100 : null,
  };
}
export function portfolioHistory(investments, valuations, period, end) {
  const start = periodStart(period, end);
  const dates = [
    ...new Set(
      valuations
        .filter((v) => v.date >= start && v.date <= end)
        .map((v) => v.date),
    ),
  ].sort();
  return dates.map((date) => {
    const items = investments
      .filter((i) => i.purchase_date <= date)
      .map((i) => {
        const v = valuations
          .filter((v) => v.investment_id === i.id && v.date <= date)
          .sort((a, b) => a.date.localeCompare(b.date))
          .at(-1);
        return {
          id: i.id,
          name: i.name,
          date: v?.date,
          value: v ? Number(v.value) : null,
        };
      });
    return {
      date,
      items,
      value:
        items.length && items.every((i) => i.value !== null)
          ? round(items.reduce((n, i) => n + i.value, 0))
          : null,
    };
  });
}
export async function refreshInvestmentQuotes(client) {
  const { data, error } = await client.rpc("refresh_market_investments");
  if (error)
    throw Error(
      "Cotações indisponíveis. Confira a configuração do provedor; seus saldos foram preservados.",
    );
  if (data?.error) throw Error(data.error);
  return data;
}
export const marketRange = (period) =>
  ({ day: "1d", month: "1mo", year: "ytd", "12m": "1y", all: "10y" })[period] ||
  "1y";
export function marketLineHTML(quote, investment) {
  const close = quote.indicators?.quote?.[0]?.close || [];
  const points = (quote.timestamp || [])
    .map((t, index) => ({
      date: new Date(t * 1000).toISOString().slice(0, 10),
      value: close[index],
    }))
    .filter(
      (p) => Number.isFinite(p.value) && p.date >= investment.purchase_date,
    );
  if (!points.length)
    return "<p>Não há cotações neste período após a data da compra.</p>";
  const min = Math.min(...points.map((p) => p.value)),
    max = Math.max(...points.map((p) => p.value)),
    span = max - min || 1;
  const coords = points
    .map(
      (p, index) =>
        `${40 + (index / Math.max(1, points.length - 1)) * 640},${220 - ((p.value - min) / span) * 170}`,
    )
    .join(" ");
  const fmt = (n) =>
    Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const price = Number(quote.meta.regularMarketPrice),
    quantity = Number(investment.quantity),
    cost = Number(investment.initial_amount);
  const gain =
    quantity > 0
      ? `<p>Posição pela cotação: <strong>${fmt(price * quantity)}</strong> · Diferença sobre a compra: <strong>${fmt(price * quantity - cost)}</strong></p>`
      : "<p>Informe a quantidade de papéis para calcular sua posição pela cotação.</p>";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:15px system-ui;color:#173b32;margin:12px}svg{width:100%;height:auto}p{line-height:1.5}</style></head><body><p>Cotação mais recente: <strong>${fmt(price)}</strong><br>${new Date(quote.meta.regularMarketTime * 1000).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · Yahoo Finance</p>${gain}<svg viewBox="0 0 720 270" role="img" aria-label="Histórico de cotação"><text x="5" y="25">${fmt(max)}</text><text x="5" y="240">${fmt(min)}</text><polyline points="${coords}" fill="none" stroke="#205b4e" stroke-width="3"/>${points.map((p, index) => `<circle cx="${40 + (index / Math.max(1, points.length - 1)) * 640}" cy="${220 - ((p.value - min) / span) * 170}" r="3" fill="#205b4e"><title>${p.date}: ${fmt(p.value)}</title></circle>`).join("")}<text x="40" y="265">${points[0].date}</text><text x="590" y="265">${points.at(-1).date}</text></svg><p>Preço de cada papel. As cotações podem ter atraso. O histórico de preços não presume compras ou vendas suas.</p></body></html>`;
}
const quoteAttempts = new Set();
export function quoteRefreshDue(owner, date) {
  const key = owner + ":" + date;
  if (quoteAttempts.has(key)) return false;
  quoteAttempts.add(key);
  return true;
}
export function marketTicker(i) {
  return (
    String(i.ticker || "")
      .trim()
      .toUpperCase() ||
    String(i.name || "")
      .toUpperCase()
      .match(/\b[A-Z]{4}\d{1,2}\b/)?.[0] ||
    ""
  );
}
export function investmentChart(i, valuations, movements, kind, period, end) {
  const lastRecorded=valuations.filter(v=>v.investment_id===i.id).sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
  const valueDate=lastRecorded&&Number(lastRecorded.value)===Number(i.current_value)?lastRecorded.date:String(i.updated_at||end).slice(0,10);
  const source = [
    { date: i.purchase_date, value: Number(i.initial_amount), label: "Compra" },
    ...valuations
      .filter((v) => v.investment_id === i.id)
      .map((v) => ({ ...v, label: "Saldo registrado" })),
  ];
  if (
    !source.some(
      (v) =>
        v.source !== "purchase" &&
        v.value === Number(i.current_value) &&
        v.date === valueDate,
    )
  )
    source.push({
      date: valueDate,
      value: Number(i.current_value),
      label: "Último saldo informado",
    });
  if (kind === "comparison")
    return [
      {
        date: i.purchase_date,
        label: "Compra",
        value: Number(i.initial_amount),
      },
      {
        date: source.at(-1).date,
        label: "Atual",
        value: Number(i.current_value),
      },
    ];
  const unique = new Map();
  source
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((v) => unique.set(v.date, v));
  return [...unique.values()]
    .filter((v) => v.date >= periodStart(period, end) && v.date <= end)
    .map((v) => ({
      ...v,
      value:
        kind === "gain"
          ? round(
              Number(v.value) -
                Number(i.initial_amount) -
                movements
                  .filter(
                    (m) =>
                      m.investment_id === i.id &&
                      m.date > i.purchase_date &&
                      m.date <= v.date,
                  )
                  .reduce(
                    (n, m) =>
                      n +
                      ({ contribution: 1, withdrawal: -1, dividend: -1 }[
                        m.type
                      ] || 0) *
                        Number(m.amount),
                    0,
                  ),
            )
          : Number(v.value),
    }));
}
