import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../support/db";
import { doc, product, sizeId, textEl, useTempStorage, versionedDesign } from "../support/fixtures";
import type { Db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { addToCart, loadCart, removeCartItem, updateCartItemSizes } from "@/server/services/cart";
import { AppError } from "@/server/errors";
import type { ProductConfig } from "@/domain/catalogue";

let db: Db;
let crew: ProductConfig;
let polo: ProductConfig;
const owner = "o".repeat(64);
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: AppError) => e.code);

beforeAll(async () => {
  useTempStorage();
  db = await createTestDb();
  crew = await product(db);
  polo = await product(db, "pique-polo");
});

describe("cart", () => {
  it("prices on the server and keeps the design version attached", async () => {
    const { versionId } = await versionedDesign(db, owner, doc(crew, { front: [textEl()] }));
    const cartHash = "c1".padEnd(64, "0");
    await addToCart(db, owner, cartHash, { designVersionId: versionId, channel: "B2C", printMethodCode: "DTF", sizes: [{ sizeId: sizeId(crew, "M"), quantity: 2 }] });
    const cart = await loadCart(db, cartHash);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].designVersionId).toBe(versionId);
    expect(cart.lines[0].lineTotalPaise).toBe(2 * (39900 + 12000));
    expect(cart.totals?.totalPaise).toBe(103800 + 5190 + 7900);
  });

  it("supports a B2B size breakdown with tiers, and edits re-price", async () => {
    const { versionId } = await versionedDesign(db, owner, doc(polo, { front: [textEl({ fontSize: 10, x: 45, y: 45, text: "ACME" })], back: [textEl({ y: 60 })] }));
    const cartHash = "c2".padEnd(64, "0");
    const sizes = [
      { sizeId: sizeId(polo, "S"), quantity: 20 },
      { sizeId: sizeId(polo, "M"), quantity: 35 },
      { sizeId: sizeId(polo, "L"), quantity: 30 },
      { sizeId: sizeId(polo, "XL"), quantity: 10 },
      { sizeId: sizeId(polo, "XXL"), quantity: 5 },
    ];
    const { itemId } = await addToCart(db, owner, cartHash, { designVersionId: versionId, channel: "B2B", printMethodCode: "EMBROIDERY", sizes });
    let cart = await loadCart(db, cartHash);
    expect(cart.lines[0].quantity).toBe(100);
    expect(cart.lines[0].tier?.minQty).toBe(100);
    expect(cart.lines[0].sizes.map((s) => s.sizeCode)).toEqual(["S", "M", "L", "XL", "XXL"]);

    await updateCartItemSizes(db, cartHash, itemId, [{ sizeId: sizeId(polo, "M"), quantity: 30 }]);
    cart = await loadCart(db, cartHash);
    expect(cart.lines[0].quantity).toBe(30);
    expect(cart.lines[0].tier?.minQty).toBe(25);
    expect(await code(updateCartItemSizes(db, cartHash, itemId, [{ sizeId: sizeId(polo, "M"), quantity: 5 }]))).toBe("VALIDATION"); // below B2B minimum
  });

  it("rejects mixing single and bulk orders, other people's designs, and stock conflicts", async () => {
    const { versionId } = await versionedDesign(db, owner, doc(crew, { front: [textEl()] }));
    const cartHash = "c3".padEnd(64, "0");
    await addToCart(db, owner, cartHash, { designVersionId: versionId, channel: "B2C", printMethodCode: "DTF", sizes: [{ sizeId: sizeId(crew, "L"), quantity: 1 }] });
    const bulk = { designVersionId: versionId, channel: "B2B" as const, printMethodCode: "DTF", sizes: [{ sizeId: sizeId(crew, "L"), quantity: 30 }] };
    expect(await code(addToCart(db, owner, cartHash, bulk))).toBe("CONFLICT");
    expect(await code(addToCart(db, "x".repeat(64), "c4".padEnd(64, "0"), { ...bulk, channel: "B2C" }))).toBe("NOT_FOUND");

    const black = crew.colours.find((c) => c.name === "Black")!;
    const variant = crew.variants.find((v) => v.colourId === black.id && v.sizeCode === "S")!;
    await db.update(t.productVariants).set({ stockQty: 3 }).where(eq(t.productVariants.id, variant.id));
    expect(
      await code(addToCart(db, owner, cartHash, { designVersionId: versionId, channel: "B2C", printMethodCode: "DTF", sizes: [{ sizeId: sizeId(crew, "S"), quantity: 4 }] })),
    ).toBe("UNAVAILABLE");
    expect(await code(addToCart(db, owner, cartHash, { designVersionId: versionId, channel: "B2C", printMethodCode: "EMBROIDERY", sizes: [{ sizeId: sizeId(crew, "S"), quantity: 1 }] }))).toBe(
      "VALIDATION",
    );
  });

  it("only the cart's owner can change or remove its items", async () => {
    const { versionId } = await versionedDesign(db, owner, doc(crew, { front: [textEl()] }));
    const cartHash = "c5".padEnd(64, "0");
    const { itemId } = await addToCart(db, owner, cartHash, { designVersionId: versionId, channel: "B2C", printMethodCode: "DTF", sizes: [{ sizeId: sizeId(crew, "M"), quantity: 1 }] });
    expect(await code(removeCartItem(db, "z".repeat(64), itemId))).toBe("NOT_FOUND");
    expect(await code(removeCartItem(db, null, itemId))).toBe("NOT_FOUND");
    await removeCartItem(db, cartHash, itemId);
    expect((await loadCart(db, cartHash)).lines).toHaveLength(0);
  });
});
