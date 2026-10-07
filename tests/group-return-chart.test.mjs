import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { groupReturnChartHTML } from "../mobile/src/lib/group-return-chart.js";
import { investmentGroupPeriodSummary } from "../investments.mjs";

test("portfolio chart separates return, invested balance, accumulated and realized gain", () => {
  const html = groupReturnChartHTML([
    { date: "2025-11-08", current: 100, gain: 0, realizedGain: 0, received: 0, returnIndex: 100 },
    { date: "2025-11-20", current: 0, gain: 15, realizedGain: 15, received: 115, returnIndex: 115 },
  ], "Carteira completa");
  for (const mode of ["return", "gain", "current", "realized"]) assert.match(html, new RegExp(`data-mode="${mode}"`));
  assert.match(html, /aportes e resgates/);
  new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
});

test("period summary compares the same dates and keeps lifetime totals separate", () => {
  const points = [
    { date: "2026-09-08", returnIndex: 105, gain: 10000, received: 0, realizedGain: 0 },
    { date: "2026-10-07", returnIndex: 111.4575, gain: 19061.65, received: 25473.51, realizedGain: 460.43, current: 147958.43, activeCost: 128896.78 },
  ];
  const summary = investmentGroupPeriodSummary(points);
  assert.ok(Math.abs(summary.returnPercent - 6.15) < 1e-10);
  assert.equal(summary.gain, 9061.65);
  assert.equal(summary.lifetimeGain, 19061.65);
  assert.equal(summary.received, 25473.51);
  const html = groupReturnChartHTML(points, "Carteira completa");
  assert.match(html, /Ganho no período/);
  assert.match(html, /Ganho desde o início/);
  assert.match(html, /- initialGain/);
});
