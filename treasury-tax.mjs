// Indicative tax for a single Tesouro purchase lot. The broker statement remains authoritative.
const iofRate = [0, 96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3];
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function estimateTreasuryTax({ purchaseDate, saleDate, quantity, unitPrice, initialAmount, initialQuantity, additionalBuys = 0 }) {
  const days = Math.round((Date.parse(saleDate + "T12:00:00Z") - Date.parse(purchaseDate + "T12:00:00Z")) / 86400000);
  if (!Number.isFinite(days) || days < 1 || !Number.isFinite(quantity) || quantity <= 0 ||
      !Number.isFinite(unitPrice) || unitPrice <= 0 || !Number.isFinite(initialAmount) || initialAmount < 0 ||
      !Number.isFinite(initialQuantity) || initialQuantity <= 0 || additionalBuys > 0) return null;
  const gross = round(quantity * unitPrice);
  const basis = round(quantity * initialAmount / initialQuantity);
  const gain = Math.max(0, round(gross - basis));
  const iof = days < 30 ? round(gain * iofRate[days] / 100) : 0;
  const rate = days <= 180 ? 0.225 : days <= 360 ? 0.20 : days <= 720 ? 0.175 : 0.15;
  const incomeTax = round(Math.max(0, gain - iof) * rate);
  return { days, gross, basis, gain, iof, incomeTax, total: round(iof + incomeTax), rate };
}
