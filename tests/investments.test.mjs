import test from "node:test";
import assert from "node:assert/strict";
import {
  investmentPerformance as performance,
  portfolioPerformance,
  portfolioHistory,
  periodStart,
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
