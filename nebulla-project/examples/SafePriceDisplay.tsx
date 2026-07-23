import * as React from "react";

export type PriceValue = number | null | undefined;

type Props = {
  price: PriceValue;
  currency?: string;
};

/** Shows a product price; missing/invalid values show an em dash. */
export function SafePriceDisplay({ price, currency = "USD" }: Props) {
  const amount =
    typeof price === "number" && Number.isFinite(price) ? price.toFixed(2) : "—";

  return (
    <span className="text-sm font-medium text-foreground">
      {currency} {amount}
    </span>
  );
}
