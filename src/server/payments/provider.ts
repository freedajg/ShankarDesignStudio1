import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { env } from "../env";
import { safeEqual } from "../auth/crypto";

/**
 * Payment gateway boundary. Amounts are always computed by the server and passed
 * in here; nothing about the amount is read from the browser.
 */
export type CreatedPayment = {
  providerOrderId: string;
  /** safe for the browser: what the checkout UI needs to open the payment screen */
  client: { provider: "razorpay"; keyId: string; orderId: string; amount: number; currency: string } | { provider: "dev"; orderId: string; amount: number; currency: string };
};

export type WebhookPayment = { providerOrderId: string; providerPaymentId: string; amountPaise: number; currency: string; status: "captured" | "failed"; reason?: string };

export interface PaymentProvider {
  readonly name: "razorpay" | "dev";
  createPayment(input: { amountPaise: number; currency: "INR"; receipt: string; notes: Record<string, string> }): Promise<CreatedPayment>;
  /** Verifies the signature returned to the browser after checkout. */
  verifyCheckout(input: { providerOrderId: string; providerPaymentId: string; signature: string }): boolean;
  /** Verifies a server-to-server webhook against the raw request body. */
  verifyWebhook(rawBody: string, signature: string | null): boolean;
  parseWebhook(body: unknown): WebhookPayment | null;
}

const hmac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");

export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay" as const;
  constructor(
    private keyId: string,
    private keySecret: string,
    private webhookSecret: string | undefined,
  ) {}

  async createPayment(input: { amountPaise: number; currency: "INR"; receipt: string; notes: Record<string, string> }): Promise<CreatedPayment> {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: input.amountPaise, currency: input.currency, receipt: input.receipt.slice(0, 40), notes: input.notes }),
    });
    if (!res.ok) throw new Error(`Razorpay order creation failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as { id: string; amount: number; currency: string };
    if (data.amount !== input.amountPaise) throw new Error("Razorpay returned a different amount");
    return { providerOrderId: data.id, client: { provider: "razorpay", keyId: this.keyId, orderId: data.id, amount: data.amount, currency: data.currency } };
  }

  verifyCheckout({ providerOrderId, providerPaymentId, signature }: { providerOrderId: string; providerPaymentId: string; signature: string }) {
    return safeEqual(hmac(this.keySecret, `${providerOrderId}|${providerPaymentId}`), signature);
  }

  verifyWebhook(rawBody: string, signature: string | null) {
    if (!this.webhookSecret || !signature) return false;
    return safeEqual(hmac(this.webhookSecret, rawBody), signature);
  }

  parseWebhook(body: unknown): WebhookPayment | null {
    const b = body as { event?: string; payload?: { payment?: { entity?: Record<string, unknown> } } };
    const p = b?.payload?.payment?.entity;
    if (!p || typeof p.order_id !== "string" || typeof p.id !== "string") return null;
    if (b.event === "payment.captured") {
      return { providerOrderId: p.order_id, providerPaymentId: p.id, amountPaise: Number(p.amount), currency: String(p.currency), status: "captured" };
    }
    if (b.event === "payment.failed") {
      return { providerOrderId: p.order_id, providerPaymentId: p.id, amountPaise: Number(p.amount), currency: String(p.currency), status: "failed", reason: String(p.error_description ?? "Payment failed") };
    }
    return null;
  }
}

/**
 * DEVELOPMENT PAYMENT PROVIDER — moves no money. Stands in for the gateway so
 * the whole order flow can be exercised locally. Signatures use a server-only
 * secret, so a browser still cannot fake a successful payment. Refused in
 * production unless ALLOW_DEV_PAYMENTS=true (see env.ts).
 */
export class DevPaymentProvider implements PaymentProvider {
  readonly name = "dev" as const;
  constructor(private secret: string) {}

  async createPayment(input: { amountPaise: number; currency: "INR" }): Promise<CreatedPayment> {
    const orderId = `dev_order_${randomBytes(9).toString("base64url")}`;
    return { providerOrderId: orderId, client: { provider: "dev", orderId, amount: input.amountPaise, currency: input.currency } };
  }

  /** What the gateway would return to the browser on success (server-side only). */
  simulateSuccess(providerOrderId: string) {
    const providerPaymentId = `dev_pay_${randomBytes(9).toString("base64url")}`;
    return { providerOrderId, providerPaymentId, signature: hmac(this.secret, `${providerOrderId}|${providerPaymentId}`) };
  }

  verifyCheckout({ providerOrderId, providerPaymentId, signature }: { providerOrderId: string; providerPaymentId: string; signature: string }) {
    return safeEqual(hmac(this.secret, `${providerOrderId}|${providerPaymentId}`), signature);
  }

  verifyWebhook(rawBody: string, signature: string | null) {
    return !!signature && safeEqual(hmac(this.secret, rawBody), signature);
  }

  signWebhook(rawBody: string) {
    return hmac(this.secret, rawBody);
  }

  parseWebhook(body: unknown): WebhookPayment | null {
    const b = body as Partial<WebhookPayment>;
    return b?.providerOrderId && b.providerPaymentId && b.status ? (b as WebhookPayment) : null;
  }
}

let provider: PaymentProvider | undefined;
// stable across dev hot reloads so in-flight dev payments stay verifiable
const g = globalThis as unknown as { __sgDevPaySecret?: string };
g.__sgDevPaySecret ??= randomBytes(32).toString("hex");
const devSecret = g.__sgDevPaySecret;

export function paymentProvider(): PaymentProvider {
  if (provider) return provider;
  const e = env();
  provider =
    e.PAYMENT_PROVIDER === "razorpay"
      ? new RazorpayProvider(e.RAZORPAY_KEY_ID!, e.RAZORPAY_KEY_SECRET!, e.RAZORPAY_WEBHOOK_SECRET)
      : new DevPaymentProvider(e.DEV_PAYMENT_SECRET ?? devSecret);
  return provider;
}

export function setPaymentProviderForTests(p: PaymentProvider | undefined) {
  provider = p;
}
