import "server-only";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import * as t from "../db/schema";
import type { ProductConfig } from "@/domain/catalogue";
import { parseSettings, type Settings } from "@/domain/settings";
import type { Side } from "@/domain/design/schema";

export async function loadSettings(db: DbOrTx): Promise<Settings> {
  return parseSettings(await db.select({ key: t.settings.key, value: t.settings.value }).from(t.settings));
}

export type ProductSummary = {
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
  mockup: { maskUrl: string; shadeUrl: string; highlightUrl: string } | null;
  bestB2bDiscountBps: number;
};

/** Active products for the catalogue grid, in display order. */
export async function listProducts(db: DbOrTx): Promise<ProductSummary[]> {
  const products = await db
    .select({ p: t.products, categoryName: t.productCategories.name })
    .from(t.products)
    .innerJoin(t.productCategories, eq(t.productCategories.id, t.products.categoryId))
    .where(eq(t.products.isActive, true))
    .orderBy(asc(t.products.sort), asc(t.products.name));
  if (!products.length) return [];
  const ids = products.map((r) => r.p.id);
  const [colours, mockups, tiers] = await Promise.all([
    db
      .select()
      .from(t.productColours)
      .where(and(inArray(t.productColours.productId, ids), eq(t.productColours.isActive, true)))
      .orderBy(asc(t.productColours.sort)),
    db.select().from(t.productMockups).where(and(inArray(t.productMockups.productId, ids), eq(t.productMockups.side, "front"))),
    db.select().from(t.bulkPriceTiers).where(eq(t.bulkPriceTiers.channel, "B2B")),
  ]);
  return products.map(({ p, categoryName }) => {
    const own = tiers.filter((x) => x.productId === p.id);
    const applicable = own.length ? own : tiers.filter((x) => x.productId === null);
    const m = mockups.find((x) => x.productId === p.id);
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      fabric: p.fabric,
      gsm: p.gsm,
      categoryName,
      basePriceB2cPaise: p.basePriceB2cPaise,
      basePriceB2bPaise: p.basePriceB2bPaise,
      minQtyB2b: p.minQtyB2b,
      isDemo: p.isDemo,
      colours: colours.filter((c) => c.productId === p.id).map(({ id, name, hex }) => ({ id, name, hex })),
      mockup: m ? { maskUrl: m.maskUrl, shadeUrl: m.shadeUrl, highlightUrl: m.highlightUrl } : null,
      bestB2bDiscountBps: Math.max(0, ...applicable.map((x) => x.discountBps)),
    };
  });
}

/** Full configuration for one product, or null when missing/inactive. */
export async function loadProductConfig(db: DbOrTx, by: { slug: string } | { id: string }): Promise<ProductConfig | null> {
  const where = "slug" in by ? eq(t.products.slug, by.slug) : eq(t.products.id, by.id);
  const [row] = await db
    .select({ p: t.products, categoryName: t.productCategories.name })
    .from(t.products)
    .innerJoin(t.productCategories, eq(t.productCategories.id, t.products.categoryId))
    .where(and(where, eq(t.products.isActive, true)))
    .limit(1);
  if (!row) return null;
  const p = row.p;

  const [colours, sizes, variants, mockups, areas, methods, tiers] = await Promise.all([
    db.select().from(t.productColours).where(and(eq(t.productColours.productId, p.id), eq(t.productColours.isActive, true))).orderBy(asc(t.productColours.sort)),
    db.select().from(t.productSizes).where(eq(t.productSizes.productId, p.id)).orderBy(asc(t.productSizes.sort)),
    db.select().from(t.productVariants).where(eq(t.productVariants.productId, p.id)),
    db.select().from(t.productMockups).where(eq(t.productMockups.productId, p.id)),
    db.select().from(t.printAreas).where(eq(t.printAreas.productId, p.id)).orderBy(asc(t.printAreas.sort)),
    db
      .select({ m: t.printMethods, isDefault: t.productPrintMethods.isDefault })
      .from(t.productPrintMethods)
      .innerJoin(t.printMethods, eq(t.printMethods.id, t.productPrintMethods.printMethodId))
      .where(and(eq(t.productPrintMethods.productId, p.id), eq(t.printMethods.isActive, true)))
      .orderBy(asc(t.printMethods.sort)),
    db
      .select()
      .from(t.bulkPriceTiers)
      .where(or(eq(t.bulkPriceTiers.productId, p.id), isNull(t.bulkPriceTiers.productId))),
  ]);
  const methodIds = methods.map((m) => m.m.id);
  const prices = methodIds.length ? await db.select().from(t.printPrices).where(inArray(t.printPrices.printMethodId, methodIds)) : [];

  const sizeCode = new Map(sizes.map((s) => [s.id, s.code]));
  const colourIds = new Set(colours.map((c) => c.id));
  const mockup = (side: Side) => {
    const m = mockups.find((x) => x.side === side);
    if (!m) throw new Error(`Product ${p.slug} has no ${side} mockup configured`);
    return { maskUrl: m.maskUrl, shadeUrl: m.shadeUrl, highlightUrl: m.highlightUrl, widthPx: m.widthPx, heightPx: m.heightPx };
  };
  // Product-specific tiers replace global tiers for that channel.
  const tiersFor = (channel: "B2C" | "B2B") => {
    const own = tiers.filter((x) => x.channel === channel && x.productId === p.id);
    return (own.length ? own : tiers.filter((x) => x.channel === channel && x.productId === null)).map((x) => ({
      channel,
      minQty: x.minQty,
      discountBps: x.discountBps,
    }));
  };

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    fabric: p.fabric,
    gsm: p.gsm,
    categoryName: row.categoryName,
    basePriceB2cPaise: p.basePriceB2cPaise,
    basePriceB2bPaise: p.basePriceB2bPaise,
    minQtyB2b: p.minQtyB2b,
    isDemo: p.isDemo,
    colours: colours.map(({ id, name, hex }) => ({ id, name, hex })),
    sizes: sizes.map(({ id, code }) => ({ id, code })),
    variants: variants
      .filter((v) => colourIds.has(v.colourId))
      .map((v) => ({
        id: v.id,
        colourId: v.colourId,
        sizeId: v.sizeId,
        sizeCode: sizeCode.get(v.sizeId) ?? "?",
        sku: v.sku,
        priceAdjustmentPaise: v.priceAdjustmentPaise,
        stockQty: v.stockQty,
        isActive: v.isActive,
      })),
    mockups: { front: mockup("front"), back: mockup("back") },
    printAreas: areas.map((a) => ({
      code: a.code,
      side: a.side,
      name: a.name,
      widthMm: a.widthMm,
      heightMm: a.heightMm,
      mockupX: a.mockupX,
      mockupY: a.mockupY,
      mockupWidth: a.mockupWidth,
      sizeClass: a.sizeClass,
      isDefault: a.isDefault,
      isActive: a.isActive,
    })),
    printMethods: methods.map(({ m, isDefault }) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      description: m.description,
      isDefault,
      customerSelectable: m.customerSelectable,
    })),
    printPrices: prices.map((pp) => ({
      methodCode: methods.find((m) => m.m.id === pp.printMethodId)!.m.code,
      sizeClass: pp.sizeClass,
      pricePaise: pp.pricePaise,
    })),
    tiers: [...tiersFor("B2C"), ...tiersFor("B2B")],
  };
}
