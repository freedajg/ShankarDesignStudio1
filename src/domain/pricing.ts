import type { Channel, ProductConfig } from "./catalogue";
import type { Side } from "./design/schema";
import { applyBps, discountBps, type Paise } from "./money";
import type { Settings } from "./settings";

/**
 * THE pricing engine. The only place prices are computed — the studio calls it
 * for live display, the server calls it (with fresh DB config) on add-to-cart
 * and checkout. Pure and deterministic; integer paise throughout.
 *
 * Structure (numbers come from configuration — see docs/BUSINESS_RULES.md):
 *   unit(size) = base[channel] + variant adjustment + Σ print(side) + extra placements
 *   tier       = best quantity tier for the line
 *   unit'(size)= unit(size) − tier discount (rounded per unit)
 *   line       = Σ qty × unit'(size)
 *   order      = Σ lines + tax + shipping
 */

export type LineInput = {
  channel: Channel;
  colourId: string;
  printMethodCode: string;
  /** decorated surfaces and the print area used on each */
  placements: { side: Side; printAreaCode: string }[];
  sizes: { variantId: string; quantity: number }[];
};

export type PriceIssue =
  | { code: "EMPTY"; message: string }
  | { code: "INVALID_QUANTITY"; message: string }
  | { code: "MIN_QTY"; message: string; minQty: number }
  | { code: "VARIANT_UNAVAILABLE"; message: string; variantId: string }
  | { code: "METHOD_UNAVAILABLE"; message: string }
  | { code: "PRINT_AREA_UNAVAILABLE"; message: string };

export type LinePrice = {
  channel: Channel;
  quantity: number;
  garmentBasePaise: Paise;
  prints: { side: Side; printAreaCode: string; sizeClass: string; pricePaise: Paise }[];
  extraPlacementPaise: Paise;
  tier: { minQty: number; discountBps: number } | null;
  nextTier: { minQty: number; discountBps: number; moreNeeded: number } | null;
  sizes: {
    variantId: string;
    sizeCode: string;
    quantity: number;
    unitBeforeDiscountPaise: Paise;
    unitPaise: Paise;
    totalPaise: Paise;
  }[];
  subtotalBeforeDiscountPaise: Paise;
  discountPaise: Paise;
  lineTotalPaise: Paise;
  /** display only: line total / quantity, rounded */
  averageUnitPaise: Paise;
};

export type PriceResult = { ok: true; price: LinePrice } | { ok: false; issues: PriceIssue[]; partial?: LinePrice };

export const MAX_LINE_QUANTITY = 20000;

export function tiersFor(config: ProductConfig, channel: Channel) {
  return config.tiers.filter((t) => t.channel === channel).sort((a, b) => a.minQty - b.minQty);
}

export function priceLine(config: ProductConfig, input: LineInput, settings: Pick<Settings, "pricing">): PriceResult {
  const issues: PriceIssue[] = [];
  const sizes = input.sizes.filter((s) => s.quantity !== 0);

  for (const s of sizes) {
    if (!Number.isInteger(s.quantity) || s.quantity < 0 || s.quantity > MAX_LINE_QUANTITY) {
      issues.push({ code: "INVALID_QUANTITY", message: "Quantities must be whole numbers." });
      return { ok: false, issues };
    }
  }
  const quantity = sizes.reduce((n, s) => n + s.quantity, 0);
  if (quantity === 0) issues.push({ code: "EMPTY", message: "Choose at least one size and quantity." });
  if (quantity > MAX_LINE_QUANTITY) issues.push({ code: "INVALID_QUANTITY", message: `For more than ${MAX_LINE_QUANTITY} pieces, please contact us.` });
  if (input.channel === "B2B" && quantity > 0 && quantity < config.minQtyB2b) {
    issues.push({ code: "MIN_QTY", minQty: config.minQtyB2b, message: `Bulk orders start at ${config.minQtyB2b} pieces.` });
  }

  const method = config.printMethods.find((m) => m.code === input.printMethodCode);
  if (!method) issues.push({ code: "METHOD_UNAVAILABLE", message: "That print method isn't available for this product." });

  const prints: LinePrice["prints"] = [];
  for (const p of input.placements) {
    const area = config.printAreas.find((a) => a.code === p.printAreaCode && a.side === p.side && a.isActive);
    if (!area) {
      issues.push({ code: "PRINT_AREA_UNAVAILABLE", message: "That print area isn't available for this product." });
      continue;
    }
    const price = config.printPrices.find((pp) => pp.methodCode === input.printMethodCode && pp.sizeClass === area.sizeClass);
    if (method && !price) {
      issues.push({ code: "METHOD_UNAVAILABLE", message: `${method.name} isn't offered for the ${area.name.toLowerCase()} area.` });
      continue;
    }
    prints.push({ side: p.side, printAreaCode: area.code, sizeClass: area.sizeClass, pricePaise: price?.pricePaise ?? 0 });
  }

  const extraPlacementPaise = settings.pricing.additionalPlacementPaise * Math.max(0, prints.length - 1);
  const garmentBasePaise = input.channel === "B2B" ? config.basePriceB2bPaise : config.basePriceB2cPaise;
  const printPerPiece = prints.reduce((n, p) => n + p.pricePaise, 0);

  const tiers = tiersFor(config, input.channel);
  const tier = [...tiers].reverse().find((t) => quantity >= t.minQty) ?? null;
  const next = tiers.find((t) => t.minQty > quantity) ?? null;

  const sizeLines: LinePrice["sizes"] = [];
  for (const s of sizes) {
    const v = config.variants.find((x) => x.id === s.variantId);
    if (!v || v.colourId !== input.colourId || !v.isActive) {
      issues.push({ code: "VARIANT_UNAVAILABLE", variantId: s.variantId, message: "This colour/size is currently unavailable." });
      continue;
    }
    const before = garmentBasePaise + v.priceAdjustmentPaise + printPerPiece + extraPlacementPaise;
    const unit = tier ? discountBps(before, tier.discountBps) : before;
    sizeLines.push({
      variantId: v.id,
      sizeCode: v.sizeCode,
      quantity: s.quantity,
      unitBeforeDiscountPaise: before,
      unitPaise: unit,
      totalPaise: unit * s.quantity,
    });
  }

  const subtotalBefore = sizeLines.reduce((n, s) => n + s.unitBeforeDiscountPaise * s.quantity, 0);
  const lineTotal = sizeLines.reduce((n, s) => n + s.totalPaise, 0);
  const price: LinePrice = {
    channel: input.channel,
    quantity,
    garmentBasePaise,
    prints,
    extraPlacementPaise,
    tier: tier ? { minQty: tier.minQty, discountBps: tier.discountBps } : null,
    nextTier: next ? { minQty: next.minQty, discountBps: next.discountBps, moreNeeded: next.minQty - quantity } : null,
    sizes: sizeLines,
    subtotalBeforeDiscountPaise: subtotalBefore,
    discountPaise: subtotalBefore - lineTotal,
    lineTotalPaise: lineTotal,
    averageUnitPaise: quantity > 0 ? Math.round(lineTotal / quantity) : 0,
  };
  return issues.length ? { ok: false, issues, partial: price } : { ok: true, price };
}

export type OrderTotals = {
  subtotalPaise: Paise;
  discountPaise: Paise;
  taxPaise: Paise;
  taxLabel: string;
  taxRateBps: number;
  pricesIncludeTax: boolean;
  shippingPaise: Paise;
  totalPaise: Paise;
  quantity: number;
};

export function priceOrder(lines: Pick<LinePrice, "lineTotalPaise" | "discountPaise" | "quantity">[], settings: Pick<Settings, "tax" | "shipping">): OrderTotals {
  const subtotal = lines.reduce((n, l) => n + l.lineTotalPaise, 0);
  const discount = lines.reduce((n, l) => n + l.discountPaise, 0);
  const quantity = lines.reduce((n, l) => n + l.quantity, 0);
  const { tax: t, shipping: s } = settings;
  // Tax-inclusive prices: report the tax contained in the subtotal, add nothing.
  const tax = t.pricesIncludeTax
    ? subtotal - Math.round((subtotal * 10000) / (10000 + t.rateBps))
    : applyBps(subtotal, t.rateBps);
  const shipping = subtotal === 0 || (s.freeAbovePaise !== null && subtotal >= s.freeAbovePaise) ? 0 : s.flatPaise;
  return {
    subtotalPaise: subtotal,
    discountPaise: discount,
    taxPaise: tax,
    taxLabel: t.label,
    taxRateBps: t.rateBps,
    pricesIncludeTax: t.pricesIncludeTax,
    shippingPaise: shipping,
    totalPaise: subtotal + (t.pricesIncludeTax ? 0 : tax) + shipping,
    quantity,
  };
}

/** Lowest per-piece garment price for a channel (for catalogue display: "from ₹…"). */
export function fromPrice(config: Pick<ProductConfig, "basePriceB2cPaise" | "basePriceB2bPaise">, channel: Channel) {
  return channel === "B2B" ? config.basePriceB2bPaise : config.basePriceB2cPaise;
}
