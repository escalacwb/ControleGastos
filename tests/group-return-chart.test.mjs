import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { groupReturnChartHTML } from "../mobile/src/lib/group-return-chart.js";

test("portfolio chart separates return, invested balance, accumulated and realized gain", () => {
  const html = groupReturnChartHTML([
    { date: "2025-11-08", current: 100, gain: 0, realizedGain: 0, received: 0, returnIndex: 100 },
    { date: "2025-11-20", current: 0, gain: 15, realizedGain: 15, received: 115, returnIndex: 115 },
  ], "Carteira completa");
  for (const mode of ["return", "gain", "current", "realized"]) assert.match(html, new RegExp(`data-mode="${mode}"`));
  assert.match(html, /aportes e resgates/);
  new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
});
