import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { marketChartHTML, marketPeriods, marketPricePoints, marketRange } from '../mobile/src/lib/market-chart.js';

test('market chart preserves intraday timestamps and exposes brokerage periods', () => {
  const quote = { timestamp: [1791291600, 1791291900, 1791292200], indicators: { quote: [{ close: [33.01, 33.6, 33.45] }] }, meta: { chartPreviousClose: 32.98 } };
  const points = marketPricePoints(quote, 'day');
  assert.equal(points.length, 3);
  assert.ok(points[0].timestamp < points[1].timestamp);
  assert.deepEqual(marketPeriods.map(([value]) => value), ['day', '5d', 'month', '6mo', 'year', '12m', '5y', 'all']);
  assert.equal(marketRange('5d'), '5d');
  assert.equal(marketRange('6mo'), '1y');
  const html = marketChartHTML(quote, { id: 'a', name: 'Inter', ticker: 'INBR32', purchase_date: '2026-01-01', quantity: 690 }, 'day');
  assert.match(html, /Cotação do papel/);
  assert.match(html, /Minha posição/);
  assert.match(html, /chartPreviousClose|previousClose/);
  new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
});

test('position curve stops at a full sale while market prices continue', () => {
  const days = ['2026-09-01', '2026-09-02', '2026-09-03'];
  const quote = { timestamp: days.map((date) => Date.parse(date + 'T14:00:00Z') / 1000), indicators: { quote: [{ close: [10, 12, 13] }] }, meta: {} };
  const investment = { id: 'a', name: 'Papel', ticker: 'PAPL3', purchase_date: days[0], quantity: 0 };
  const html = marketChartHTML(quote, investment, 'month', [{ investment_id: 'a', type: 'sale', date: days[1], quantity: 10 }]);
  const payload = JSON.parse(html.match(/const data=([^;]+),svg=/)[1]);
  assert.equal(payload.prices.length, 3);
  assert.equal(payload.position.length, 1);
  assert.equal(payload.position[0].value, 100);
});
