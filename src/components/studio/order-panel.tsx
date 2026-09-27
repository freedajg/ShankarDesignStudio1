"use client";

import { AlertCircle, TrendingDown } from "lucide-react";
import { useState } from "react";
import { Segmented, Stepper } from "@/components/ui/controls";
import { Badge } from "@/components/ui/feedback";
import { isVariantOrderable, variantFor, type Channel } from "@/domain/catalogue";
import { formatInr } from "@/domain/money";
import { cn } from "@/lib/cn";
import { useStudio } from "./context";
import { useLinePrice } from "./use-price";

export function OrderModeToggle({ className }: { className?: string }) {
  const channel = useStudio((s) => s.channel);
  const setChannel = useStudio((s) => s.setChannel);
  const minQty = useStudio((s) => s.product.minQtyB2b);
  return (
    <Segmented<Channel>
      label="Order type"
      value={channel}
      onChange={setChannel}
      className={className}
      options={[
        { value: "B2C", label: "Single order" },
        { value: "B2B", label: `Bulk (${minQty}+)`, hint: "Business, team or event orders with a size breakdown" },
      ]}
    />
  );
}

/** Sizes & quantities. Single orders pick one size (or expand to several); bulk orders always show the full breakdown. */
export function SizePicker() {
  const product = useStudio((s) => s.product);
  const colourId = useStudio((s) => s.doc.colourId);
  const channel = useStudio((s) => s.channel);
  const quantities = useStudio((s) => s.quantities);
  const setQuantity = useStudio((s) => s.setQuantity);
  const setQuantities = useStudio((s) => s.setQuantities);
  const { line } = useLinePrice();
  const [multi, setMulti] = useState(Object.keys(quantities).length > 1);
  const showGrid = channel === "B2B" || multi;
  const total = Object.values(quantities).reduce((a, b) => a + b, 0);

  const sizeNote = (sizeId: string) => {
    const v = variantFor(product, colourId, sizeId);
    if (!v || !v.isActive) return { unavailable: true, note: "Unavailable in this colour" };
    const q = quantities[sizeId] ?? 0;
    if (!isVariantOrderable(v, Math.max(1, q))) return { unavailable: q === 0 && v.stockQty === 0, note: v.stockQty ? `Only ${v.stockQty} left` : "Out of stock" };
    return { unavailable: false, note: v.priceAdjustmentPaise ? `+${formatInr(v.priceAdjustmentPaise, { whole: true })}` : null };
  };

  if (!showGrid) {
    const selected = Object.keys(quantities)[0] ?? null;
    const qty = selected ? quantities[selected] : 1;
    return (
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Size</legend>
          <div role="radiogroup" aria-label="Size" className="flex flex-wrap gap-2">
            {product.sizes.map((size) => {
              const { unavailable, note } = sizeNote(size.id);
              const active = selected === size.id;
              return (
                <button
                  key={size.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={unavailable}
                  title={note ?? undefined}
                  onClick={() => setQuantities({ [size.id]: Math.max(1, qty) })}
                  className={cn(
                    "min-w-12 rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-medium tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:line-through",
                    active ? "border-ink bg-ink text-on-ink" : "border-line-strong bg-surface hover:border-ink",
                  )}
                >
                  {size.code}
                </button>
              );
            })}
          </div>
          {selected && sizeNote(selected).note && <p className="mt-2 text-xs text-ink-muted">{sizeNote(selected).note}</p>}
        </fieldset>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">Quantity</span>
          <Stepper label="Quantity" value={qty} min={1} onChange={(n) => selected && setQuantity(selected, n)} disabled={!selected} />
        </div>
        <button type="button" className="self-start text-sm font-medium text-accent-ink hover:underline" onClick={() => setMulti(true)}>
          Order several sizes
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">Size breakdown</h3>
        {channel === "B2C" && (
          <button
            type="button"
            className="text-sm font-medium text-accent-ink hover:underline"
            onClick={() => {
              const first = Object.entries(quantities)[0];
              setQuantities(first ? { [first[0]]: first[1] } : {});
              setMulti(false);
            }}
          >
            Single size
          </button>
        )}
      </div>
      <ul className="mt-2 divide-y divide-line rounded-[var(--radius-md)] border border-line">
        {product.sizes.map((size) => {
          const { unavailable, note } = sizeNote(size.id);
          const unit = line?.sizes.find((s) => s.sizeCode === size.code)?.unitPaise;
          return (
            <li key={size.id} className="flex items-center gap-3 px-3 py-2">
              <span className="w-10 font-semibold tabular-nums">{size.code}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{unit ? `${formatInr(unit)} each` : note}</span>
              <Stepper
                size="sm"
                label={`${size.code} quantity`}
                value={quantities[size.id] ?? 0}
                disabled={unavailable}
                onChange={(n) => setQuantity(size.id, n)}
              />
            </li>
          );
        })}
        <li className="flex items-center justify-between bg-surface-muted px-3 py-2 text-sm">
          <span className="font-medium">Total</span>
          <span className="font-semibold tabular-nums" data-testid="total-quantity">
            {total} {total === 1 ? "piece" : "pieces"}
          </span>
        </li>
      </ul>
    </div>
  );
}

export function PriceSummary({ compact = false }: { compact?: boolean }) {
  const { result, line, estimate } = useLinePrice();
  const settings = useStudio((s) => s.settings);
  const channel = useStudio((s) => s.channel);
  const issues = result.ok ? [] : result.issues;
  const blocking = issues.filter((i) => i.code !== "EMPTY");

  if (!line || line.quantity === 0) {
    return <p className="text-sm text-ink-muted">Choose a size and quantity to see your price.</p>;
  }
  return (
    <div className={cn("flex flex-col", compact ? "gap-1" : "gap-3")} aria-live="polite">
      {!compact && (
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-ink-muted">Price per piece</dt>
          <dd className="text-right tabular-nums" data-testid="unit-price">
            {formatInr(line.averageUnitPaise)}
          </dd>
          {line.discountPaise > 0 && (
            <>
              <dt className="text-ink-muted">{channel === "B2B" ? "Bulk" : "Quantity"} discount</dt>
              <dd className="text-right tabular-nums text-success">−{formatInr(line.discountPaise)}</dd>
            </>
          )}
          <dt className="font-medium">Subtotal ({line.quantity} pcs)</dt>
          <dd className="text-right font-semibold tabular-nums" data-testid="line-total">
            {formatInr(line.lineTotalPaise)}
          </dd>
        </dl>
      )}
      {line.tier && (
        <Badge tone="success" className="self-start" data-testid="tier-badge">
          <TrendingDown className="size-3.5" aria-hidden /> {line.tier.discountBps / 100}% {channel === "B2B" ? "bulk" : "multi-buy"} discount applied
        </Badge>
      )}
      {line.nextTier && line.quantity > 0 && !compact && (
        <p className="text-xs text-ink-muted">
          Add {line.nextTier.moreNeeded} more for {line.nextTier.discountBps / 100}% off.
        </p>
      )}
      {estimate && !compact && <p className="text-xs text-ink-muted">Estimate with one front print — add your design to see the exact price.</p>}
      {!compact && (
        <p className="text-xs text-ink-muted">
          {settings.tax.pricesIncludeTax ? `Includes ${settings.tax.label}.` : `+ ${settings.tax.label} (${settings.tax.rateBps / 100}%)`} · shipping at checkout
        </p>
      )}
      {blocking.map((i) => (
        <p key={i.code + ("variantId" in i ? i.variantId : "")} role="alert" className="flex items-start gap-1.5 text-sm font-medium text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {i.message}
        </p>
      ))}
    </div>
  );
}

export function OrderPanel() {
  return (
    <div className="flex flex-col gap-5">
      <OrderModeToggle className="w-full" />
      <SizePicker />
      <div className="border-t border-line pt-4">
        <PriceSummary />
      </div>
    </div>
  );
}
