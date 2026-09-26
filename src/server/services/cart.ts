import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import type { Db, DbOrTx } from "../db/client";
import { cartItems, cartItemSizes, carts, designs, designVersions } from "../db/schema";
import { AppError, notFound } from "../errors";
import { hashToken, randomToken } from "../auth/crypto";
import { loadProductConfig, loadSettings } from "./catalogue";
import { getVersion } from "./designs";
import { isVariantOrderable, type Channel, type ProductConfig } from "@/domain/catalogue";
import { decoratedSides, type DesignDoc } from "@/domain/design/schema";
import { priceLine, priceOrder, type LinePrice } from "@/domain/pricing";
import type { Settings } from "@/domain/settings";

export const CART_COOKIE = "sg_cart";

export type LineRequest = {
  designVersionId: string;
  channel: Channel;
  printMethodCode: string;
  sizes: { sizeId: string; quantity: number }[];
};

export type BuiltLine = {
  product: ProductConfig;
  doc: DesignDoc;
  designId: string;
  designVersionId: string;
  colour: { id: string; name: string; hex: string };
  method: ProductConfig["printMethods"][number];
  price: LinePrice;
  sizes: { variantId: string; sku: string; sizeCode: string; quantity: number; unitPaise: number; sort: number }[];
  snapshot: Record<string, unknown>;
};

/**
 * Validates and prices one line from the database — the only way a price enters a
 * cart or an order. Client-sent prices are never read.
 */
export async function buildLine(db: DbOrTx, req: LineRequest, settings: Settings): Promise<BuiltLine> {
  const version = await getVersion(db, req.designVersionId);
  if (!version) throw notFound("That design");
  if (version.elementCount < 1) throw new AppError("VALIDATION", "This design has no artwork, so it can't be printed.");
  const product = await loadProductConfig(db, { id: version.productId });
  if (!product) throw new AppError("UNAVAILABLE", "This product is no longer available.");
  const colour = product.colours.find((c) => c.id === version.colourId);
  if (!colour) throw new AppError("UNAVAILABLE", "This colour is no longer available.");
  const method = product.printMethods.find((m) => m.code === req.printMethodCode && m.customerSelectable);
  if (!method) throw new AppError("VALIDATION", "That print method isn't available for this product.");

  const merged = new Map<string, number>();
  for (const s of req.sizes) merged.set(s.sizeId, (merged.get(s.sizeId) ?? 0) + s.quantity);
  const sizes = [...merged].filter(([, q]) => q !== 0).map(([sizeId, quantity]) => {
    const size = product.sizes.find((s) => s.id === sizeId);
    const variant = product.variants.find((v) => v.colourId === colour.id && v.sizeId === sizeId);
    if (!size || !variant) throw new AppError("UNAVAILABLE", "This colour/size is currently unavailable.");
    if (!isVariantOrderable(variant, quantity)) {
      throw new AppError(
        "UNAVAILABLE",
        variant.stockQty ? `Only ${variant.stockQty} left in ${colour.name} ${size.code}.` : `${colour.name} ${size.code} is currently unavailable.`,
      );
    }
    return { size, variant, quantity };
  });

  const doc = version.doc;
  const placements = decoratedSides(doc).map((side) => ({ side, printAreaCode: doc.surfaces[side].printAreaCode }));
  const result = priceLine(
    product,
    { channel: req.channel, colourId: colour.id, printMethodCode: method.code, placements, sizes: sizes.map((s) => ({ variantId: s.variant.id, quantity: s.quantity })) },
    settings,
  );
  if (!result.ok) throw new AppError("VALIDATION", result.issues[0].message, { issues: result.issues });
  const price = result.price;

  return {
    product,
    doc,
    designId: version.designId,
    designVersionId: version.id,
    colour,
    method,
    price,
    sizes: sizes
      .map((s) => ({
        variantId: s.variant.id,
        sku: s.variant.sku,
        sizeCode: s.size.code,
        quantity: s.quantity,
        unitPaise: price.sizes.find((p) => p.variantId === s.variant.id)!.unitPaise,
        sort: product.sizes.findIndex((x) => x.id === s.size.id),
      }))
      .sort((a, b) => a.sort - b.sort),
    snapshot: {
      pricedAt: new Date().toISOString(),
      productName: product.name,
      printMethodCode: method.code,
      placements,
      isDemoPricing: product.isDemo,
      price,
    },
  };
}

// ------------------------------------------------------------------ cart identity

export async function currentCartTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(CART_COOKIE)?.value;
  return token && token.length <= 100 ? hashToken(token) : null;
}

export async function ensureCartTokenHash(): Promise<string> {
  const jar = await cookies();
  let token = jar.get(CART_COOKIE)?.value;
  if (!token || token.length > 100) {
    token = randomToken();
    jar.set(CART_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 60 });
  }
  return hashToken(token);
}

async function findCart(db: DbOrTx, tokenHash: string) {
  const [cart] = await db.select().from(carts).where(eq(carts.tokenHash, tokenHash)).limit(1);
  return cart ?? null;
}

// ------------------------------------------------------------------ operations

export async function addToCart(db: Db, ownerTokenHash: string, cartTokenHash: string, req: LineRequest) {
  // only the browser that owns a design can put it in a cart
  const [owned] = await db
    .select({ id: designVersions.id })
    .from(designVersions)
    .innerJoin(designs, eq(designs.id, designVersions.designId))
    .where(and(eq(designVersions.id, req.designVersionId), eq(designs.ownerTokenHash, ownerTokenHash)))
    .limit(1);
  if (!owned) throw notFound("That design");

  const settings = await loadSettings(db);
  const line = await buildLine(db, req, settings);
  const tokenHash = cartTokenHash;

  return db.transaction(async (tx) => {
    let cart = await findCart(tx, tokenHash);
    if (!cart) [cart] = await tx.insert(carts).values({ tokenHash, channel: req.channel }).returning();
    const existing = await tx.select({ id: cartItems.id }).from(cartItems).where(eq(cartItems.cartId, cart.id)).limit(1);
    if (existing.length && cart.channel !== req.channel) {
      throw new AppError(
        "CONFLICT",
        cart.channel === "B2B"
          ? "Your cart has a bulk order. Check it out first, or remove it to place a single order."
          : "Your cart has single-order items. Check them out first, or remove them to place a bulk order.",
      );
    }
    if (!existing.length && cart.channel !== req.channel) await tx.update(carts).set({ channel: req.channel }).where(eq(carts.id, cart.id));
    const [item] = await tx
      .insert(cartItems)
      .values({
        cartId: cart.id,
        designId: line.designId,
        designVersionId: line.designVersionId,
        productId: line.product.id,
        colourId: line.colour.id,
        printMethodId: line.method.id,
        quantity: line.price.quantity,
        unitPricePaise: line.price.averageUnitPaise,
        lineTotalPaise: line.price.lineTotalPaise,
        priceSnapshot: line.snapshot,
      })
      .returning({ id: cartItems.id });
    await tx.insert(cartItemSizes).values(line.sizes.map((s) => ({ cartItemId: item.id, variantId: s.variantId, quantity: s.quantity })));
    await tx.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cart.id));
    return { itemId: item.id };
  });
}

export type CartLineView = {
  id: string;
  designId: string;
  designVersionId: string;
  productName: string;
  productSlug: string;
  colourName: string;
  colourHex: string;
  printMethodName: string;
  placements: string[];
  sizes: { sizeId: string; sizeCode: string; quantity: number; unitPaise: number }[];
  quantity: number;
  lineTotalPaise: number;
  discountPaise: number;
  tier: LinePrice["tier"];
  /** set when current pricing/stock no longer allows this line as-is */
  problem: string | null;
  priceChanged: boolean;
};

/** The cart with every line re-priced from current configuration. */
export async function loadCart(db: Db, tokenHash: string | null) {
  const empty = { cart: null, lines: [] as CartLineView[], totals: null as ReturnType<typeof priceOrder> | null, count: 0 };
  if (!tokenHash) return empty;
  const cart = await findCart(db, tokenHash);
  if (!cart) return empty;
  const items = await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id)).orderBy(asc(cartItems.createdAt));
  if (!items.length) return { ...empty, cart };
  const sizes = await db.select().from(cartItemSizes).where(inArray(cartItemSizes.cartItemId, items.map((i) => i.id)));
  const settings = await loadSettings(db);

  const lines: CartLineView[] = [];
  const priced: LinePrice[] = [];
  for (const item of items) {
    const product = await loadProductConfig(db, { id: item.productId });
    const itemSizes = sizes.filter((s) => s.cartItemId === item.id);
    const sizeIds = itemSizes.map((s) => product?.variants.find((v) => v.id === s.variantId)?.sizeId ?? "");
    const method = product?.printMethods.find((m) => m.id === item.printMethodId);
    const colour = product?.colours.find((c) => c.id === item.colourId);
    let problem: string | null = null;
    let price: LinePrice | null = null;
    try {
      const built = await buildLine(
        db,
        {
          designVersionId: item.designVersionId,
          channel: cart.channel,
          printMethodCode: method?.code ?? "",
          sizes: itemSizes.map((s, i) => ({ sizeId: sizeIds[i], quantity: s.quantity })),
        },
        settings,
      );
      price = built.price;
    } catch (e) {
      problem = e instanceof AppError ? e.message : "This item can't be ordered right now.";
    }
    const snap = item.priceSnapshot as { price?: LinePrice; placements?: { side: string }[] };
    if (price) priced.push(price);
    lines.push({
      id: item.id,
      designId: item.designId,
      designVersionId: item.designVersionId,
      productName: product?.name ?? "Unavailable product",
      productSlug: product?.slug ?? "",
      colourName: colour?.name ?? "—",
      colourHex: colour?.hex ?? "#CCCCCC",
      printMethodName: method?.name ?? "—",
      placements: (snap.placements ?? []).map((p) => p.side),
      sizes: itemSizes
        .map((s, i) => ({
          sizeId: sizeIds[i],
          sizeCode: product?.variants.find((v) => v.id === s.variantId)?.sizeCode ?? "?",
          quantity: s.quantity,
          unitPaise: price?.sizes.find((p) => p.variantId === s.variantId)?.unitPaise ?? 0,
        }))
        .sort((a, b) => sizeOrder(product, a.sizeId) - sizeOrder(product, b.sizeId)),
      quantity: price?.quantity ?? item.quantity,
      lineTotalPaise: price?.lineTotalPaise ?? item.lineTotalPaise,
      discountPaise: price?.discountPaise ?? 0,
      tier: price?.tier ?? null,
      problem,
      priceChanged: !!price && !!snap.price && snap.price.lineTotalPaise !== price.lineTotalPaise,
    });
  }
  return { cart, lines, totals: priceOrder(priced, settings), count: lines.length };
}

const sizeOrder = (product: ProductConfig | null, sizeId: string) => product?.sizes.findIndex((x) => x.id === sizeId) ?? 0;

async function ownedItem(db: DbOrTx, tokenHash: string | null, itemId: string) {
  if (!tokenHash) throw notFound("That cart item");
  const [row] = await db
    .select({ item: cartItems, cart: carts })
    .from(cartItems)
    .innerJoin(carts, eq(carts.id, cartItems.cartId))
    .where(and(eq(cartItems.id, itemId), eq(carts.tokenHash, tokenHash)))
    .limit(1);
  if (!row) throw notFound("That cart item");
  return row;
}

export async function updateCartItemSizes(db: Db, tokenHash: string | null, itemId: string, sizes: { sizeId: string; quantity: number }[]) {
  const { item, cart } = await ownedItem(db, tokenHash, itemId);
  const settings = await loadSettings(db);
  const product = await loadProductConfig(db, { id: item.productId });
  const method = product?.printMethods.find((m) => m.id === item.printMethodId);
  const line = await buildLine(db, { designVersionId: item.designVersionId, channel: cart.channel, printMethodCode: method?.code ?? "", sizes }, settings);
  await db.transaction(async (tx) => {
    await tx.delete(cartItemSizes).where(eq(cartItemSizes.cartItemId, item.id));
    await tx.insert(cartItemSizes).values(line.sizes.map((s) => ({ cartItemId: item.id, variantId: s.variantId, quantity: s.quantity })));
    await tx
      .update(cartItems)
      .set({ quantity: line.price.quantity, unitPricePaise: line.price.averageUnitPaise, lineTotalPaise: line.price.lineTotalPaise, priceSnapshot: line.snapshot })
      .where(eq(cartItems.id, item.id));
  });
}

export async function removeCartItem(db: Db, tokenHash: string | null, itemId: string) {
  const { item } = await ownedItem(db, tokenHash, itemId);
  await db.delete(cartItems).where(eq(cartItems.id, item.id));
}

export async function cartCount(db: DbOrTx, tokenHash: string | null) {
  if (!tokenHash) return 0;
  const cart = await findCart(db, tokenHash);
  if (!cart) return 0;
  const rows = await db.select({ id: cartItems.id }).from(cartItems).where(eq(cartItems.cartId, cart.id));
  return rows.length;
}

