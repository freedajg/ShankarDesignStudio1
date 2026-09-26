import { formatInr } from "@/domain/money";

export type TotalsLike = {
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  taxLabel?: string;
  taxRateBps?: number;
  pricesIncludeTax?: boolean;
  shippingPaise: number;
  totalPaise: number;
};

export function OrderTotals({ totals }: { totals: TotalsLike }) {
  const taxName = `${totals.taxLabel ?? "Tax"}${totals.taxRateBps !== undefined ? ` (${totals.taxRateBps / 100}%)` : ""}`;
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
      {totals.discountPaise > 0 && (
        <>
          <dt className="text-ink-muted">Volume discounts</dt>
          <dd className="text-right tabular-nums text-success">−{formatInr(totals.discountPaise)}</dd>
        </>
      )}
      <dt className="text-ink-muted">Subtotal</dt>
      <dd className="text-right tabular-nums">{formatInr(totals.subtotalPaise)}</dd>
      <dt className="text-ink-muted">{totals.pricesIncludeTax ? `Includes ${taxName}` : taxName}</dt>
      <dd className="text-right tabular-nums">{formatInr(totals.taxPaise)}</dd>
      <dt className="text-ink-muted">Shipping</dt>
      <dd className="text-right tabular-nums">{totals.shippingPaise === 0 ? "Free" : formatInr(totals.shippingPaise)}</dd>
      <dt className="border-t border-line pt-3 text-base font-semibold">Total</dt>
      <dd className="border-t border-line pt-3 text-right text-base font-semibold tabular-nums" data-testid="grand-total">
        {formatInr(totals.totalPaise)}
      </dd>
    </dl>
  );
}
