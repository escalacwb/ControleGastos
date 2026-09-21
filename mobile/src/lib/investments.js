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
  const base =
    period === "all"
      ? history[0]
      : history.filter((v) => v.date < start).at(-1);
  const last = history.at(-1);
  if (!base || !last || last.date === base.date || last.date < start)
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
  const capital =
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
    new Set(items.map((i) => i.base?.date + ":" + i.last?.date)).size === 1;
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
  const { data, error } = await client.functions.invoke("investment-quotes");
  if (error)
    throw Error(
      "Cotações indisponíveis. Confira a configuração do provedor; seus saldos foram preservados.",
    );
  if (data?.error) throw Error(data.error);
  return data;
}
const quoteAttempts = new Set();
export function quoteRefreshDue(owner, date) {
  const key = owner + ":" + date;
  if (quoteAttempts.has(key)) return false;
  quoteAttempts.add(key);
  return true;
}
