import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { getDb } from "@/server/db/client";
import { requestMeta } from "@/server/auth/session";
import { currentCartTokenHash } from "@/server/services/cart";
import { placeOrder } from "@/server/services/orders";
import { enforce } from "@/server/services/rate-limit";

/** Places the order from the cart. Totals are computed here; the request carries none. */
export const POST = api(async (req) => {
  const { form } = await readJson(req, z.object({ form: z.record(z.string(), z.unknown()) }));
  const db = await getDb();
  const { ip } = await requestMeta();
  await enforce(db, `checkout:ip:${ip ?? "unknown"}`, 20, 10 * 60, "Too many checkout attempts. Please wait a few minutes.");
  const result = await placeOrder(db, { cartTokenHash: await currentCartTokenHash(), form: form as never });
  return json(result, { status: 201 });
});
