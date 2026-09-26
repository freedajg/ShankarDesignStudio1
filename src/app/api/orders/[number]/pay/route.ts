import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { getDb } from "@/server/db/client";
import { orderForCustomer, startPayment } from "@/server/services/orders";
import { enforce } from "@/server/services/rate-limit";

/** Retry payment for a pending order — requires the order's private access token. */
export const POST = api<RouteContext<"/api/orders/[number]/pay">>(async (req, ctx) => {
  const { number } = await ctx.params;
  const { token } = await readJson(req, z.object({ token: z.string().min(1).max(100) }));
  const db = await getDb();
  await enforce(db, `pay:${number}`, 10, 10 * 60, "Too many payment attempts for this order. Please wait a few minutes.");
  const { order } = await orderForCustomer(db, number, token);
  const payment = await startPayment(db, order.id);
  return json({ payment, orderNumber: order.orderNumber, totalPaise: order.totalPaise });
});
