import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { getDb } from "@/server/db/client";
import { requestMeta } from "@/server/auth/session";
import { markFailed } from "@/server/services/orders";
import { enforce } from "@/server/services/rate-limit";

/**
 * The payment screen reports a failed attempt. This can only mark that attempt as
 * failed (never an order as paid or cancelled); a paid attempt is left untouched.
 */
export const POST = api(async (req) => {
  const input = await readJson(req, z.object({ providerOrderId: z.string().min(1).max(100), reason: z.string().max(300).default("Payment failed") }));
  const db = await getDb();
  const { ip } = await requestMeta();
  await enforce(db, `payfail:ip:${ip ?? "unknown"}`, 30, 10 * 60);
  await markFailed(db, input);
  return json({ ok: true });
});
