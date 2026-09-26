import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../support/db";
import type { Db } from "@/server/db/client";
import { loadProductConfig, loadSettings, listProducts } from "@/server/services/catalogue";
import { priceLine, priceOrder, type LineInput } from "@/domain/pricing";
import type { ProductConfig } from "@/domain/catalogue";
import type { Settings } from "@/domain/settings";

let db: Db;
let crew: ProductConfig;
let polo: ProductConfig;
let settings: Settings;

const sizesOf = (p: ProductConfig, colourName: string, qty: Record<string, number>) => {
  const colour = p.colours.find((c) => c.name === colourName)!;
  return {
    colourId: colour.id,
    sizes: Object.entries(qty).map(([code, quantity]) => ({
      variantId: p.variants.find((v) => v.colourId === colour.id && v.sizeCode === code)!.id,
      quantity,
    })),
  };
};

beforeAll(async () => {
  db = await createTestDb();
  crew = (await loadProductConfig(db, { slug: "classic-crew-tshirt" }))!;
  polo = (await loadProductConfig(db, { slug: "pique-polo" }))!;
  settings = await loadSettings(db);
});

describe("catalogue service", () => {
  it("lists active products with colours and bulk discount", async () => {
    const list = await listProducts(db);
    expect(list).toHaveLength(3);
    expect(list[0].colours.length).toBeGreaterThan(5);
    expect(list[0].bestB2bDiscountBps).toBe(2500);
  });
  it("loads complete product config", () => {
    expect(crew.sizes.map((s) => s.code)).toEqual(["S", "M", "L", "XL", "XXL", "3XL"]);
    expect(crew.printMethods.find((m) => m.isDefault)?.code).toBe("DTF");
    expect(polo.printAreas.find((a) => a.side === "front" && a.isDefault)?.code).toBe("LEFT_CHEST");
    expect(crew.tiers.filter((t) => t.channel === "B2B").map((t) => t.minQty)).toEqual([25, 50, 100, 250, 500]);
  });
  it("returns null for unknown or inactive products", async () => {
    expect(await loadProductConfig(db, { slug: "nope" })).toBeNull();
  });
});

describe("pricing engine (demo configuration)", () => {
  const front = [{ side: "front" as const, printAreaCode: "FULL_FRONT" }];
  const both = [...front, { side: "back" as const, printAreaCode: "FULL_BACK" }];
  const line = (over: Partial<LineInput> & Pick<LineInput, "colourId" | "sizes">): LineInput => ({
    channel: "B2C",
    printMethodCode: "DTF",
    placements: front,
    ...over,
  });

  it("single B2C shirt: base + one DTF standard print", () => {
    const r = priceLine(crew, line(sizesOf(crew, "Black", { M: 1 })), settings);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.price.sizes[0].unitPaise).toBe(39900 + 12000);
    expect(r.price.lineTotalPaise).toBe(51900);
    expect(r.price.tier).toBeNull();
    expect(r.price.nextTier).toEqual({ minQty: 5, discountBps: 500, moreNeeded: 4 });
  });

  it("adds per-side print cost and size adjustments", () => {
    const r = priceLine(crew, line({ ...sizesOf(crew, "White", { L: 1, XXL: 1, "3XL": 1 }), placements: both }), settings);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    const unit = (code: string) => r.price.sizes.find((s) => s.sizeCode === code)!.unitPaise;
    expect(unit("L")).toBe(39900 + 12000 + 12000);
    expect(unit("XXL")).toBe(unit("L") + 4000);
    expect(unit("3XL")).toBe(unit("L") + 6000);
  });

  it("applies the extra-placement surcharge from settings", () => {
    const r = priceLine(crew, line({ ...sizesOf(crew, "White", { L: 2 }), placements: both }), {
      pricing: { additionalPlacementPaise: 2500 },
    });
    if (!r.ok) throw new Error();
    expect(r.price.sizes[0].unitPaise).toBe(39900 + 24000 + 2500);
  });

  it("B2B tiers activate exactly at the boundary, across the whole size breakdown", () => {
    const q49 = priceLine(crew, line({ channel: "B2B", ...sizesOf(crew, "Navy", { S: 10, M: 20, L: 19 }) }), settings);
    const q50 = priceLine(crew, line({ channel: "B2B", ...sizesOf(crew, "Navy", { S: 10, M: 20, L: 20 }) }), settings);
    if (!q49.ok || !q50.ok) throw new Error();
    expect(q49.price.tier?.minQty).toBe(25);
    expect(q50.price.tier?.minQty).toBe(50);
    const unitBefore = 24900 + 12000;
    expect(q50.price.sizes[0].unitPaise).toBe(unitBefore - Math.floor((unitBefore * 1000 + 5000) / 10000));
    expect(q50.price.lineTotalPaise).toBe(q50.price.sizes[0].unitPaise * 50);
    expect(q50.price.discountPaise).toBe(unitBefore * 50 - q50.price.lineTotalPaise);
  });

  it("enforces the B2B minimum and rejects bad quantities / variants", () => {
    const small = priceLine(crew, line({ channel: "B2B", ...sizesOf(crew, "Navy", { M: 5 }) }), settings);
    expect(!small.ok && small.issues[0].code).toBe("MIN_QTY");
    const empty = priceLine(crew, line(sizesOf(crew, "Navy", { M: 0 })), settings);
    expect(!empty.ok && empty.issues[0].code).toBe("EMPTY");
    const frac = priceLine(crew, line({ colourId: crew.colours[0].id, sizes: [{ variantId: crew.variants[0].id, quantity: 1.5 }] }), settings);
    expect(!frac.ok && frac.issues[0].code).toBe("INVALID_QUANTITY");
    const neg = priceLine(crew, line({ colourId: crew.colours[0].id, sizes: [{ variantId: crew.variants[0].id, quantity: -3 }] }), settings);
    expect(!neg.ok && neg.issues[0].code).toBe("INVALID_QUANTITY");
    // a variant of another colour cannot be smuggled into the line
    const white = sizesOf(crew, "White", { M: 1 });
    const mixed = priceLine(crew, line({ colourId: sizesOf(crew, "Black", { M: 1 }).colourId, sizes: white.sizes }), settings);
    expect(!mixed.ok && mixed.issues[0].code).toBe("VARIANT_UNAVAILABLE");
    const method = priceLine(crew, line({ ...sizesOf(crew, "Navy", { M: 1 }), printMethodCode: "EMBROIDERY" }), settings);
    expect(!method.ok && method.issues[0].code).toBe("METHOD_UNAVAILABLE");
  });

  it("handles a 5,000-piece order", () => {
    const r = priceLine(polo, {
      channel: "B2B",
      printMethodCode: "EMBROIDERY",
      placements: [{ side: "front", printAreaCode: "LEFT_CHEST" }],
      ...sizesOf(polo, "Navy", { S: 1000, M: 1500, L: 1500, XL: 700, XXL: 300 }),
    }, settings);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.price.quantity).toBe(5000);
    expect(r.price.tier?.discountBps).toBe(2500);
    expect(r.price.nextTier).toBeNull();
    expect(Number.isSafeInteger(r.price.lineTotalPaise)).toBe(true);
  });

  it("order totals: tax exclusive/inclusive and shipping threshold", () => {
    const lines = [{ lineTotalPaise: 100000, discountPaise: 0, quantity: 2 }];
    const t = priceOrder(lines, settings);
    expect(t).toMatchObject({ subtotalPaise: 100000, taxPaise: 5000, shippingPaise: 7900, totalPaise: 112900 });
    const free = priceOrder([{ lineTotalPaise: 199900, discountPaise: 0, quantity: 4 }], settings);
    expect(free.shippingPaise).toBe(0);
    const incl = priceOrder(lines, { ...settings, tax: { ...settings.tax, pricesIncludeTax: true } });
    expect(incl.taxPaise).toBe(100000 - Math.round(100000 / 1.05));
    expect(incl.totalPaise).toBe(100000 + 7900);
    expect(priceOrder([], settings).totalPaise).toBe(0);
  });
});
