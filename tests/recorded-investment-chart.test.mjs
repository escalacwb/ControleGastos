import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { recordedInvestmentChartHTML } from "../mobile/src/lib/recorded-investment-chart.js";

test("recorded chart embeds executable interaction for group and asset histories", () => {
  const group = recordedInvestmentChartHTML([
    { date: "2026-10-01", gain: 0, current: 100, activeCost: 100, received: 0, percent: 0 },
    { date: "2026-10-02", gain: 5, current: 105, activeCost: 100, received: 0, percent: 5 },
  ], "Renda variável", { group: true });
  const asset = recordedInvestmentChartHTML([
    { date: "2026-10-01", value: 100 },
    { date: "2026-10-02", value: 105 },
  ], "Ação", { metric: "balance" });
  for (const html of [group, asset]) {
    assert.match(html, /pointermove/);
    assert.match(html, /id="tooltip"/);
    new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  }
});
