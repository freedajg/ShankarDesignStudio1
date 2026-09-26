import { api, json } from "@/server/http";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { paymentProvider } from "@/server/payments/provider";
import { markFailed, markPaid } from "@/server/services/orders";

/**
 * Gateway → server notification (e.g. Razorpay payment.captured / payment.failed).
 * Authenticated by an HMAC over the raw body, so it is exempt from the same-origin
 * check. Safe to receive more than once.
 */
export const POST = api(
  async (req) => {
    const raw = await req.text();
    if (raw.length > 256 * 1024) throw new AppError("VALIDATION", "Payload too large.");
    const provider = paymentProvider();
    if (!provider.verifyWebhook(raw, req.headers.get("x-razorpay-signature") ?? req.headers.get("x-dev-signature"))) {
      throw new AppError("UNAUTHORIZED", "Invalid signature.");
    }
    const event = provider.parseWebhook(JSON.parse(raw));
    if (!event) return json({ ignored: true });
    const db = await getDb();
    try {
      if (event.status === "captured") {
        await markPaid(db, { providerOrderId: event.providerOrderId, providerPaymentId: event.providerPaymentId, amountPaise: event.amountPaise, currency: event.currency, raw: JSON.parse(raw) });
      } else {
        await markFailed(db, { providerOrderId: event.providerOrderId, reason: event.reason ?? "Payment failed" });
      }
    } catch (err) {
      // unknown payments (e.g. from another integration on the same account) are acknowledged, not retried forever
      if (err instanceof AppError && err.code === "NOT_FOUND") return json({ ignored: true });
      throw err;
    }
    return json({ ok: true });
  },
  { signedWebhook: true },
);
