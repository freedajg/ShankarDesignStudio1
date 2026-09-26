import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db, DbOrTx, Tx } from "../db/client";
import * as t from "../db/schema";
import { AppError, notFound } from "../errors";
import { hashToken, randomToken, safeEqual } from "../auth/crypto";
import { env } from "../env";
import { sendSafely } from "../email";
import { paymentProvider, type CreatedPayment } from "../payments/provider";
import { audit } from "./audit";
import { buildLine, type BuiltLine } from "./cart";
import { loadSettings } from "./catalogue";
import { checkoutSchema, type CheckoutInput } from "@/domain/checkout";
import { formatInr } from "@/domain/money";
import { checkTransition, STATUS_LABEL, type OrderStatus } from "@/domain/orders";
import { priceOrder } from "@/domain/pricing";
import type { Role } from "@/domain/permissions";

// ------------------------------------------------------------------ status changes

/** The only function that changes an order's status. Records history; callers hold the row lock. */
async function setStatus(tx: Tx, order: { id: string; status: OrderStatus }, to: OrderStatus, actor: { userId: string | null; note?: string | null }) {
  await tx.update(t.orders).set({ status: to }).where(eq(t.orders.id, order.id));
  await tx.insert(t.orderStatusHistory).values({ orderId: order.id, fromStatus: order.status, toStatus: to, changedBy: actor.userId, note: actor.note ?? null });
  order.status = to;
}

async function lockOrder(tx: Tx, where: ReturnType<typeof eq>) {
  const [row] = await tx.select().from(t.orders).where(where).for("update").limit(1);
  return row ?? null;
}

// ------------------------------------------------------------------ checkout

function isUniqueViolation(err: unknown, constraint: string) {
  const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const c = e?.cause ?? e;
  return c?.code === "23505" && (!c.constraint || c.constraint === constraint);
}

export type CheckoutResult = {
  orderNumber: string;
  accessToken: string;
  totalPaise: number;
  payment: CreatedPayment["client"] | null;
  paymentError: string | null;
};

/**
 * Turns the cart into an order. Every line is re-validated and re-priced from the
 * database; the order stores snapshots of products, prices and the customer so it
 * never changes if the catalogue or pricing does. Each line references an
 * immutable design version — an order without artwork cannot be created.
 */
export async function placeOrder(db: Db, input: { cartTokenHash: string | null; form: CheckoutInput }): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse(input.form);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new AppError("VALIDATION", i.message, { fields: parsed.error.issues.map((x) => ({ path: x.path.join("."), message: x.message })) });
  }
  const form = parsed.data;

  // A retried submit returns the order it already created (no duplicates).
  const [existing] = await db.select().from(t.orders).where(eq(t.orders.idempotencyKey, form.idempotencyKey)).limit(1);
  if (existing) throw new AppError("CONFLICT", "This order was already placed.", { orderNumber: existing.orderNumber });

  if (!input.cartTokenHash) throw new AppError("VALIDATION", "Your cart is empty.");
  const [cart] = await db.select().from(t.carts).where(eq(t.carts.tokenHash, input.cartTokenHash)).limit(1);
  if (!cart) throw new AppError("VALIDATION", "Your cart is empty.");
  const items = await db.select().from(t.cartItems).where(eq(t.cartItems.cartId, cart.id)).orderBy(asc(t.cartItems.createdAt));
  if (!items.length) throw new AppError("VALIDATION", "Your cart is empty.");
  if (cart.channel === "B2B" && !form.companyName) {
    throw new AppError("VALIDATION", "Enter your company name for a bulk order.", { fields: [{ path: "companyName", message: "Company name is required for bulk orders" }] });
  }

  const settings = await loadSettings(db);
  const sizeRows = await db.select().from(t.cartItemSizes).where(inArray(t.cartItemSizes.cartItemId, items.map((i) => i.id)));
  const methods = await db.select().from(t.printMethods);
  const variants = await db.select({ id: t.productVariants.id, sizeId: t.productVariants.sizeId }).from(t.productVariants).where(inArray(t.productVariants.id, sizeRows.map((s) => s.variantId)));
  const lines: BuiltLine[] = [];
  for (const item of items) {
    const line = await buildLine(
      db,
      {
        designVersionId: item.designVersionId,
        channel: cart.channel,
        printMethodCode: methods.find((m) => m.id === item.printMethodId)?.code ?? "",
        sizes: sizeRows.filter((s) => s.cartItemId === item.id).map((s) => ({ sizeId: variants.find((v) => v.id === s.variantId)!.sizeId, quantity: s.quantity })),
      },
      settings,
    );
    if (line.doc.surfaces.front.elements.length + line.doc.surfaces.back.elements.length === 0) {
      throw new AppError("VALIDATION", "Every item needs a design before it can be ordered.");
    }
    lines.push(line);
  }
  const totals = priceOrder(lines.map((l) => l.price), settings);
  const accessToken = randomToken();

  const order = await db.transaction(async (tx) => {
    const [customer] = await tx
      .insert(t.customers)
      .values({ email: form.email, name: form.name, phone: form.phone })
      .onConflictDoUpdate({ target: t.customers.email, set: { name: form.name, phone: form.phone, updatedAt: new Date() } })
      .returning();
    if (cart.channel === "B2B") {
      await tx
        .insert(t.companies)
        .values({ customerId: customer.id, name: form.companyName, gstin: form.gstin || null })
        .onConflictDoUpdate({ target: [t.companies.customerId, t.companies.name], set: { gstin: form.gstin || null } });
    }
    const [{ n }] = await tx.select({ n: sql<string>`nextval('order_number_seq')::text` }).from(sql`(select 1) as one`);
    const [o] = await tx
      .insert(t.orders)
      .values({
        orderNumber: `SG-${n}`,
        channel: cart.channel,
        status: "NEW",
        paymentStatus: "PENDING",
        customerId: customer.id,
        contactName: form.name,
        contactEmail: form.email,
        contactPhone: form.phone,
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2 || null,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        companyName: form.companyName || null,
        gstin: form.gstin || null,
        poReference: form.poReference || null,
        notes: form.notes || null,
        subtotalPaise: totals.subtotalPaise,
        discountPaise: totals.discountPaise,
        taxPaise: totals.taxPaise,
        shippingPaise: totals.shippingPaise,
        totalPaise: totals.totalPaise,
        totalQuantity: totals.quantity,
        pricingSnapshot: { totals, settings: { tax: settings.tax, shipping: settings.shipping, pricing: settings.pricing }, pricedAt: new Date().toISOString() },
        accessTokenHash: hashToken(accessToken),
        idempotencyKey: form.idempotencyKey,
        placedAt: new Date(),
      })
      .returning();
    await tx.insert(t.orderStatusHistory).values({ orderId: o.id, fromStatus: null, toStatus: "NEW", changedBy: null, note: "Order placed" });

    for (const [position, line] of lines.entries()) {
      const [item] = await tx
        .insert(t.orderItems)
        .values({
          orderId: o.id,
          position,
          productId: line.product.id,
          productName: line.product.name,
          productSlug: line.product.slug,
          colourId: line.colour.id,
          colourName: line.colour.name,
          colourHex: line.colour.hex,
          printMethodId: line.method.id,
          printMethodCode: line.method.code,
          designVersionId: line.designVersionId,
          quantity: line.price.quantity,
          unitPricePaise: line.price.averageUnitPaise,
          lineTotalPaise: line.price.lineTotalPaise,
          priceSnapshot: line.snapshot,
        })
        .returning({ id: t.orderItems.id });
      await tx.insert(t.orderItemSizes).values(
        line.sizes.map((s) => ({ orderItemId: item.id, variantId: s.variantId, sizeCode: s.sizeCode, sku: s.sku, quantity: s.quantity, unitPricePaise: s.unitPaise, sort: s.sort })),
      );
    }
    await setStatus(tx, o, "PAYMENT_PENDING", { userId: null, note: "Awaiting payment" });
    // The order now owns the designs; the cart is done.
    await tx.delete(t.cartItems).where(eq(t.cartItems.cartId, cart.id));
    return o;
  }).catch((err: unknown) => {
    // two simultaneous submits with the same key: the unique index lets only one through
    if (isUniqueViolation(err, "orders_idempotency_key_unique")) throw new AppError("CONFLICT", "This order was already placed.");
    throw err;
  });

  const result: CheckoutResult = { orderNumber: order.orderNumber, accessToken, totalPaise: order.totalPaise, payment: null, paymentError: null };
  try {
    result.payment = await startPayment(db, order.id);
  } catch (err) {
    console.error("[checkout] payment start failed", err);
    result.paymentError = "We couldn't reach the payment gateway. Your order is saved — you can retry payment from the order page.";
  }
  return result;
}

/** Creates a gateway payment for the order's stored total (never a client amount). */
export async function startPayment(db: DbOrTx, orderId: string) {
  const [order] = await db.select().from(t.orders).where(eq(t.orders.id, orderId)).limit(1);
  if (!order) throw notFound("That order");
  if (order.paymentStatus === "PAID") throw new AppError("CONFLICT", "This order is already paid.");
  if (order.status !== "PAYMENT_PENDING") throw new AppError("CONFLICT", "This order can't be paid in its current state.");
  const provider = paymentProvider();
  const created = await provider.createPayment({
    amountPaise: order.totalPaise,
    currency: "INR",
    receipt: order.orderNumber,
    notes: { orderNumber: order.orderNumber },
  });
  await db.insert(t.payments).values({ orderId: order.id, provider: provider.name, providerOrderId: created.providerOrderId, amountPaise: order.totalPaise, currency: "INR" });
  return created.client;
}

// ------------------------------------------------------------------ payment results

export type PaymentOutcome = { orderNumber: string; alreadyApplied: boolean };

/**
 * Applies a verified, captured payment. Idempotent: duplicate callbacks and
 * webhooks for the same payment are no-ops. Amount and currency must match what
 * the server asked for. Stock is decremented here, once.
 */
export async function markPaid(db: Db, p: { providerOrderId: string; providerPaymentId: string; amountPaise?: number; currency?: string; raw?: unknown }): Promise<PaymentOutcome> {
  const settings = await loadSettings(db);
  const outcome = await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(t.payments).where(eq(t.payments.providerOrderId, p.providerOrderId)).for("update").limit(1);
    if (!payment) throw notFound("That payment");
    const order = await lockOrder(tx, eq(t.orders.id, payment.orderId));
    if (!order) throw notFound("That order");

    if (payment.status === "PAID") {
      if (payment.providerPaymentId === p.providerPaymentId) return { orderNumber: order.orderNumber, alreadyApplied: true, notify: false };
      await tx.update(t.orders).set({ needsAttention: `Second payment ${p.providerPaymentId} received for an already-paid order — refund required.` }).where(eq(t.orders.id, order.id));
      return { orderNumber: order.orderNumber, alreadyApplied: true, notify: false };
    }
    if (p.amountPaise !== undefined && p.amountPaise !== payment.amountPaise) throw new AppError("PAYMENT", "Payment amount does not match the order.");
    if (p.currency !== undefined && p.currency !== payment.currency) throw new AppError("PAYMENT", "Payment currency does not match the order.");
    if (payment.amountPaise !== order.totalPaise) throw new AppError("PAYMENT", "Payment amount does not match the order total.");

    await tx
      .update(t.payments)
      .set({ status: "PAID", providerPaymentId: p.providerPaymentId, raw: (p.raw as object) ?? null, failureReason: null })
      .where(eq(t.payments.id, payment.id));

    if (order.paymentStatus === "PAID") {
      // paid through another payment attempt already — this one needs a refund
      await tx.update(t.orders).set({ needsAttention: `Duplicate payment ${p.providerPaymentId} — refund required.` }).where(eq(t.orders.id, order.id));
      return { orderNumber: order.orderNumber, alreadyApplied: true, notify: false };
    }

    // decrement tracked stock; a shortfall doesn't reject money already taken, it flags the order
    const shortages: string[] = [];
    const items = await tx.select({ id: t.orderItems.id }).from(t.orderItems).where(eq(t.orderItems.orderId, order.id));
    const sizes = await tx.select().from(t.orderItemSizes).where(inArray(t.orderItemSizes.orderItemId, items.map((i) => i.id)));
    for (const s of sizes) {
      const updated = await tx
        .update(t.productVariants)
        .set({ stockQty: sql`${t.productVariants.stockQty} - ${s.quantity}` })
        .where(and(eq(t.productVariants.id, s.variantId), isNotNull(t.productVariants.stockQty), gte(t.productVariants.stockQty, s.quantity)))
        .returning({ id: t.productVariants.id });
      if (!updated.length) {
        const [v] = await tx.select({ stockQty: t.productVariants.stockQty }).from(t.productVariants).where(eq(t.productVariants.id, s.variantId));
        if (v && v.stockQty !== null) shortages.push(`${s.sku} short by ${s.quantity - v.stockQty}`);
      }
    }

    await tx
      .update(t.orders)
      .set({ paymentStatus: "PAID", paidAt: new Date(), needsAttention: shortages.length ? `Stock conflict: ${shortages.join(", ")}` : null })
      .where(eq(t.orders.id, order.id));
    await setStatus(tx, order, "PAID", { userId: null, note: `Payment ${p.providerPaymentId} verified` });
    await setStatus(tx, order, settings.workflow.requireDesignReview ? "DESIGN_REVIEW" : "APPROVED", { userId: null });
    return { orderNumber: order.orderNumber, alreadyApplied: false, notify: true };
  });

  if (outcome.notify) await sendOrderEmails(db, outcome.orderNumber);
  return { orderNumber: outcome.orderNumber, alreadyApplied: outcome.alreadyApplied };
}

export async function markFailed(db: Db, p: { providerOrderId: string; reason: string }) {
  await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(t.payments).where(eq(t.payments.providerOrderId, p.providerOrderId)).for("update").limit(1);
    if (!payment || payment.status === "PAID") return;
    await tx.update(t.payments).set({ status: "FAILED", failureReason: p.reason.slice(0, 300) }).where(eq(t.payments.id, payment.id));
    await tx.update(t.orders).set({ paymentStatus: "FAILED" }).where(and(eq(t.orders.id, payment.orderId), sql`${t.orders.paymentStatus} <> 'PAID'`));
  });
}

async function sendOrderEmails(db: Db, orderNumber: string) {
  const [o] = await db.select().from(t.orders).where(eq(t.orders.orderNumber, orderNumber)).limit(1);
  if (!o) return;
  const appUrl = env().APP_URL;
  await sendSafely({
    to: o.contactEmail,
    subject: `Order ${o.orderNumber} confirmed — Sweet Ginger`,
    text: `Hi ${o.contactName},\n\nThanks for your order ${o.orderNumber} (${o.totalQuantity} pieces, ${formatInr(o.totalPaise)}). Our team is checking your design before printing.\n\nTrack it here (keep this link private — it opens your order):\n${appUrl}/orders/${o.orderNumber}\n\nSweet Ginger`,
  });
  const staff = env().STAFF_NOTIFY_EMAIL;
  if (staff) {
    await sendSafely({ to: staff, subject: `New ${o.channel} order ${o.orderNumber} — ${formatInr(o.totalPaise)}`, text: `${appUrl}/admin/orders/${o.orderNumber}` });
  }
}

// ------------------------------------------------------------------ customer access

/**
 * A customer reads an order only with its private access token. Wrong token and
 * unknown order look identical (no probing order numbers).
 */
export async function orderForCustomer(db: DbOrTx, orderNumber: string, token: string | null | undefined) {
  if (!token || token.length > 100 || !/^SG-\d+$/.test(orderNumber)) throw notFound("That order");
  const [o] = await db.select().from(t.orders).where(eq(t.orders.orderNumber, orderNumber)).limit(1);
  if (!o || !safeEqual(o.accessTokenHash, hashToken(token))) throw notFound("That order");
  return orderDetail(db, o.id);
}

export async function orderDetail(db: DbOrTx, orderId: string) {
  const [order] = await db.select().from(t.orders).where(eq(t.orders.id, orderId)).limit(1);
  if (!order) throw notFound("That order");
  const items = await db.select().from(t.orderItems).where(eq(t.orderItems.orderId, order.id)).orderBy(asc(t.orderItems.position), asc(t.orderItems.id));
  const sizes = items.length ? await db.select().from(t.orderItemSizes).where(inArray(t.orderItemSizes.orderItemId, items.map((i) => i.id))).orderBy(asc(t.orderItemSizes.sort)) : [];
  const payments = await db.select().from(t.payments).where(eq(t.payments.orderId, order.id)).orderBy(desc(t.payments.createdAt));
  const history = await db
    .select({ h: t.orderStatusHistory, by: t.users.name })
    .from(t.orderStatusHistory)
    .leftJoin(t.users, eq(t.users.id, t.orderStatusHistory.changedBy))
    .where(eq(t.orderStatusHistory.orderId, order.id))
    .orderBy(asc(t.orderStatusHistory.createdAt));
  return {
    order,
    items: items.map((i) => ({ ...i, sizes: sizes.filter((s) => s.orderItemId === i.id) })),
    payments,
    history: history.map((r) => ({ ...r.h, changedByName: r.by })),
  };
}

// ------------------------------------------------------------------ staff actions

export async function changeStatus(
  db: Db,
  actor: { id: string; roles: Role[] },
  input: { orderId: string; to: OrderStatus; note?: string | null; ip?: string | null },
) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, eq(t.orders.id, input.orderId));
    if (!order) throw notFound("That order");
    const check = checkTransition(order.status, input.to, actor);
    if (!check.ok) throw new AppError("FORBIDDEN", check.reason);
    const note = input.note?.trim() || null;
    if (check.requiresNote && !note) throw new AppError("VALIDATION", "Add a note explaining this change.");
    // production-readiness rule: an order is printable only with its design attached
    if (input.to === "IN_PRODUCTION") {
      const items = await tx.select({ v: t.orderItems.designVersionId }).from(t.orderItems).where(eq(t.orderItems.orderId, order.id));
      if (!items.length || items.some((i) => !i.v)) throw new AppError("VALIDATION", "This order has no design attached, so it can't go into production.");
    }
    const from = order.status;
    await setStatus(tx, order, input.to, { userId: actor.id, note });
    await audit(tx, { actorUserId: actor.id, action: "order.status_changed", entityType: "order", entityId: order.id, data: { from, to: input.to, note }, ip: input.ip });
    return { from, to: input.to, label: STATUS_LABEL[input.to] };
  });
}
