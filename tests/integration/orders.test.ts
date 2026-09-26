import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createTestDb } from "../support/db";
import { doc, product, sizeId, textEl, useTempStorage, versionedDesign } from "../support/fixtures";
import type { Db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { addToCart } from "@/server/services/cart";
import { changeStatus, markFailed, markPaid, orderForCustomer, placeOrder } from "@/server/services/orders";
import { DevPaymentProvider, setPaymentProviderForTests } from "@/server/payments/provider";
import { setEmailProviderForTests, type Email } from "@/server/email";
import { AppError } from "@/server/errors";
import { checkTransition } from "@/domain/orders";
import type { ProductConfig } from "@/domain/catalogue";
import type { CheckoutInput } from "@/domain/checkout";

let db: Db;
let crew: ProductConfig;
let polo: ProductConfig;
const dev = new DevPaymentProvider("test-secret");
const sent: Email[] = [];
const owner = "o".repeat(64);
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: AppError) => e.code);
let n = 0;

const form = (over: Partial<CheckoutInput> = {}): CheckoutInput => ({
  idempotencyKey: randomUUID(),
  name: "Asha Mehta",
  email: "asha@example.com",
  phone: "98290 12345",
  addressLine1: "12 MI Road",
  city: "Jaipur",
  state: "Rajasthan",
  pincode: "302001",
  ...over,
});

async function cartWith(p: ProductConfig, channel: "B2C" | "B2B", sizes: Record<string, number>, method = "DTF") {
  const cartHash = `cart${++n}`.padEnd(64, "0");
  const front = p.slug === "pique-polo" ? [textEl({ fontSize: 10, x: 45, y: 45 })] : [textEl()];
  const { versionId } = await versionedDesign(db, owner, doc(p, { front, back: [textEl({ y: 60, text: "BACK" })] }));
  await addToCart(db, owner, cartHash, {
    designVersionId: versionId,
    channel,
    printMethodCode: method,
    sizes: Object.entries(sizes).map(([c, quantity]) => ({ sizeId: sizeId(p, c), quantity })),
  });
  return { cartHash, versionId };
}

beforeAll(async () => {
  useTempStorage();
  db = await createTestDb();
  crew = await product(db);
  polo = await product(db, "pique-polo");
  setPaymentProviderForTests(dev);
  setEmailProviderForTests({ send: async (e) => void sent.push(e) });
});
beforeEach(() => void (sent.length = 0));

describe("checkout", () => {
  it("creates a PAYMENT_PENDING order with snapshots, design versions and a server-priced payment", async () => {
    const { cartHash, versionId } = await cartWith(crew, "B2C", { M: 1, L: 1 });
    const res = await placeOrder(db, { cartTokenHash: cartHash, form: form() });
    expect(res.orderNumber).toMatch(/^SG-\d{5,}$/);
    expect(res.payment?.provider).toBe("dev");
    const detail = await orderForCustomer(db, res.orderNumber, res.accessToken);
    expect(detail.order).toMatchObject({ status: "PAYMENT_PENDING", paymentStatus: "PENDING", contactPhone: "+919829012345", totalQuantity: 2 });
    expect(detail.items[0]).toMatchObject({ designVersionId: versionId, productName: "Classic Crew T-Shirt", colourName: "Black" });
    expect(detail.items[0].sizes.map((s) => s.sizeCode)).toEqual(["M", "L"]);
    expect(detail.payments[0].amountPaise).toBe(detail.order.totalPaise);
    expect(detail.history.map((h) => h.toStatus)).toEqual(["NEW", "PAYMENT_PENDING"]);
    // cart is emptied once the order owns the design
    const [cart] = await db.select().from(t.carts).where(eq(t.carts.tokenHash, cartHash));
    expect(await db.select().from(t.cartItems).where(eq(t.cartItems.cartId, cart.id))).toHaveLength(0);
  });

  it("validates the form, requires company for B2B, and refuses duplicates", async () => {
    const { cartHash } = await cartWith(polo, "B2B", { M: 30 }, "EMBROIDERY");
    expect(await code(placeOrder(db, { cartTokenHash: cartHash, form: form({ pincode: "12345" }) }))).toBe("VALIDATION");
    expect(await code(placeOrder(db, { cartTokenHash: cartHash, form: form({ gstin: "NOTAGSTIN" }) }))).toBe("VALIDATION");
    expect(await code(placeOrder(db, { cartTokenHash: cartHash, form: form() }))).toBe("VALIDATION"); // company missing
    const f = form({ companyName: "Acme Events Pvt Ltd", gstin: "08ABCDE1234F1Z5", poReference: "PO-7781" });
    const res = await placeOrder(db, { cartTokenHash: cartHash, form: f });
    const detail = await orderForCustomer(db, res.orderNumber, res.accessToken);
    expect(detail.order).toMatchObject({ channel: "B2B", companyName: "Acme Events Pvt Ltd", gstin: "08ABCDE1234F1Z5", poReference: "PO-7781" });
    expect(await code(placeOrder(db, { cartTokenHash: cartHash, form: f }))).toBe("CONFLICT");
    expect(await code(placeOrder(db, { cartTokenHash: cartHash, form: form({ companyName: "X Co" }) }))).toBe("VALIDATION"); // cart now empty
  });
});

describe("payment verification", () => {
  it("marks paid once, moves to design review, decrements stock and emails — duplicates are no-ops", async () => {
    const { cartHash } = await cartWith(crew, "B2C", { S: 2 });
    const black = crew.colours.find((c) => c.name === "Black")!;
    const variant = crew.variants.find((v) => v.colourId === black.id && v.sizeCode === "S")!;
    const [before] = await db.select().from(t.productVariants).where(eq(t.productVariants.id, variant.id));
    const res = await placeOrder(db, { cartTokenHash: cartHash, form: form() });
    const sim = dev.simulateSuccess(res.payment!.orderId);
    expect(dev.verifyCheckout(sim)).toBe(true);
    expect(dev.verifyCheckout({ ...sim, signature: "0".repeat(64) })).toBe(false);

    const first = await markPaid(db, { providerOrderId: sim.providerOrderId, providerPaymentId: sim.providerPaymentId, amountPaise: res.totalPaise, currency: "INR" });
    expect(first.alreadyApplied).toBe(false);
    const again = await markPaid(db, { providerOrderId: sim.providerOrderId, providerPaymentId: sim.providerPaymentId });
    expect(again.alreadyApplied).toBe(true);

    const detail = await orderForCustomer(db, res.orderNumber, res.accessToken);
    expect(detail.order.status).toBe("DESIGN_REVIEW");
    expect(detail.order.paymentStatus).toBe("PAID");
    expect(detail.history.map((h) => h.toStatus)).toEqual(["NEW", "PAYMENT_PENDING", "PAID", "DESIGN_REVIEW"]);
    const [after] = await db.select().from(t.productVariants).where(eq(t.productVariants.id, variant.id));
    expect(after.stockQty).toBe(before.stockQty! - 2);
    expect(sent.filter((e) => e.to === "asha@example.com")).toHaveLength(1);
  });

  it("rejects amount mismatches and records failures without losing the order", async () => {
    const { cartHash } = await cartWith(crew, "B2C", { M: 1 });
    const res = await placeOrder(db, { cartTokenHash: cartHash, form: form() });
    const sim = dev.simulateSuccess(res.payment!.orderId);
    expect(await code(markPaid(db, { ...sim, amountPaise: 100 }))).toBe("PAYMENT");
    await markFailed(db, { providerOrderId: sim.providerOrderId, reason: "Card declined" });
    let detail = await orderForCustomer(db, res.orderNumber, res.accessToken);
    expect(detail.order).toMatchObject({ status: "PAYMENT_PENDING", paymentStatus: "FAILED" });
    expect(detail.items[0].designVersionId).toBeTruthy(); // design still attached
    // retry with a fresh payment succeeds
    const { startPayment } = await import("@/server/services/orders");
    const retry = await startPayment(db, detail.order.id);
    const ok = dev.simulateSuccess(retry.orderId);
    await markPaid(db, { ...ok, amountPaise: res.totalPaise, currency: "INR" });
    detail = await orderForCustomer(db, res.orderNumber, res.accessToken);
    expect(detail.order.paymentStatus).toBe("PAID");
    expect(await code(startPayment(db, detail.order.id))).toBe("CONFLICT");
  });

  it("flags an inventory conflict instead of silently overselling", async () => {
    const { cartHash } = await cartWith(crew, "B2C", { XL: 3 });
    const res = await placeOrder(db, { cartTokenHash: cartHash, form: form() });
    const black = crew.colours.find((c) => c.name === "Black")!;
    const variant = crew.variants.find((v) => v.colourId === black.id && v.sizeCode === "XL")!;
    await db.update(t.productVariants).set({ stockQty: 1 }).where(eq(t.productVariants.id, variant.id)); // sold elsewhere meanwhile
    const sim = dev.simulateSuccess(res.payment!.orderId);
    await markPaid(db, { ...sim, amountPaise: res.totalPaise, currency: "INR" });
    const detail = await orderForCustomer(db, res.orderNumber, res.accessToken);
    expect(detail.order.needsAttention).toMatch(/Stock conflict/);
    const [v] = await db.select().from(t.productVariants).where(eq(t.productVariants.id, variant.id));
    expect(v.stockQty).toBe(1); // never negative
  });
});

describe("order access and workflow", () => {
  it("customers need the order's token; wrong tokens look like missing orders", async () => {
    const { cartHash } = await cartWith(crew, "B2C", { M: 1 });
    const res = await placeOrder(db, { cartTokenHash: cartHash, form: form() });
    expect(await code(orderForCustomer(db, res.orderNumber, "guess"))).toBe("NOT_FOUND");
    expect(await code(orderForCustomer(db, res.orderNumber, null))).toBe("NOT_FOUND");
    expect(await code(orderForCustomer(db, "SG-99999999", res.accessToken))).toBe("NOT_FOUND");
  });

  it("enforces transitions by role and records who changed what", async () => {
    const [admin] = await db.insert(t.users).values({ email: "a@x.dev", name: "Admin A" }).returning();
    const [prod] = await db.insert(t.users).values({ email: "p@x.dev", name: "Prod P" }).returning();
    const A = { id: admin.id, roles: ["ADMIN" as const] };
    const P = { id: prod.id, roles: ["PRODUCTION" as const] };
    const { cartHash } = await cartWith(crew, "B2C", { M: 1 });
    const res = await placeOrder(db, { cartTokenHash: cartHash, form: form() });
    const sim = dev.simulateSuccess(res.payment!.orderId);
    await markPaid(db, { ...sim, amountPaise: res.totalPaise, currency: "INR" });
    const { order } = await orderForCustomer(db, res.orderNumber, res.accessToken);

    expect(await code(changeStatus(db, P, { orderId: order.id, to: "APPROVED" }))).toBe("FORBIDDEN"); // design approval is admin's
    await changeStatus(db, A, { orderId: order.id, to: "APPROVED" });
    await changeStatus(db, P, { orderId: order.id, to: "IN_PRODUCTION" });
    await changeStatus(db, P, { orderId: order.id, to: "PRINTED" });
    expect(await code(changeStatus(db, P, { orderId: order.id, to: "CANCELLED", note: "x" }))).toBe("FORBIDDEN");
    expect(await code(changeStatus(db, A, { orderId: order.id, to: "IN_PRODUCTION" }))).toBe("VALIDATION"); // backward needs a note
    await changeStatus(db, A, { orderId: order.id, to: "IN_PRODUCTION", note: "Misprint on sleeve, redo" });
    expect(await code(changeStatus(db, A, { orderId: order.id, to: "PAID" }))).toBe("FORBIDDEN");

    const detail = await orderForCustomer(db, res.orderNumber, res.accessToken);
    const manual = detail.history.filter((h) => h.changedBy);
    expect(manual.map((h) => [h.toStatus, h.changedByName])).toEqual([
      ["APPROVED", "Admin A"],
      ["IN_PRODUCTION", "Prod P"],
      ["PRINTED", "Prod P"],
      ["IN_PRODUCTION", "Admin A"],
    ]);
    const audits = await db.select().from(t.auditLogs).where(eq(t.auditLogs.entityId, order.id));
    expect(audits).toHaveLength(4);
  });

  it("state machine unit rules", () => {
    expect(checkTransition("DELIVERED", "CANCELLED", { roles: ["ADMIN"] }).ok).toBe(false);
    expect(checkTransition("PAYMENT_PENDING", "PAID", { roles: ["ADMIN"] }).ok).toBe(false);
    expect(checkTransition("PAYMENT_PENDING", "PAID", "system").ok).toBe(true);
    expect(checkTransition("QUALITY_CHECK", "SHIPPED", { roles: ["PRODUCTION"] }).ok).toBe(true);
    expect(checkTransition("SHIPPED", "DELIVERED", { roles: ["PRODUCTION"] }).ok).toBe(false);
    expect(checkTransition("APPROVED", "SHIPPED", { roles: ["ADMIN"] }).ok).toBe(false);
  });
});
