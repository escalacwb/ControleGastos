export const investmentPeriods = [
  ["day", "Dia"],
  ["month", "Mês"],
  ["30d", "30 dias"],
  ["90d", "90 dias"],
  ["year", "Ano"],
  ["12m", "12 meses"],
  ["all", "Desde o início"],
];
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
function quantityAtDate(investment, movements, date) {
  if (!['stock', 'treasury'].includes(investment.quote_mode) || investment.quantity == null) return null;
  const trades = movements.filter((m) => m.investment_id === investment.id && ['buy', 'sale'].includes(m.type));
  const initial = Number(investment.quantity) - trades.reduce((sum, m) => sum + (m.type === 'buy' ? 1 : -1) * Number(m.quantity || 0), 0);
  return round(initial + trades.filter((m) => m.date <= date).reduce((sum, m) => sum + (m.type === 'buy' ? 1 : -1) * Number(m.quantity || 0), 0));
}
export function investmentGroup(investment) {
  if (investment.quote_mode === "treasury" || investment.type === "fixed_income") return "fixed";
  if (investment.quote_mode === "stock" || investment.type === "stocks" || investment.type === "variable") return "variable";
  return "other";
}
export const investmentGroupNames = { fixed: "Renda fixa", variable: "Renda variável", other: "Fundos e outros" };
export function investmentGroupHistory(investments, valuations, movements, group, end) {
  const assets = investments.filter((i) => group === "all" || investmentGroup(i) === group);
  const ids = new Set(assets.map((i) => i.id));
  const dates = [...new Set([
    ...assets.map((i) => i.purchase_date),
    ...valuations.filter((v) => ids.has(v.investment_id) && quantityAtDate(assets.find((a) => a.id === v.investment_id), movements, v.date) !== 0).map((v) => v.date),
    ...movements.filter((m) => ids.has(m.investment_id)).map((m) => m.date),
  ].filter((date) => date && date <= end))].sort();
  const snapshots = dates.map((date) => {
    let current = 0, invested = 0, activeCost = 0, received = 0, realizedGain = 0;
    const assetsAtDate = [];
    for (const asset of assets.filter((i) => i.purchase_date <= date)) {
      const history = valuations.filter((v) => v.investment_id === asset.id && v.date <= date)
        .sort((a, b) => a.date.localeCompare(b.date));
      const assetMovements = movements.filter((m) => m.investment_id === asset.id && m.date <= date);
      const principal = Number(asset.initial_amount || 0);
      const valuation = history.at(-1);
      const assetCurrent = quantityAtDate(asset, movements, date) === 0 ? 0 : Number(valuation?.value ?? principal);
      let assetInvested = principal, assetCost = principal, assetReceived = 0, assetRealized = 0;
      for (const movement of assetMovements) {
        const amount = Number(movement.amount || 0);
        if (movement.type === "buy" || movement.type === "contribution") {
          assetInvested += amount;
          assetCost += amount;
        } else if (movement.type === "sale") {
          assetReceived += amount;
          assetCost -= Number(movement.cost_basis || 0);
          assetRealized += Number(movement.realized_gain || 0);
        } else if (movement.type === "withdrawal") {
          assetReceived += amount;
          assetCost -= amount;
        } else if (movement.type === "dividend") {
          assetReceived += amount;
        }
      }
      current += assetCurrent;
      invested += assetInvested;
      activeCost += assetCost;
      received += assetReceived;
      realizedGain += assetRealized;
      assetsAtDate.push({ id: asset.id, name: asset.name, current: round(assetCurrent), invested: round(assetInvested), received: round(assetReceived), gain: round(assetCurrent + assetReceived - assetInvested), valuationDate: valuation?.date || asset.purchase_date, source: valuation?.source || "purchase" });
    }
    const gain = round(current + received - invested);
    return { date, current: round(current), invested: round(invested), activeCost: round(Math.max(0, activeCost)), received: round(received), realizedGain: round(realizedGain), gain, percent: invested > 0 ? round(gain / invested * 100) : null, assets: assetsAtDate };
  });
  let returnIndex = 100;
  return snapshots.map((point, index) => {
    const previous = snapshots[index - 1];
    const newCapital = assets.filter((asset) => asset.purchase_date === point.date && previous)
      .reduce((sum, asset) => sum + Number(asset.initial_amount || 0), 0)
      + movements.filter((movement) => ids.has(movement.investment_id) && movement.date === point.date && ["buy", "contribution"].includes(movement.type))
        .reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
    const capitalAtRisk = Number(previous?.current || 0) + newCapital;
    const dayGain = previous ? round(point.gain - previous.gain) : 0;
    const dailyReturn = previous && capitalAtRisk > 0 ? dayGain / capitalAtRisk : null;
    if (dailyReturn !== null) returnIndex *= 1 + dailyReturn;
    const oldAssets = new Map((previous?.assets || []).map((asset) => [asset.id, asset]));
    const changes = point.assets.map((asset) => ({ name: asset.name, amount: round(asset.gain - (oldAssets.get(asset.id)?.gain || 0)) }))
      .filter((change) => Math.abs(change.amount) >= 0.01)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    const events = movements.filter((movement) => ids.has(movement.investment_id) && movement.date === point.date)
      .map((movement) => {
        const asset = assets.find((item) => item.id === movement.investment_id);
        const priorQuote = valuations.filter((valuation) => valuation.investment_id === asset.id && valuation.source === "quote" && valuation.date < point.date)
          .sort((a, b) => a.date.localeCompare(b.date)).at(-1);
        const expected = movement.type === "sale" && priorQuote?.price && movement.quantity
          ? round(Number(priorQuote.price) * Number(movement.quantity)) : null;
        return { name: asset.name, type: movement.type, amount: round(Number(movement.amount || 0)), quantity: movement.quantity == null ? null : Number(movement.quantity), realizedGain: movement.realized_gain == null ? null : round(Number(movement.realized_gain)), priorQuoteDate: expected == null ? null : priorQuote.date, priorQuoteValue: expected, differenceFromQuote: expected == null ? null : round(Number(movement.amount) - expected) };
      });
    const carried = point.assets.filter((asset) => asset.current > 0 && asset.valuationDate < point.date)
      .map((asset) => ({ name: asset.name, date: asset.valuationDate }));
    return { ...point, change: previous ? dayGain : null, changes, events, carried,
      returnIndex: Math.round(returnIndex * 10000) / 10000,
      returnPercent: round((returnIndex / 100 - 1) * 100),
      dailyReturn: dailyReturn === null ? null : round(dailyReturn * 100),
    };
  });
}
export function periodStart(period, end) {
  const d = new Date(end + "T12:00:00Z");
  if (period === "all") return "0000-01-01";
  if (period === "month") return end.slice(0, 7) + "-01";
  if (period === "year") return end.slice(0, 4) + "-01-01";
  if (period === "30d" || period === "90d") {
    d.setUTCDate(d.getUTCDate() - (period === "30d" ? 30 : 90));
    return d.toISOString().slice(0, 10);
  }
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
    const lastMovementDate = movements
      .filter((m) => m.investment_id === investment.id && m.date <= end)
      .map((m) => m.date)
      .sort()
      .at(-1);
    base = {
      date: investment.purchase_date,
      value: Number(investment.initial_amount),
      source: "purchase",
    };
    last = {
      date: [last?.date, lastMovementDate, investment.purchase_date]
        .filter(Boolean)
        .sort()
        .at(-1),
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
  const contributions = sum("contribution") + sum("buy"),
    withdrawals = sum("withdrawal") + sum("sale"),
    dividends = sum("dividend");
  const realizedGain = round(flows.filter((m) => m.type === "sale").reduce((n, m) => n + Number(m.realized_gain || 0), 0));
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
        (["contribution", "withdrawal", "buy", "sale"].includes(m.type)
          ? (Number(m.amount) *
              (["contribution", "buy"].includes(m.type) ? 1 : -1) *
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
    realizedGain,
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
const quoteAttempts = new Map();
export function quoteRefreshDue(owner, date, now = Date.now()) {
  const key = owner + ":" + date;
  if (now - (quoteAttempts.get(key) ?? -Infinity) < 3 * 60 * 60 * 1000) return false;
  quoteAttempts.set(key, now);
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
  const finalSale=movements.filter(m=>m.investment_id===i.id && m.type==='sale' && quantityAtDate(i,movements,m.date)===0).sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
  const valueDate=finalSale?.date || (lastRecorded&&Number(lastRecorded.value)===Number(i.current_value)?lastRecorded.date:String(i.updated_at||end).slice(0,10));
  const source = [
    { date: i.purchase_date, value: Number(i.initial_amount), label: "Compra" },
    ...valuations
      .filter((v) => v.investment_id === i.id && quantityAtDate(i, movements, v.date) !== 0)
      .map((v) => ({ ...v, label: "Saldo registrado" })),
    ...movements.filter((m) => m.investment_id === i.id && m.type === 'sale' && quantityAtDate(i, movements, m.date) === 0)
      .map((m) => ({ date: m.date, value: 0, label: "Posição encerrada" })),
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
                      ({ contribution: 1, withdrawal: -1, dividend: -1, buy: 1, sale: -1 }[
                        m.type
                      ] || 0) *
                        Number(m.amount),
                    0,
                  ),
            )
          : Number(v.value),
    }));
}
