import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/feedback";
import { formatInr } from "@/domain/money";
import { getDb } from "@/server/db/client";
import { requestDb } from "@/server/db/request-db";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { DevPaymentProvider, paymentProvider } from "@/server/payments/provider";
import { markFailed, markPaid, orderForCustomer } from "@/server/services/orders";

export const metadata: Metadata = { title: "Development payment", robots: { index: false } };

/**
 * DEVELOPMENT PAYMENT SCREEN — stands in for the Razorpay window when no gateway
 * keys are configured. It moves no money and does not exist when a real
 * gateway is configured. Success goes through the same signature verification
 * and markPaid() path as a real payment.
 */
async function load(o: string, p: string, t: string) {
  if (env().PAYMENT_PROVIDER !== "dev") notFound();
  const db = await getDb();
  const detail = await orderForCustomer(db, o, t).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const payment = detail.payments.find((x) => x.providerOrderId === p);
  if (!payment) notFound();
  return { db, detail, payment };
}

export default async function DevPayPage({ searchParams }: PageProps<"/pay/dev">) {
  await requestDb();
  const sp = await searchParams;
  const [o, p, t] = [sp.o, sp.p, sp.t].map((v) => (typeof v === "string" ? v : ""));
  const { detail, payment } = await load(o, p, t);
  const orderUrl = `/orders/${o}?t=${encodeURIComponent(t)}`;

  async function succeed() {
    "use server";
    const { db } = await load(o, p, t);
    const dev = paymentProvider() as DevPaymentProvider;
    const sim = dev.simulateSuccess(p);
    if (!dev.verifyCheckout(sim)) throw new Error("dev signature failed");
    await markPaid(db, { providerOrderId: sim.providerOrderId, providerPaymentId: sim.providerPaymentId });
    redirect(orderUrl);
  }
  async function fail() {
    "use server";
    const { db } = await load(o, p, t);
    await markFailed(db, { providerOrderId: p, reason: "Simulated failure (development)" });
    redirect(orderUrl);
  }

  return (
    <main className="grid flex-1 place-items-center px-4 py-12">
      <Card className="w-full max-w-md p-6 shadow-card">
        <div className="flex items-center gap-2 text-info">
          <FlaskConical className="size-5" aria-hidden />
          <p className="text-sm font-semibold uppercase tracking-wider">Development payment</p>
        </div>
        <h1 className="mt-3 text-xl font-semibold">Pay for order {detail.order.orderNumber}</h1>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{formatInr(payment.amountPaise)}</p>
        <Alert tone="info" className="mt-4">
          No payment gateway is configured, so this screen simulates one. <strong>No money moves.</strong> Configure Razorpay keys to take real payments.
        </Alert>
        {payment.status === "PAID" ? (
          <Alert tone="success" className="mt-4">This payment is already complete.</Alert>
        ) : (
          <div className="mt-6 flex flex-col gap-2">
            <form action={succeed}>
              <Button type="submit" variant="accent" size="lg" className="w-full">
                Simulate successful payment
              </Button>
            </form>
            <form action={fail}>
              <Button type="submit" variant="secondary" size="lg" className="w-full">
                Simulate failed payment
              </Button>
            </form>
          </div>
        )}
      </Card>
    </main>
  );
}
