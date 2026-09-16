import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMoney,
  validDate,
  monthRange,
  addMonthsClamped,
  totals,
  reportingRows,
  parseCsv,
  csvCell,
  spendingDNA,
  cardSchedule,
  installmentAmounts,
  filterRows,
} from "../finance.mjs";
test("money accepts Brazilian and decimal inputs, rejects malformed values", () => {
  assert.equal(parseMoney("R$ 1.234,56"), 1234.56);
  assert.equal(parseMoney("1,234.56"), 1234.56);
  assert.equal(parseMoney("10,50"), 10.5);
  for (const value of ["12abc", "1,2,3", "", "0.123"])
    assert.ok(Number.isNaN(parseMoney(value)));
});
test("dates never shift backwards because of UTC parsing; month end is clamped", () => {
  assert.ok(validDate("2024-02-29"));
  assert.ok(!validDate("2025-02-29"));
  assert.equal(addMonthsClamped("2026-01-31", 1), "2026-02-28");
  assert.equal(monthRange("2026-02").end, "2026-02-28");
});
test("cash report excludes card purchases and internal transfers, normalizes legacy types", () => {
  const rows = [
    { type: "income", amount: 0.1 },
    { type: "income", amount: 0.2 },
    { type: "despesa", amount: 0.1 },
    { type: "transfer", amount: 200 },
    { type: "expense", amount: 900, credit_card_id: "card" },
  ];
  assert.deepEqual(totals(reportingRows(rows)), {
    income: 0.3,
    expense: 0.1,
    balance: 0.2,
    count: 4,
  });
});
test("installments retain every cent and replace rather than double count parent purchase", () => {
  assert.deepEqual(installmentAmounts(100, 3), [33.34, 33.33, 33.33]);
  const schedule = cardSchedule(
    [{ id: "t", credit_card_id: "c", amount: 100, description: "Purchase" }],
    [
      {
        id: "p",
        transaction_id: "t",
        installment_amount: 33.34,
        installment_date: "2026-01-31",
        current_installment: 1,
        total_installments: 3,
      },
    ],
  );
  assert.equal(schedule.length, 1);
  assert.equal(schedule[0].amount, 33.34);
});
test("DNA uses completed months and includes zero months, not a partial current month", () => {
  const rows = [
    { date: "2026-01-10", amount: 300, type: "expense", category_id: "c" },
    { date: "2026-03-10", amount: 600, type: "expense", category_id: "c" },
    { date: "2026-04-01", amount: 10000, type: "expense", category_id: "c" },
  ];
  const dna = spendingDNA(
    rows,
    [{ id: "c", name: "Mercado", spending_area: "Alimentação" }],
    "2026-04",
    3,
  );
  assert.equal(dna.average, 300);
  assert.deepEqual(dna.areas[0].monthly, [300, 0, 600]);
  assert.equal(dna.areas[0].current, 10000);
  assert.equal(dna.areas[0].recurring, true);
});
test("CSV parses quoted separators, line breaks and escaping; export neutralizes formulas", () => {
  assert.deepEqual(
    parseCsv('data;descricao;valor\r\n2026-01-01;"Mercado; casa";"10,50"'),
    [
      ["data", "descricao", "valor"],
      ["2026-01-01", "Mercado; casa", "10,50"],
    ],
  );
  assert.equal(parseCsv('a,b\n"x\ny","a""b"')[1][1], 'a"b');
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
});
test("account filter includes incoming transfers and search ignores accents", () => {
  const list = filterRows(
    [
      {
        id: "1",
        type: "transfer",
        date: "2026-01-01",
        amount: 10,
        account_id: "a",
        transfer_to_account_id: "b",
        description: "Transferência",
      },
    ],
    { account: "b", query: "transferencia" },
  );
  assert.equal(list.length, 1);
});
test("DNA does not claim observed months when no expense history exists", () => {
  const dna = spendingDNA([], [], "2026-04", 6);
  assert.deepEqual(dna.months, []);
  assert.equal(dna.average, 0);
  assert.equal(dna.habitual, 0);
});
