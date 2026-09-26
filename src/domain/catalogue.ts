import type { Side } from "./design/schema";

/** Everything the studio and the pricing engine need about one product. Built by the catalogue service. */
export type ProductConfig = {
  id: string;
  slug: string;
  name: string;
  description: string;
  fabric: string | null;
  gsm: number | null;
  categoryName: string;
  basePriceB2cPaise: number;
  basePriceB2bPaise: number;
  minQtyB2b: number;
  isDemo: boolean;
  colours: { id: string; name: string; hex: string }[];
  sizes: { id: string; code: string }[];
  variants: {
    id: string;
    colourId: string;
    sizeId: string;
    sizeCode: string;
    sku: string;
    priceAdjustmentPaise: number;
    /** null = not tracked */
    stockQty: number | null;
    isActive: boolean;
  }[];
  mockups: Record<Side, { maskUrl: string; shadeUrl: string; highlightUrl: string; widthPx: number; heightPx: number }>;
  printAreas: {
    code: string;
    side: Side;
    name: string;
    widthMm: number;
    heightMm: number;
    mockupX: number;
    mockupY: number;
    mockupWidth: number;
    sizeClass: "SMALL" | "STANDARD" | "LARGE";
    isDefault: boolean;
    isActive: boolean;
  }[];
  printMethods: { id: string; code: string; name: string; description: string; isDefault: boolean; customerSelectable: boolean }[];
  printPrices: { methodCode: string; sizeClass: "SMALL" | "STANDARD" | "LARGE"; pricePaise: number }[];
  tiers: { channel: Channel; minQty: number; discountBps: number }[];
};

export type Channel = "B2C" | "B2B";

export function defaultArea(p: ProductConfig, side: Side) {
  const areas = p.printAreas.filter((a) => a.side === side && a.isActive);
  return areas.find((a) => a.isDefault) ?? areas[0];
}

export function defaultMethod(p: ProductConfig) {
  return p.printMethods.find((m) => m.isDefault) ?? p.printMethods[0];
}

export function variantFor(p: ProductConfig, colourId: string, sizeId: string) {
  return p.variants.find((v) => v.colourId === colourId && v.sizeId === sizeId);
}

export function isVariantOrderable(v: ProductConfig["variants"][number] | undefined, qty = 1) {
  return !!v && v.isActive && (v.stockQty === null || v.stockQty >= qty);
}
