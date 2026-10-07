const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

function chartRuntime(points) {
  const svg = document.getElementById("chart");
  const headline = document.getElementById("headline");
  const delta = document.getElementById("delta");
  const subtitle = document.getElementById("subtitle");
  const detail = document.getElementById("detail");
  const tooltip = document.getElementById("tooltip");
  const brl = (n) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);
  const pct = (n) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(n) || 0) + "%";
  const date = (s) => new Date(s + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "UTC" });
  const compact = (n) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  const clean = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let mode = "return", selected = Math.max(0, points.length - 1);
  const initialIndex = Number(points[0]?.returnIndex) || 100;
  const initialGain = Number(points[0]?.gain) || 0;
  const initialRealized = Number(points[0]?.realizedGain) || 0;
  const initialReceived = Number(points[0]?.received) || 0;
  const value = (p) => mode === "return" ? (Number(p.returnIndex || 100) / initialIndex - 1) * 100
    : mode === "gain" ? (Number(p.gain) || 0) - initialGain
      : mode === "realized" ? (Number(p.realizedGain) || 0) - initialRealized
        : Number(p.current) || 0;
  const format = (n) => mode === "return" ? pct(n) : brl(n);

  function details(index) {
    selected = index;
    const point = points[index];
    if (!point) return;
    const events = (point.events || []).map((event) => {
      const type = ({ sale: "Venda", buy: "Compra", contribution: "Aporte", withdrawal: "Resgate", dividend: "Provento" })[event.type] || event.type;
      const difference = event.type === "sale" && event.differenceFromQuote != null
        ? `<small>Diferença frente à última cotação conhecida: ${brl(event.differenceFromQuote)}. Isso pode alterar o ganho desde a avaliação anterior, mesmo com lucro sobre a compra.</small>` : "";
      return `<div class="event"><strong>${clean(event.name)}</strong> · ${clean(type)} · ${brl(event.amount)}${event.realizedGain != null ? ` · ganho realizado ${brl(event.realizedGain)}` : ""}${difference}</div>`;
    }).join("");
    detail.innerHTML = `<strong>${date(point.date)}</strong><div class="facts"><div>Saldo na carteira<b>${brl(point.current)}</b></div><div>Ganho no período<b>${brl((Number(point.gain) || 0) - initialGain)}</b></div><div>Ganho desde o início<b>${brl(point.gain)}</b></div><div>Lucro realizado no período<b>${brl((Number(point.realizedGain) || 0) - initialRealized)}</b></div><div>Recebido no período<b>${brl((Number(point.received) || 0) - initialReceived)}</b></div><div>Recebido desde o início<b>${brl(point.received)}</b></div></div>${events}`;
  }

  function draw() {
    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === mode);
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    });
    if (!points.length) {
      headline.textContent = "—";
      delta.textContent = "Sem avaliações neste período";
      svg.innerHTML = "";
      detail.textContent = "Escolha outro período.";
      return;
    }
    const values = points.map(value), first = points[0], last = points[points.length - 1];
    const start = value(first), finish = value(last), change = finish - start;
    headline.textContent = format(finish);
    delta.textContent = mode === "current" ? `${change >= 0 ? "↑ +" : "↓ −"}${format(Math.abs(change))} no período` : `Desde ${date(first.date)}`;
    delta.className = change < -0.0001 ? "change down" : "change up";
    subtitle.textContent = `${date(first.date)} a ${date(last.date)} · ${points.length} datas conhecidas`;

    const min = Math.min(...values), max = Math.max(...values), pad = Math.max(mode === "return" ? 0.25 : 0.01, (max - min) * 0.12);
    const lo = min - pad, hi = max + pad, t0 = Date.parse(first.date + "T12:00:00Z"), t1 = Date.parse(last.date + "T12:00:00Z");
    const x = (p) => t0 === t1 ? 375 : 70 + (Date.parse(p.date + "T12:00:00Z") - t0) / (t1 - t0) * 610;
    const y = (n) => 245 - (n - lo) / (hi - lo) * 205;
    const ticks = Array.from({ length: 5 }, (_, i) => {
      const n = lo + (hi - lo) * i, yy = y(n);
      return `<line class="grid" x1="70" x2="680" y1="${yy}" y2="${yy}"/><text class="axis" x="62" y="${yy + 4}" text-anchor="end">${mode === "return" ? pct(n) : compact(n)}</text>`;
    }).join("");
    const path = points.map((p, i) => `${i ? "L" : "M"}${x(p).toFixed(1)} ${y(value(p)).toFixed(1)}`).join(" ");
    svg.innerHTML = `${ticks}<path class="line ${finish < start ? "negative" : ""}" d="${path}"/><line id="cross" class="cross" y1="31" y2="249" visibility="hidden"/><circle id="dot" class="dot" r="5" visibility="hidden"/><text class="axis" x="70" y="276">${date(first.date)}</text><text class="axis" x="680" y="276" text-anchor="end">${date(last.date)}</text><rect class="hit" x="70" y="28" width="610" height="225"/>`;
    const cross = svg.querySelector("#cross"), dot = svg.querySelector("#dot");
    const hit = svg.querySelector(".hit");
    function focus(event) {
      const box = svg.getBoundingClientRect();
      const px = (event.clientX - box.left) / box.width * 750;
      const target = t0 + (Math.max(70, Math.min(680, px)) - 70) / 610 * (t1 - t0);
      let low = 0, high = points.length - 1;
      while (low < high) { const middle = (low + high) >> 1; if (Date.parse(points[middle].date + "T12:00:00Z") < target) low = middle + 1; else high = middle; }
      const chosen = low > 0 && Math.abs(Date.parse(points[low - 1].date + "T12:00:00Z") - target) < Math.abs(Date.parse(points[low].date + "T12:00:00Z") - target) ? low - 1 : low;
      const point = points[chosen], xx = x(point);
      cross.setAttribute("x1", xx); cross.setAttribute("x2", xx); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", xx); dot.setAttribute("cy", y(value(point))); dot.setAttribute("visibility", "visible");
      tooltip.hidden = false;
      tooltip.style.left = `${Math.min(Math.max(4, xx / 750 * box.width - 65), box.width - 150)}px`;
      tooltip.innerHTML = `<strong>${format(value(point))}</strong>${date(point.date)}`;
      details(chosen);
    }
    hit.addEventListener("pointermove", focus);
    hit.addEventListener("pointerdown", focus);
    hit.addEventListener("pointerleave", () => { tooltip.hidden = true; cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); });
    details(Math.min(selected, points.length - 1));
  }
  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => { mode = button.dataset.mode; draw(); }));
  draw();
}

export function groupReturnChartHTML(points, title) {
  const data = JSON.stringify(points).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    *{box-sizing:border-box}body{margin:0;color:#203b32;background:#fff;font:14px system-ui,-apple-system,sans-serif}.wrap{padding:14px 9px}.title{font-size:18px;font-weight:700;padding:0 10px}.tabs{display:flex;gap:5px;overflow-x:auto;padding:12px 9px 8px}.tabs button{flex:none;border:0;border-radius:9px;background:#f1f4ef;color:#566d5f;padding:9px 11px;font:inherit;cursor:pointer}.tabs button.active{background:#dff0e4;color:#145a3e;font-weight:700}.figure{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding:2px 10px}.figure strong{font-size:31px;font-weight:500;letter-spacing:-.04em}.change{font-size:12px;padding:5px 7px;border-radius:7px;font-weight:700}.up{background:#e7f4eb;color:#177046}.down{background:#f9ebe8;color:#ad4844}.sub{color:#728477;font-size:12px;padding:4px 10px 9px}.plot{position:relative}svg{display:block;width:100%;height:auto;touch-action:none}.axis{fill:#748578;font-size:11px}.grid{stroke:#e5ece6;stroke-width:1}.line{fill:none;stroke:#177951;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}.line.negative{stroke:#b6504a}.cross{stroke:#7c8d80;stroke-dasharray:3 3}.dot{fill:#177951;stroke:white;stroke-width:2}.hit{fill:transparent}.tooltip{position:absolute;top:9px;padding:7px 9px;border:1px solid #dce6dc;border-radius:7px;background:white;box-shadow:0 3px 12px #17392b22;pointer-events:none;min-width:145px;font-size:12px}.tooltip strong{display:block;font-size:14px}.detail{border-top:1px solid #e3ebe3;padding:12px 10px;margin-top:5px}.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:9px}.facts div{padding:8px;border-radius:8px;background:#f4f7f3;color:#708174;font-size:11px}.facts b{display:block;margin-top:3px;color:#253d35;font-size:14px}.event{border-top:1px solid #e6ece6;margin-top:9px;padding-top:8px;line-height:1.4}.event small{display:block;color:#6e8072}.note{font-size:11px;color:#708174;line-height:1.45;padding:10px}
    </style><div class="wrap"><div class="title">${escapeHTML(title)}</div><div class="tabs" role="group" aria-label="Métrica do gráfico"><button data-mode="return">Rentabilidade</button><button data-mode="gain">Ganho no período</button><button data-mode="current">Montante</button><button data-mode="realized">Lucro realizado no período</button></div><div class="figure"><strong id="headline"></strong><span id="delta" class="change"></span></div><div id="subtitle" class="sub"></div><div class="plot"><svg id="chart" viewBox="0 0 750 292" role="img" aria-label="Evolução de ${escapeHTML(title)}"></svg><div id="tooltip" class="tooltip" hidden></div></div><div id="detail" class="detail"></div><div class="note">Rentabilidade ajustada a aportes e resgates, encadeada entre avaliações conhecidas. Ganho no período é a variação do ganho em reais entre as datas mostradas; não é o percentual multiplicado pelo saldo final. Montante é o que ainda está investido. Uma venda abaixo da última avaliação pode reduzir a rentabilidade mesmo com lucro desde a compra.</div></div><script>(${chartRuntime.toString()})(${data});</script></html>`;
}
