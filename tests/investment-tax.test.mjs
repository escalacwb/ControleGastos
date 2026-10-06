import test from "node:test";
import assert from "node:assert/strict";
import { estimateTreasuryTax } from "../treasury-tax.mjs";

test("Tesouro sale estimate uses gross profit and subtracts IOF before IR", () => {
  const tax = estimateTreasuryTax({ purchaseDate: "2026-10-01", saleDate: "2026-10-11", quantity: 1, unitPrice: 1100, initialAmount: 1000, initialQuantity: 1 });
  assert.equal(tax.gain, 100);
  assert.equal(tax.iof, 66);
  assert.equal(tax.incomeTax, 7.65);
  assert.equal(tax.total, 73.65);
});

test("longer Tesouro holding uses the regressive IR rate", () => {
  const tax = estimateTreasuryTax({ purchaseDate: "2022-01-01", saleDate: "2026-10-05", quantity: 2, unitPrice: 600, initialAmount: 1000, initialQuantity: 2 });
  assert.equal(tax.iof, 0);
  assert.equal(tax.incomeTax, 30);
  assert.equal(tax.total, 30);
});

test("additional purchases cannot be estimated as one tax lot", () => {
  assert.equal(estimateTreasuryTax({ purchaseDate: "2025-01-01", saleDate: "2026-10-05", quantity: 1, unitPrice: 1100, initialAmount: 1000, initialQuantity: 1, additionalBuys: 1 }), null);
});
