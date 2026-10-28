// Number formatting shared by all pages, so prices look the same everywhere.

export function formatMoney(amount: string | number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount))
}

// Gross margin: the share of the sale price that is profit. null when the price is 0.
export function marginPercent(purchasePrice: string, salePrice: string): number | null {
  const sale = Number(salePrice)
  if (sale === 0) return null
  return ((sale - Number(purchasePrice)) / sale) * 100
}
