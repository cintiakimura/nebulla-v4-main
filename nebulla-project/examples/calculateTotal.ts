export type CartItem = { price: number | null } | null;

/**
 * Sum all finite prices. Null items, null prices, and empty/null lists count as 0.
 */
export function calculateTotal(
  items: Array<{ price: number | null } | null> | null | undefined,
): number {
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items.reduce((sum, item) => {
    const p = item?.price;
    return sum + (typeof p === "number" && Number.isFinite(p) ? p : 0);
  }, 0);
}
