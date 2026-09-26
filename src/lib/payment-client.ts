"use client";

import { apiFetch } from "./api-client";

export type ClientPayment =
  | { provider: "razorpay"; keyId: string; orderId: string; amount: number; currency: string }
  | { provider: "dev"; orderId: string; amount: number; currency: string };

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open(): void; on(event: string, cb: (r: { error?: { description?: string } }) => void): void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("The payment window couldn't load. Check your connection and retry."));
    document.head.appendChild(s);
  });
}

/**
 * Opens the payment screen for an order. The amount comes from the server's
 * payment order; after payment, the server verifies the signature.
 */
export async function launchPayment(input: {
  payment: ClientPayment;
  orderNumber: string;
  accessToken: string;
  prefill?: { name?: string; email?: string; contact?: string };
  /** router.push from the calling component */
  navigate: (url: string) => void;
}) {
  const orderUrl = `/orders/${input.orderNumber}?t=${encodeURIComponent(input.accessToken)}`;
  const p = input.payment;
  if (p.provider === "dev") {
    input.navigate(`/pay/dev?o=${encodeURIComponent(input.orderNumber)}&p=${encodeURIComponent(p.orderId)}&t=${encodeURIComponent(input.accessToken)}`);
    return;
  }
  await loadRazorpay();
  const rzp = new window.Razorpay!({
    key: p.keyId,
    amount: p.amount,
    currency: p.currency,
    order_id: p.orderId,
    name: "Sweet Ginger",
    description: `Order ${input.orderNumber}`,
    prefill: input.prefill,
    theme: { color: "#B8521A" },
    handler: async (r: RazorpayResponse) => {
      try {
        await apiFetch("/api/payments/verify", {
          body: { providerOrderId: r.razorpay_order_id, providerPaymentId: r.razorpay_payment_id, signature: r.razorpay_signature },
        });
      } finally {
        input.navigate(orderUrl);
      }
    },
    modal: { ondismiss: () => input.navigate(orderUrl) },
  });
  rzp.on("payment.failed", (r) => {
    void apiFetch("/api/payments/failed", { body: { providerOrderId: p.orderId, reason: r.error?.description ?? "Payment failed" } }).catch(() => undefined);
  });
  rzp.open();
}
