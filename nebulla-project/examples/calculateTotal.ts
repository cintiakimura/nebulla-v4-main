export type PricedItem = { price: number };

/**
 * Sum item prices.
 * Guards: non-array / empty → 0; missing elements / non-finite price → 0 contribution.
 */
export function calculateTotal(items: PricedItem[] | null | undefined): number {
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items.reduce((sum, item) => {
    const p = item?.price;
    return sum + (typeof p === "number" && Number.isFinite(p) ? p : 0);
  }, 0);
}
