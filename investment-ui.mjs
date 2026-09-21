import {
  portfolioPerformance,
  investmentPerformance,
  investmentChart,
  investmentPeriods,
  marketTicker,
  marketLineHTML,
  marketRange,
} from "./investments.mjs";
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
    return (
      heading(
        "Investimentos",
        "Veja quanto investiu e quanto ganhou desde a compra.",
        button("＋ Novo investimento", "new-investment", "", "primary") +
          button("Atualizar pela cotação", "investment-quotes", "", "small"),
      ) +
      `<div class="report-summary">${kpi(
        "Valor de compra",
        rows("investments").reduce((n, i) => n + Number(i.initial_amount), 0),
        "Referência cadastrada",
        "wallet",
      )}${kpi("Valor atual", p.value, "Últimos saldos informados", "wallet", true)}${kpi("Ganho desde a compra", p.gain || 0, pct(p.percent), "chart")}</div><div class="entity-grid">${p.items
        .map((item) => {
          const i = rows("investments").find((i) => i.id === item.id);
          return `<article class="entity-card"><h3>${esc(i.name)}</h3><p>${esc(i.institution || "")} · ${esc(i.type)}</p><p>Compra em ${formatDate(i.purchase_date)} · ${money(i.initial_amount)}</p><div class="entity-amount">${money(i.current_value)}</div><p style="color:${item.gain < 0 ? "#a83737" : "#205b4e"}"><strong>${item.gain < 0 ? "Perda" : "Ganho"}: ${money(item.gain)} · ${pct(item.percent)}</strong></p><p class="form-note">Sobre o valor de compra, considerando as movimentações registradas.</p><div class="entity-actions">${button("Ver gráficos", "investment-chart", i.id, "primary small")}${button("Atualizar saldo", "investment-value", i.id, "small")}${button("Histórico", "investment-history", i.id, "small")}${button("Editar", "edit-investment", i.id, "small")}</div></article>`;
        })
        .join("")}</div>`
    );
  }
  function open(id, kind = "comparison", period = "all") {
    const i = rows("investments").find((i) => i.id === id),
      ticker = marketTicker(i),
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
    openDialog(
      "Gráficos · " + i.name,
      `<p>Compra: <strong>${money(i.initial_amount)}</strong> · Atual informado: <strong>${money(i.current_value)}</strong><br>Ganho desde a compra: <strong>${money(r.gain)} · ${pct(r.percent)}</strong></p><div class="form-grid"><label>Gráfico<select id="investment-chart-kind">${[
        ["comparison", "Compra × valor atual"],
        ["balance", "Evolução do saldo"],
        ["gain", "Evolução do ganho"],
        ["market", "Cotação do papel na bolsa"],
      ]
        .map(
          ([v, l]) =>
            `<option value="${v}" ${kind === v ? "selected" : ""}>${l}</option>`,
        )
        .join(
          "",
        )}</select></label>${["balance", "gain", "market"].includes(kind) ? `<label>Período<select id="investment-chart-period">${investmentPeriods.map(([v, l]) => `<option value="${v}" ${period === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}</div>${kind === "market" ? (ticker ? `<p class="form-note">Mercado: ${esc(ticker)}. O gráfico externo mostra a cotação do papel; o ganho acima usa o saldo cadastrado. A cotação pode ter atraso e não altera seu saldo automaticamente.</p><iframe id="investment-market-frame" title="Cotação de ${esc(ticker)}" style="width:100%;height:440px;border:0" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>` : `<p>Preencha o código do papel (ex.: PETR4) no cadastro para consultar o gráfico de mercado.</p>${button("Editar cadastro", "edit-investment", id, "small")}`) : `<div class="investment-bars" style="min-height:200px">${points.map((p) => `<button type="button" class="investment-bar" title="${esc(formatDate(p.date) + " · " + money(p.value))}"><strong>${money(p.value)}</strong><span style="height:${Math.max(3, (Math.abs(p.value) / max) * 140)}px;background:${p.value < 0 ? "#a83737" : "#205b4e"}"></span><small>${kind === "comparison" ? p.label : formatDate(p.date)}</small></button>`).join("") || "<p>Nenhum saldo registrado neste período.</p>"}</div><p class="form-note">${kind === "comparison" ? "Comparação dos valores de compra e atual já cadastrados." : "Mostra apenas datas conhecidas, sem inventar valores entre as atualizações."}</p>`}`,
    );
    document.getElementById("investment-chart-kind").onchange = (e) =>
      open(id, e.target.value, period);
    const select = document.getElementById("investment-chart-period");
    if (select) select.onchange = (e) => open(id, kind, e.target.value);
    const frame = document.getElementById("investment-market-frame");
    if (frame) {
      frame.srcdoc = "<p>Consultando o histórico de mercado…</p>";
      rpc("get_investment_market", {
        p_investment: id,
        p_range: marketRange(period),
      })
        .then((q) => {
          if (frame.isConnected) frame.srcdoc = marketLineHTML(q, i);
        })
        .catch((e) => {
          if (frame.isConnected) frame.srcdoc = "<p>" + esc(e.message) + "</p>";
        });
    }
  }
  return { render, open };
}
