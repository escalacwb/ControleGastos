import test from "node:test";
import assert from "node:assert/strict";
import {
  investmentPerformance as performance,
  portfolioPerformance,
  portfolioHistory,
  periodStart,
  investmentGroupHistory,
  investmentChart,
} from "../investments.mjs";
const i = { id: "a", name: "Reserva", current_value: 12500, initial_amount:10000, purchase_date:'2025-12-31' };
const values = [
  { investment_id: "a", date: "2025-12-31", value: 10000 },
  { investment_id: "a", date: "2026-01-31", value: 12500 },
];
test("aporte não é rendimento; pondera o capital pelo tempo", () => {
  const r = performance(
    i,
    values,
    [
      {
        investment_id: "a",
        date: "2026-01-16",
        type: "contribution",
        amount: 2000,
      },
    ],
    "month",
    "2026-01-31",
  );
  assert.equal(r.gain, 500);
  assert.equal(r.contributions, 2000);
  assert.ok(r.percent > 4 && r.percent < 5);
});
test("resgate e provento não viram perda", () => {
  const r = performance(
    i,
    [values[0], { ...values[1], value: 9000 }],
    [
      {
        investment_id: "a",
        date: "2026-01-20",
        type: "withdrawal",
        amount: 1500,
      },
      { investment_id: "a", date: "2026-01-25", type: "dividend", amount: 100 },
    ],
    "year",
    "2026-01-31",
  );
  assert.equal(r.gain, 600);
});
test("rendimento incorporado não é descontado como aporte", () => {
  assert.equal(
    performance(
      i,
      values,
      [{ investment_id: "a", date: "2026-01-20", type: "yield", amount: 2500 }],
      "all",
      "2026-01-31",
    ).gain,
    2500,
  );
});
test("histórico insuficiente e mês sem atualização não inventam retorno", () => {
  assert.equal(performance(i, [values[1]], [], "all", "2026-01-31").gain, 2500);
  assert.equal(performance(i, values, [], "month", "2026-02-10").gain, null);
});
test("não agrega rentabilidade de períodos diferentes", () => {
  const j = { ...i, id: "b" };
  const p = portfolioPerformance(
    [i, j],
    [
      ...values,
      { investment_id: "b", date: "2026-01-10", value: 100 },
      { investment_id: "b", date: "2026-01-31", value: 110 },
    ],
    [],
    "month",
    "2026-01-31",
  );
  assert.equal(p.gain, null);
});
test("janela de 12 meses trata ano bissexto", () =>
  assert.equal(periodStart("12m", "2024-02-29"), "2023-02-28"));

test("venda parcial preserva ganho realizado e saldo remanescente", () => {
  const position = { id: "s", name: "Papel", initial_amount: 1000, current_value: 600, purchase_date: "2026-01-01", updated_at: "2026-02-02" };
  const trades = [{ investment_id: "s", type: "sale", amount: 690, realized_gain: 190, date: "2026-02-02", quantity: 5 }];
  const result = performance(position, [{ investment_id: "s", date: "2026-02-02", value: 600 }], trades, "all", "2026-02-02");
  assert.equal(result.gain, 290);
  assert.equal(result.realizedGain, 190);
  assert.equal(result.value, 600);
});

test("posição totalmente vendida mantém ganho no histórico com saldo zero", () => {
  const position = { id: "s", name: "Papel", initial_amount: 1000, current_value: 0, purchase_date: "2026-01-01", updated_at: "2026-02-02" };
  const trades = [{ investment_id: "s", type: "sale", amount: 1190, realized_gain: 190, date: "2026-02-02", quantity: 10 }];
  const result = performance(position, [{ investment_id: "s", date: "2026-02-02", value: 0 }], trades, "all", "2026-02-02");
  assert.equal(result.gain, 190);
  assert.equal(result.realizedGain, 190);
  assert.equal(result.value, 0);
});
test("venda conta no rendimento mesmo se um fechamento automático ficou no dia seguinte", () => {
  const position = { id: "s", name: "Tesouro", initial_amount: 25013.08, current_value: 0, purchase_date: "2025-11-08", updated_at: "2026-10-06" };
  const trades = [{ investment_id: "s", type: "sale", amount: 25473.51, realized_gain: 460.43, date: "2026-10-05", quantity: 15.65 }];
  const valuations = [
    { investment_id: "s", date: "2026-10-02", value: 27979.85 },
    { investment_id: "s", date: "2026-10-06", value: 0 },
  ];
  const result = performance(position, valuations, trades, "all", "2026-10-05");
  assert.equal(result.gain, 460.43);
  assert.equal(result.realizedGain, 460.43);
  assert.equal(result.last.date, "2026-10-05");
});
test("renda fixa separa custo ativo de resgate e mantém o ganho realizado", () => {
  const assets = [
    { id: "sold", type: "fixed_income", quote_mode: "treasury", purchase_date: "2025-11-08", initial_amount: 25013.08 },
    { id: "held", type: "fixed_income", quote_mode: "treasury", purchase_date: "2025-11-08", initial_amount: 10000 },
  ];
  const valuations = [
    { investment_id: "sold", date: "2026-10-05", value: 0 },
    { investment_id: "held", date: "2026-10-02", value: 11000 },
  ];
  const trades = [{ investment_id: "sold", type: "sale", amount: 25473.51, cost_basis: 25013.08, realized_gain: 460.43, date: "2026-10-05" }];
  const points = investmentGroupHistory(assets, valuations, trades, "fixed", "2026-10-05");
  const last = points.at(-1);
  assert.equal(last.current, 11000);
  assert.equal(last.activeCost, 10000);
  assert.equal(last.received, 25473.51);
  assert.equal(last.realizedGain, 460.43);
  assert.equal(last.gain, 1460.43);
});

test("cotação posterior à venda total não recria posição nem ganho", () => {
  const asset = { id: "sold", name: "Tesouro IPCA+", type: "fixed_income", quote_mode: "treasury", purchase_date: "2025-11-08", initial_amount: 25013.08, current_value: 0, quantity: 0 };
  const sale = { investment_id: "sold", type: "sale", date: "2025-11-20", quantity: 15.65, amount: 25473.51, cost_basis: 25013.08, realized_gain: 460.43 };
  const valuations = [
    { investment_id: "sold", date: "2025-11-19", value: 25200, source: "quote" },
    { investment_id: "sold", date: "2026-10-02", value: 27979.85, source: "quote" },
  ];
  const points = investmentGroupHistory([asset], valuations, [sale], "fixed", "2026-10-06");
  assert.equal(points.at(-1).date, "2025-11-20");
  assert.equal(points.at(-1).current, 0);
  assert.equal(points.at(-1).gain, 460.43);
  assert.equal(investmentChart(asset, valuations, [sale], "balance", "all", "2026-10-06").at(-1).date, "2025-11-20");
});
test("gráfico da carteira reconcilia valores e mantém a data real do saldo manual", () => {
  const j = { id: "b", name: "Outro", purchase_date: "2025-01-01" };
  const series = portfolioHistory(
    [{ ...i, purchase_date: "2025-01-01" }, j],
    [...values, { investment_id: "b", date: "2025-12-31", value: 300 }],
    "year",
    "2026-01-31",
  );
  assert.equal(series[0].value, 12800);
  assert.equal(series[0].items[1].date, "2025-12-31");
});
