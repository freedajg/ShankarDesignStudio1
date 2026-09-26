import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "./client";
import * as t from "./schema";
import { demoSettings, type SettingsKey } from "@/domain/settings";
import { garments, MOCKUP_H, MOCKUP_W, placementFor } from "./seed-data/garments";

/**
 * DEVELOPMENT / DEMO SEED — every business number below is a placeholder, flagged
 * is_demo = true, and listed in docs/OPEN_QUESTIONS.md. Not Shankar's prices.
 * Idempotent: safe to run repeatedly; it never overwrites edited rows.
 */

type ColourSeed = [name: string, hex: string];

const COMMON: ColourSeed[] = [
  ["White", "#FFFFFF"],
  ["Black", "#1C1C1C"],
  ["Navy", "#1F2A44"],
  ["Heather Grey", "#B9B9B4"],
  ["Maroon", "#6E1F2B"],
  ["Royal Blue", "#2D4FA1"],
  ["Bottle Green", "#1F4D3A"],
  ["Red", "#B3262E"],
];

const productSeeds = [
  {
    slug: "classic-crew-tshirt",
    style: "crew" as const,
    skuPrefix: "SG-CRW",
    category: "t-shirts",
    name: "Classic Crew T-Shirt",
    description: "Everyday round-neck tee in combed cotton. The go-to for events, teams and gifting.",
    fabric: "100% combed cotton",
    gsm: 180,
    b2c: 39900,
    b2b: 24900,
    minQtyB2b: 20,
    colours: [...COMMON, ["Mustard", "#D9A230"], ["Sky Blue", "#8DB9DE"]] as ColourSeed[],
    sizes: ["S", "M", "L", "XL", "XXL", "3XL"],
    methods: [["DTF", true], ["VINYL", false]] as [string, boolean][],
  },
  {
    slug: "oversized-tshirt",
    style: "oversized" as const,
    skuPrefix: "SG-OVS",
    category: "t-shirts",
    name: "Oversized Drop-Shoulder Tee",
    description: "Relaxed, boxy fit with dropped shoulders and a heavier hand-feel. Big back prints shine here.",
    fabric: "100% cotton, heavyweight",
    gsm: 220,
    b2c: 54900,
    b2b: 34900,
    minQtyB2b: 20,
    colours: [
      ["White", "#FFFFFF"],
      ["Black", "#1C1C1C"],
      ["Off-White", "#F1ECE2"],
      ["Beige", "#D9C8AE"],
      ["Olive", "#5E6B3A"],
      ["Lavender", "#B8A9D6"],
      ["Charcoal", "#3A3A3C"],
    ] as ColourSeed[],
    sizes: ["S", "M", "L", "XL", "XXL"],
    methods: [["DTF", true]] as [string, boolean][],
  },
  {
    slug: "pique-polo",
    style: "polo" as const,
    skuPrefix: "SG-PLO",
    category: "polos",
    name: "Piqué Polo",
    description: "Classic collared polo in breathable piqué. Made for uniforms and corporate logos.",
    fabric: "Cotton-rich piqué",
    gsm: 200,
    b2c: 59900,
    b2b: 37900,
    minQtyB2b: 20,
    colours: COMMON,
    sizes: ["S", "M", "L", "XL", "XXL"],
    methods: [["EMBROIDERY", true], ["DTF", false]] as [string, boolean][],
  },
];

const SIZE_ADJUSTMENT: Record<string, number> = { XXL: 4000, "3XL": 6000 };
const DEMO_STOCK = 500;

const printMethodSeeds = [
  { code: "DTF", name: "DTF print", description: "Full-colour direct-to-film transfer. Photos, gradients and fine detail.", customerSelectable: true, sort: 1 },
  { code: "EMBROIDERY", name: "Embroidery", description: "Stitched logo. Best for small, bold artwork with few colours.", customerSelectable: true, sort: 2 },
  { code: "VINYL", name: "Vinyl", description: "Cut heat-transfer vinyl. Solid colours and text only.", customerSelectable: true, sort: 3 },
];

const printPriceSeeds: Record<string, Record<"SMALL" | "STANDARD" | "LARGE", number>> = {
  DTF: { SMALL: 6000, STANDARD: 12000, LARGE: 18000 },
  EMBROIDERY: { SMALL: 15000, STANDARD: 25000, LARGE: 35000 },
  VINYL: { SMALL: 8000, STANDARD: 15000, LARGE: 22000 },
};

const tierSeeds: { channel: "B2B" | "B2C"; minQty: number; discountBps: number }[] = [
  { channel: "B2B", minQty: 25, discountBps: 500 },
  { channel: "B2B", minQty: 50, discountBps: 1000 },
  { channel: "B2B", minQty: 100, discountBps: 1500 },
  { channel: "B2B", minQty: 250, discountBps: 2000 },
  { channel: "B2B", minQty: 500, discountBps: 2500 },
  { channel: "B2C", minQty: 5, discountBps: 500 },
  { channel: "B2C", minQty: 10, discountBps: 1000 },
];

/**
 * Deterministic UUID for a seeded row. Serverless demo deployments seed a
 * separate embedded database per instance (and again after each restart); stable
 * ids mean a page rendered by one instance and an API call served by another
 * agree on which product / colour / size is meant.
 */
export function stableId(...parts: string[]) {
  const h = createHash("sha256").update(`sg-seed:${parts.join(":")}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function seedDemoData(db: Db) {
  await db.transaction(async (tx) => {
    // settings
    for (const [key, value] of Object.entries(demoSettings) as [SettingsKey, unknown][]) {
      await tx.insert(t.settings).values({ key, value, isDemo: true }).onConflictDoNothing();
    }

    // categories
    for (const [i, [slug, name]] of [["t-shirts", "T-Shirts"], ["polos", "Polos"]].entries()) {
      await tx.insert(t.productCategories).values({ id: stableId("category", slug), slug, name, sort: i }).onConflictDoNothing();
    }
    const categories = await tx.select().from(t.productCategories);

    // print methods + prices
    for (const m of printMethodSeeds) await tx.insert(t.printMethods).values({ id: stableId("method", m.code), ...m }).onConflictDoNothing();
    const methods = await tx.select().from(t.printMethods);
    for (const m of methods) {
      for (const [sizeClass, pricePaise] of Object.entries(printPriceSeeds[m.code] ?? {})) {
        await tx
          .insert(t.printPrices)
          .values({ printMethodId: m.id, sizeClass: sizeClass as "SMALL", pricePaise, isDemo: true })
          .onConflictDoNothing();
      }
    }

    // global bulk tiers
    for (const tier of tierSeeds) {
      await tx.insert(t.bulkPriceTiers).values({ ...tier, productId: null, isDemo: true }).onConflictDoNothing();
    }

    // products
    for (const [sort, p] of productSeeds.entries()) {
      const categoryId = categories.find((c) => c.slug === p.category)!.id;
      await tx
        .insert(t.products)
        .values({
          id: stableId("product", p.slug),
          slug: p.slug,
          skuPrefix: p.skuPrefix,
          categoryId,
          name: p.name,
          description: p.description,
          fabric: p.fabric,
          gsm: p.gsm,
          basePriceB2cPaise: p.b2c,
          basePriceB2bPaise: p.b2b,
          minQtyB2b: p.minQtyB2b,
          isDemo: true,
          sort,
        })
        .onConflictDoNothing();
      const [product] = await tx.select().from(t.products).where(eq(t.products.slug, p.slug));

      for (const [i, [name, hex]] of p.colours.entries()) {
        await tx.insert(t.productColours).values({ id: stableId("colour", p.slug, name), productId: product.id, name, hex, sort: i }).onConflictDoNothing();
      }
      for (const [i, code] of p.sizes.entries()) {
        await tx.insert(t.productSizes).values({ id: stableId("size", p.slug, code), productId: product.id, code, sort: i }).onConflictDoNothing();
      }
      const colours = await tx.select().from(t.productColours).where(eq(t.productColours.productId, product.id));
      const sizes = await tx.select().from(t.productSizes).where(eq(t.productSizes.productId, product.id));
      for (const c of colours) {
        for (const s of sizes) {
          const sku = `${p.skuPrefix}-${c.name.toUpperCase().replace(/[^A-Z0-9]+/g, "")}-${s.code}`;
          await tx
            .insert(t.productVariants)
            .values({
              id: stableId("variant", sku),
              productId: product.id,
              colourId: c.id,
              sizeId: s.id,
              sku,
              priceAdjustmentPaise: SIZE_ADJUSTMENT[s.code] ?? 0,
              stockQty: DEMO_STOCK,
            })
            .onConflictDoNothing();
        }
      }

      for (const [code, isDefault] of p.methods) {
        const m = methods.find((x) => x.code === code)!;
        await tx
          .insert(t.productPrintMethods)
          .values({ productId: product.id, printMethodId: m.id, isDefault })
          .onConflictDoNothing();
      }

      const spec = garments.find((g) => g.style === p.style)!;
      for (const side of ["front", "back"] as const) {
        await tx
          .insert(t.productMockups)
          .values({
            id: stableId("mockup", p.slug, side),
            productId: product.id,
            side,
            maskUrl: `/mockups/${p.style}-${side}-mask.png`,
            shadeUrl: `/mockups/${p.style}-${side}-shade.webp`,
            highlightUrl: `/mockups/${p.style}-${side}-highlight.webp`,
            widthPx: MOCKUP_W,
            heightPx: MOCKUP_H,
          })
          .onConflictDoNothing();
      }
      for (const [i, area] of spec.printAreas.entries()) {
        await tx
          .insert(t.printAreas)
          .values({
            id: stableId("area", p.slug, area.code),
            productId: product.id,
            side: area.side,
            code: area.code,
            name: area.name,
            widthMm: area.widthMm,
            heightMm: area.heightMm,
            sizeClass: area.sizeClass,
            isDefault: area.isDefault,
            sort: i,
            ...placementFor(spec, area),
          })
          .onConflictDoNothing();
      }
    }
  });
}

/** Creates a staff user if missing and ensures it has the given role. */
export async function ensureStaffUser(
  db: Db,
  input: { email: string; name: string; passwordHash: string; role: "ADMIN" | "PRODUCTION" },
) {
  const email = input.email.trim().toLowerCase();
  await db.insert(t.users).values({ email, name: input.name, passwordHash: input.passwordHash }).onConflictDoNothing();
  const [user] = await db.select().from(t.users).where(eq(t.users.email, email));
  await db.insert(t.userRoles).values({ userId: user.id, role: input.role }).onConflictDoNothing();
  return user;
}

export async function hasDemoCatalogue(db: Db) {
  const rows = await db
    .select({ id: t.products.id })
    .from(t.products)
    .where(and(eq(t.products.isDemo, true), eq(t.products.isActive, true)))
    .limit(1);
  return rows.length > 0;
}
