import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/client";
import * as t from "../db/schema";
import { ORDER_STATUSES, type OrderStatus } from "@/domain/orders";

export async function dashboardStats(db: DbOrTx) {
  const byStatus = await db.select({ status: t.orders.status, n: sql<number>`count(*)::int` }).from(t.orders).groupBy(t.orders.status);
  const count = (...s: OrderStatus[]) => byStatus.filter((r) => s.includes(r.status)).reduce((a, r) => a + r.n, 0);
  const [money] = await db
    .select({
      revenue: sql<number>`coalesce(sum(${t.orders.totalPaise}) filter (where ${t.orders.paymentStatus} = 'PAID' and ${t.orders.status} <> 'CANCELLED'), 0)::bigint`,
      b2b: sql<number>`count(*) filter (where ${t.orders.channel} = 'B2B')::int`,
      b2c: sql<number>`count(*) filter (where ${t.orders.channel} = 'B2C')::int`,
      pieces: sql<number>`coalesce(sum(${t.orders.totalQuantity}) filter (where ${t.orders.paymentStatus} = 'PAID'), 0)::int`,
      attention: sql<number>`count(*) filter (where ${t.orders.needsAttention} is not null)::int`,
    })
    .from(t.orders);
  return {
    total: count(...ORDER_STATUSES),
    new: count("NEW", "PAYMENT_PENDING"),
    paid: count("PAID"),
    review: count("DESIGN_REVIEW"),
    production: count("APPROVED", "IN_PRODUCTION"),
    printed: count("PRINTED", "QUALITY_CHECK"),
    shipped: count("SHIPPED", "DELIVERED"),
    cancelled: count("CANCELLED"),
    revenuePaise: Number(money.revenue),
    b2b: money.b2b,
    b2c: money.b2c,
    piecesPaid: money.pieces,
    attention: money.attention,
  };
}

export const orderListQuery = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(ORDER_STATUSES).optional().catch(undefined),
  channel: z.enum(["B2C", "B2B"]).optional().catch(undefined),
  payment: z.enum(["UNPAID", "PENDING", "PAID", "FAILED", "REFUNDED"]).optional().catch(undefined),
  attention: z.literal("1").optional().catch(undefined),
  sort: z.enum(["created", "updated", "total", "number", "quantity"]).catch("created"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
});
export type OrderListQuery = z.infer<typeof orderListQuery>;

export const PAGE_SIZE = 25;

export async function listOrders(db: DbOrTx, query: OrderListQuery) {
  const where: SQL[] = [];
  if (query.q) {
    const like = `%${query.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    where.push(
      or(
        ilike(t.orders.orderNumber, like),
        ilike(t.orders.contactName, like),
        ilike(t.orders.contactEmail, like),
        ilike(t.orders.contactPhone, like),
        ilike(t.orders.companyName, like),
        ilike(t.orders.poReference, like),
      )!,
    );
  }
  if (query.status) where.push(eq(t.orders.status, query.status));
  if (query.channel) where.push(eq(t.orders.channel, query.channel));
  if (query.payment) where.push(eq(t.orders.paymentStatus, query.payment));
  if (query.attention) where.push(isNotNull(t.orders.needsAttention));
  const cond = where.length ? and(...where) : undefined;

  const col = {
    created: t.orders.createdAt,
    updated: t.orders.updatedAt,
    total: t.orders.totalPaise,
    number: t.orders.orderNumber,
    quantity: t.orders.totalQuantity,
  }[query.sort];
  const order = query.dir === "asc" ? asc(col) : desc(col);

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.orders).where(cond);
  const rows = await db
    .select()
    .from(t.orders)
    .where(cond)
    .orderBy(order, desc(t.orders.id))
    .limit(PAGE_SIZE)
    .offset((query.page - 1) * PAGE_SIZE);
  const items = rows.length
    ? await db
        .select({ orderId: t.orderItems.orderId, productName: t.orderItems.productName, colourName: t.orderItems.colourName })
        .from(t.orderItems)
        .where(inArray(t.orderItems.orderId, rows.map((r) => r.id)))
    : [];
  return {
    total: n,
    pages: Math.max(1, Math.ceil(n / PAGE_SIZE)),
    rows: rows.map((r) => {
      const its = items.filter((i) => i.orderId === r.id);
      const first = its[0];
      return { ...r, productSummary: first ? `${first.productName} · ${first.colourName}${its.length > 1 ? ` +${its.length - 1} more` : ""}` : "—" };
    }),
  };
}

export async function recentAttention(db: DbOrTx) {
  return db.select().from(t.orders).where(isNotNull(t.orders.needsAttention)).orderBy(desc(t.orders.updatedAt)).limit(5);
}
