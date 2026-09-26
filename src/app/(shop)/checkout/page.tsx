import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrderTotals } from "@/components/order-totals";
import { Alert, Card } from "@/components/ui/feedback";
import { formatInr } from "@/domain/money";
import { requestDb } from "@/server/db/request-db";
import { env } from "@/server/env";
import { currentCartTokenHash, loadCart } from "@/server/services/cart";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const db = await requestDb();
  const { cart, lines, totals } = await loadCart(db, await currentCartTokenHash());
  if (!cart || !lines.length || !totals) redirect("/cart");
  const problem = lines.find((l) => l.problem);
  const devPayments = env().PAYMENT_PROVIDER === "dev";

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-8 lg:grid-cols-[1fr_22rem]">
      <section>
        <h1 className="mb-6 text-2xl font-semibold">Checkout</h1>
        {problem ? (
          <Alert tone="warning" title="Your cart needs attention">
            {problem.problem} <a href="/cart" className="font-medium underline">Review your cart</a>
          </Alert>
        ) : (
          <CheckoutForm channel={cart.channel} totalPaise={totals.totalPaise} devPayments={devPayments} />
        )}
      </section>
      <aside aria-label="Order summary" className="lg:sticky lg:top-24 lg:self-start">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">{cart.channel === "B2B" ? "Bulk order" : "Your order"}</h2>
          <ul className="mb-4 flex flex-col gap-3 border-b border-line pb-4 text-sm">
            {lines.map((l) => (
              <li key={l.id} className="flex justify-between gap-3">
                <span>
                  <span className="font-medium">{l.productName}</span>
                  <span className="block text-ink-muted">
                    {l.colourName} · {l.sizes.map((s) => `${s.sizeCode}×${s.quantity}`).join(", ")}
                  </span>
                </span>
                <span className="tabular-nums">{formatInr(l.lineTotalPaise)}</span>
              </li>
            ))}
          </ul>
          <OrderTotals totals={totals} />
        </Card>
      </aside>
    </main>
  );
}
