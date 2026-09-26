import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { requestMeta } from "@/server/auth/session";
import { paymentProvider } from "@/server/payments/provider";
import { markPaid } from "@/server/services/orders";
import { enforce } from "@/server/services/rate-limit";

const body = z.object({
  providerOrderId: z.string().min(1).max(100),
  providerPaymentId: z.string().min(1).max(100),
  signature: z.string().min(1).max(200),
});

/** Browser callback after the gateway's checkout. Trusted only after signature verification. */
export const POST = api(async (req) => {
  const input = await readJson(req, body);
  const db = await getDb();
  const { ip } = await requestMeta();
  await enforce(db, `verify:ip:${ip ?? "unknown"}`, 30, 10 * 60);
  if (!paymentProvider().verifyCheckout(input)) {
    throw new AppError("PAYMENT", "We couldn't verify this payment. If money was deducted, it will be reconciled automatically — please contact us with your order number.");
  }
  const result = await markPaid(db, { providerOrderId: input.providerOrderId, providerPaymentId: input.providerPaymentId });
  return json(result);
});
