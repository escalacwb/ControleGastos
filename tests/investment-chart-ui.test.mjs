import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { investmentGroupChartHTML, investmentSeriesChartHTML } from "../mobile/src/lib/investment-group-chart.js";
import { investmentGroupHistory } from "../investments.mjs";

const point = { date: "2026-10-05", current: 0, invested: 1000, activeCost: 0, received: 1100, gain: 100, percent: 10, change: 100, changes: [{ name: "Tesouro", amount: 100 }], events: [{ name: "Tesouro", type: "sale", amount: 1100, priorQuoteDate: "2026-10-02", priorQuoteValue: 1120, differenceFromQuote: -20 }], carried: [] };

test("interactive group chart embeds parseable script and explains a sale versus quote", () => {
  const html = investmentGroupChartHTML([point], "Renda fixa");
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new vm.Script(script));
  assert.match(html, /Última cotação/);
  assert.match(html, /Data/);
});

test("asset series chart embeds parseable point detail", () => {
  const html = investmentSeriesChartHTML([{ date: "2026-10-05", value: 1100, label: "Venda" }], "balance", "Tesouro", []);
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new vm.Script(script));
  assert.match(html, /Saldo do ativo/);
});

test("sale point identifies received cash and difference from the prior quote", () => {
  const asset = { id: "treasury", name: "Tesouro IPCA+ 2040", quote_mode: "treasury", type: "fixed_income", purchase_date: "2025-11-08", initial_amount: 25013.08, current_value: 0 };
  const valuations = [{ investment_id: asset.id, date: "2026-10-02", value: 27979.85, price: 1787.85, source: "quote" }, { investment_id: asset.id, date: "2026-10-05", value: 0, source: "trade" }];
  const movements = [{ investment_id: asset.id, date: "2026-10-05", type: "sale", amount: 25473.51, quantity: 15.65, cost_basis: 25013.08, realized_gain: 460.43 }];
  const history = investmentGroupHistory([asset], valuations, movements, "fixed", "2026-10-05");
  const sale = history.at(-1);
  assert.equal(sale.current, 0);
  assert.equal(sale.received, 25473.51);
  assert.equal(sale.gain, 460.43);
  assert.equal(sale.change, -2506.34);
  assert.equal(sale.events[0].priorQuoteValue, 27979.85);
  assert.equal(sale.events[0].differenceFromQuote, -2506.34);
});
