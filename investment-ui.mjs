import {
  portfolioPerformance,
  investmentPerformance,
  investmentChart,
  investmentPeriods,
  marketTicker,
  investmentGroupHistory,
  investmentGroupNames,
  investmentGroup,
  periodStart,
} from "./investments.mjs?v=2.2.16";
import { recordedInvestmentChartHTML } from "./mobile/src/lib/recorded-investment-chart.js?v=2.2.16";
import { marketChartHTML, marketPeriods, marketRange } from "./mobile/src/lib/market-chart.js?v=2.2.16";
export function investmentUI({
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
}) {
  const pct = (n) =>
    n === null
      ? "—"
      : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
  function render() {
    const p = portfolioPerformance(
      rows("investments"),
      rows("investment_valuations"),
      rows("investment_transactions"),
      "all",
      today(),
    );
    const groups = Object.entries(investmentGroupNames)
      .map(([key, name]) => ({ key, name, points: investmentGroupHistory(rows("investments"), rows("investment_valuations"), rows("investment_transactions"), key, today()) }))
      .filter((group) => group.points.length);
    const activeCost = groups.reduce((total, group) => total + group.points.at(-1).activeCost, 0);
    const received = groups.reduce((total, group) => total + group.points.at(-1).received, 0);
    return (
      heading(
        "Investimentos",
        "Veja quanto investiu e quanto ganhou desde a compra.",
        button("＋ Novo investimento", "new-investment", "", "primary") +
          button("Atualizar pela cotação", "investment-quotes", "", "small"),
      ) +
      `<div class="report-summary">${kpi(
        "Capital ainda aplicado",
        activeCost,
        "Custo das posições que restam",
        "wallet",
      )}${kpi("Valor atual", p.value, "Posições ainda na carteira", "wallet", true)}${kpi("Ganho acumulado", p.gain || 0, pct(p.percent), "chart")}${kpi("Já recebido", received, "Vendas, resgates e proventos", "wallet")}</div><div class="info-banner">Ganho acumulado = valor atual + valores recebidos − capital total aplicado. O capital ainda aplicado desconta o custo dos ativos vendidos; o histórico continua preservado.</div><section class="panel"><h3>Carteira por tipo</h3><p class="form-note">Acompanhe separadamente renda fixa, renda variável e fundos ou outros investimentos.</p><div class="entity-grid">${groups.map((group) => { const last = group.points.at(-1); return `<article class="entity-card"><h3>${esc(group.name)}</h3><div class="entity-amount">${money(last.current)}</div><p>Capital ativo: ${money(last.activeCost)}</p><p>Ganho acumulado: <strong>${money(last.gain)} · ${pct(last.percent)}</strong></p><p class="form-note">Já recebido: ${money(last.received)} · realizado em vendas: ${money(last.realizedGain)}</p>${button("Ver evolução", "investment-group-chart", group.key, "small")}</article>`; }).join("")}</div></section><div class="entity-grid">${p.items
        .sort((a, b) => Object.keys(investmentGroupNames).indexOf(investmentGroup(rows("investments").find((i) => i.id === a.id))) - Object.keys(investmentGroupNames).indexOf(investmentGroup(rows("investments").find((i) => i.id === b.id))))
        .map((item, index, sorted) => {
          const i = rows("investments").find((i) => i.id === item.id);
          const group = investmentGroup(i);
          const previous = sorted[index - 1] && rows("investments").find((entry) => entry.id === sorted[index - 1].id);
          const groupHeading = !previous || investmentGroup(previous) !== group ? `<h3 class="investment-section-heading">${esc(investmentGroupNames[group])}</h3>` : "";
          const sales = rows("investment_transactions").filter((t) => t.investment_id === i.id && t.type === "sale");
          const saleReceived = sales.reduce((total, sale) => total + Number(sale.amount || 0), 0);
          const saleCost = sales.reduce((total, sale) => total + Number(sale.cost_basis || 0), 0);
          const mode = i.quote_mode || (i.type === "stocks" ? "stock" : "manual");
          const last = rows("investment_valuations").filter((v) => v.investment_id === i.id).sort((a,b) => a.date.localeCompare(b.date)).at(-1);
          const source = last?.source === "quote" ? "Cotação de " + formatDate(last.date) : "Último saldo informado";
          const details = i.quantity === 0 || i.quantity === "0" ? "Posição encerrada · histórico preservado" : mode === "stock"
            ? (Number(i.quantity) > 0 ? i.quantity + " papéis · " + source : "Informe a quantidade de papéis em Editar para ativar a cotação")
            : mode === "treasury"
              ? (Number(i.quantity) > 0 && i.maturity_date && i.treasury_title ? i.quantity + " títulos · " + source : "Informe a quantidade e o vencimento exato para ativar o preço oficial")
              : "Atualização manual do saldo";
          return `${groupHeading}<article class="entity-card"><h3>${esc(i.name)}</h3><p>${esc(i.institution || "")} · ${esc(i.type)}</p><p>Compra em ${formatDate(i.purchase_date)} · ${money(i.initial_amount)}</p><div class="entity-amount">${money(i.current_value)}</div><p class="form-note">${esc(details)}</p><p style="color:${item.gain < 0 ? "#a83737" : "#205b4e"}"><strong>${item.gain < 0 ? "Perda" : "Ganho"}: ${money(item.gain)} · ${pct(item.percent)}</strong></p>${sales.length ? `<p class="form-note">Já recebido em vendas: ${money(saleReceived)} · custo vendido: ${money(saleCost)}</p>` : ""}${item.realizedGain ? `<p class="form-note">Ganho realizado em vendas: ${money(item.realizedGain)}</p>` : ""}<p class="form-note">Sobre o valor de compra, considerando as movimentações registradas.</p><div class="entity-actions">${button("Ver gráficos", "investment-chart", i.id, "primary small")}${button(mode === "manual" ? "Atualizar saldo" : "Corrigir saldo", "investment-value", i.id, "small")}${button("Histórico", "investment-history", i.id, "small")}${mode === "manual" ? "" : button(Number(i.quantity) === 0 && i.quantity != null ? "Comprar" : "Vender", Number(i.quantity) === 0 && i.quantity != null ? "investment-trade-buy" : "investment-trade-sale", i.id, "small")}${button("Editar", "edit-investment", i.id, "small")}</div></article>`;
        })
        .join("")}</div>`
    );
  }
  function openGroup(group, period = "30d") {
    const name = investmentGroupNames[group];
    if (!name) return;
    const all = investmentGroupHistory(rows("investments"), rows("investment_valuations"), rows("investment_transactions"), group, today());
    const points = all.filter((point) => point.date >= periodStart(period, today()));
    const last = all.at(-1);
    openDialog(
      `Evolução · ${name}`,
      `${last ? `<div class="info-banner">Valor atual: ${money(last.current)} · capital ainda aplicado: ${money(last.activeCost)}<br>Ganho total: <strong>${money(last.gain)} · ${pct(last.percent)}</strong> · já recebido: ${money(last.received)}</div>` : ""}<label>Período<select id="investment-group-period">${investmentPeriods.map(([value, label]) => `<option value="${value}" ${period === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><iframe id="investment-group-frame" title="Evolução detalhada de ${esc(name)}" style="width:100%;height:670px;border:0;border-radius:14px;margin-top:12px"></iframe><p class="form-note">Os pontos são datas registradas. Uma venda reduz o saldo da carteira, mas o dinheiro recebido permanece no ganho acumulado; saldos sem cotação nova são identificados no detalhe.</p>`,
    );
    document.getElementById("investment-group-frame").srcdoc = recordedInvestmentChartHTML(points, name, { group: true });
    document.getElementById("investment-group-period").onchange = (event) => openGroup(group, event.target.value);
  }
  function open(id, kind = "auto", period = "all") {
    const i = rows("investments").find((i) => i.id === id);
    if (kind === "auto") {
      kind = i.quote_mode === "stock" ? "market" : "balance";
      period = i.quote_mode === "stock" ? "month" : "all";
    }
    const ticker = i.quote_mode === "stock" ? marketTicker(i) : "",
      r = investmentPerformance(
        i,
        rows("investment_valuations"),
        rows("investment_transactions"),
        "all",
        today(),
      );
    const points = investmentChart(
        i,
        rows("investment_valuations"),
        rows("investment_transactions"),
        kind,
        period,
        today(),
      ),
      max = Math.max(1, ...points.map((p) => Math.abs(p.value)));
    const marketTabs = `<div role="group" aria-label="Período da cotação" style="display:flex;gap:6px;overflow-x:auto;padding:8px 0">${marketPeriods.map(([value, label]) => `<button type="button" data-market-period="${value}" aria-pressed="${period === value}" class="button small ${period === value ? "primary" : ""}" style="flex:none">${label}</button>`).join("")}</div>`;
    openDialog(
      "Gráficos · " + i.name,
      `<p>Compra: <strong>${money(i.initial_amount)}</strong> · Atual informado: <strong>${money(i.current_value)}</strong><br>Ganho desde a compra: <strong>${money(r.gain)} · ${pct(r.percent)}</strong></p><div class="form-grid"><label>Gráfico<select id="investment-chart-kind">${[
        ["comparison", "Compra × valor atual"],
        ["balance", "Evolução do saldo"],
        ["gain", "Evolução do ganho"],
        ...(i.quote_mode === "stock" ? [["market", "Cotação do papel na bolsa"]] : []),
      ]
        .map(
          ([v, l]) =>
            `<option value="${v}" ${kind === v ? "selected" : ""}>${l}</option>`,
        )
        .join(
          "",
        )}</select></label>${["balance", "gain"].includes(kind) ? `<label>Período<select id="investment-chart-period">${investmentPeriods.map(([v, l]) => `<option value="${v}" ${period === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}</div>${kind === "market" ? marketTabs : ""}${kind === "market" ? (ticker ? `<p class="form-note">Mercado: ${esc(ticker)}. O gráfico externo mostra a cotação do papel; o ganho acima usa o saldo cadastrado. A cotação pode ter atraso e não altera seu saldo automaticamente.</p><iframe id="investment-market-frame" title="Cotação de ${esc(ticker)}" style="width:100%;height:580px;border:0;border-radius:14px" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>` : `<p>Preencha o código do papel (ex.: PETR4) no cadastro para consultar o gráfico de mercado.</p>${button("Editar cadastro", "edit-investment", id, "small")}`) : ["balance", "gain"].includes(kind) ? `<iframe id="investment-series-frame" title="Evolução de ${esc(i.name)}" style="width:100%;height:500px;border:0;border-radius:14px"></iframe>` : `<div class="investment-bars" style="min-height:200px">${points.map((p) => `<button type="button" class="investment-bar" title="${esc(formatDate(p.date) + " · " + money(p.value))}"><strong>${money(p.value)}</strong><span style="height:${Math.max(3, (Math.abs(p.value) / max) * 140)}px;background:${p.value < 0 ? "#a83737" : "#205b4e"}"></span><small>${kind === "comparison" ? p.label : formatDate(p.date)}</small></button>`).join("") || "<p>Nenhum saldo registrado neste período.</p>"}</div><p class="form-note">${kind === "comparison" ? "Comparação dos valores de compra e atual já cadastrados." : "Mostra apenas datas conhecidas, sem inventar valores entre as atualizações."}</p>`}`,
    );
    document.getElementById("investment-chart-kind").onchange = (e) =>
      open(id, e.target.value, e.target.value === "market" ? "month" : "all");
    const select = document.getElementById("investment-chart-period");
    if (select) select.onchange = (e) => open(id, kind, e.target.value);
    document.querySelectorAll("[data-market-period]").forEach((item) => {
      item.onclick = () => open(id, "market", item.dataset.marketPeriod);
    });
    const seriesFrame = document.getElementById("investment-series-frame");
    if (seriesFrame) seriesFrame.srcdoc = recordedInvestmentChartHTML(points, i.name, { metric: kind, movements: rows("investment_transactions").filter((t) => t.investment_id === id) });
    const frame = document.getElementById("investment-market-frame");
    if (frame) {
      frame.srcdoc = "<p>Consultando o histórico de mercado…</p>";
      rpc("get_investment_market", {
        p_investment: id,
        p_range: marketRange(period),
      })
        .then((q) => {
          if (frame.isConnected) frame.srcdoc = marketChartHTML(q, i, period, rows("investment_transactions").filter((t) => t.investment_id === id));
        })
        .catch((e) => {
          if (frame.isConnected) frame.srcdoc = "<p>" + esc(e.message) + "</p>";
        });
    }
  }
  return { render, open, openGroup };
}
