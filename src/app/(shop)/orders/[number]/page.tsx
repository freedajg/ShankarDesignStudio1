import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, Package } from "lucide-react";
import { OrderTotals } from "@/components/order-totals";
import { Alert, Badge, Card } from "@/components/ui/feedback";
import { formatInr } from "@/domain/money";
import { CUSTOMER_STATUS, type OrderStatus } from "@/domain/orders";
import type { OrderTotals as Totals } from "@/domain/pricing";
import { requestDb } from "@/server/db/request-db";
import { AppError } from "@/server/errors";
import { loadProductConfig } from "@/server/services/catalogue";
import { getVersion } from "@/server/services/designs";
import { orderForCustomer } from "@/server/services/orders";
import { toDataUrl, versionPreview } from "@/server/render/design";
import { RetryPayment } from "./retry-payment";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

const STEPS: { label: string; statuses: OrderStatus[] }[] = [
  { label: "Paid", statuses: ["PAID", "DESIGN_REVIEW"] },
  { label: "Design approved", statuses: ["APPROVED"] },
  { label: "Printing", statuses: ["IN_PRODUCTION", "PRINTED", "QUALITY_CHECK"] },
  { label: "Shipped", statuses: ["SHIPPED"] },
  { label: "Delivered", statuses: ["DELIVERED"] },
];

export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[number]">) {
  const { number } = await params;
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : null;
  const db = await requestDb();
  const detail = await orderForCustomer(db, number, token).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const { order, items } = detail;
  const totals = (order.pricingSnapshot as { totals: Totals }).totals;
  const paid = order.paymentStatus === "PAID";
  const stepIndex = STEPS.findIndex((s) => s.statuses.includes(order.status));

  const withPreviews = await Promise.all(
    items.map(async (item) => {
      const version = await getVersion(db, item.designVersionId);
      const product = await loadProductConfig(db, { id: item.productId });
      const sides = (["front", "back"] as const).filter((s) => version?.doc.surfaces[s].elements.length);
      const previews =
        version && product
          ? await Promise.all(sides.map(async (side) => ({ side, src: toDataUrl(await versionPreview(db, { versionId: version.id, product, doc: version.doc, side, width: 360 })) })))
          : [];
      return { ...item, previews };
    }),
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="flex flex-col gap-3">
        {paid ? (
          <p className="flex items-center gap-2 font-medium text-success">
            <CheckCircle2 className="size-5" aria-hidden /> Thank you — your order is confirmed.
          </p>
        ) : (
          <p className="flex items-center gap-2 font-medium text-warning-ink">
            <Clock className="size-5" aria-hidden /> Payment not completed yet. Your design is saved with this order.
          </p>
        )}
        <h1 className="text-3xl font-semibold">Order {order.orderNumber}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge tone={paid ? "success" : "warning"} data-testid="order-status">{CUSTOMER_STATUS[order.status]}</Badge>
          <Badge>{order.channel === "B2B" ? "Bulk order" : "Single order"}</Badge>
          <Badge>
            {order.totalQuantity} {order.totalQuantity === 1 ? "piece" : "pieces"}
          </Badge>
        </div>
      </div>

      {!paid && order.status === "PAYMENT_PENDING" && token && (
        <Card className="mt-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">{order.paymentStatus === "FAILED" ? "Payment wasn't completed." : "Complete your payment"}</p>
            <p className="text-sm text-ink-muted">Your design is still saved. Pay {formatInr(order.totalPaise)} to send it to production.</p>
          </div>
          <RetryPayment orderNumber={order.orderNumber} token={token} label={order.paymentStatus === "FAILED" ? "Try again" : "Pay now"} />
        </Card>
      )}

      {paid && order.status !== "CANCELLED" && (
        <ol className="mt-8 grid grid-cols-5 gap-2" aria-label="Order progress">
          {STEPS.map((s, i) => (
            <li key={s.label} className="flex flex-col gap-2">
              <span className={`h-1.5 rounded-full ${i <= stepIndex ? "bg-accent" : "bg-surface-sunken"}`} />
              <span className={`text-xs ${i <= stepIndex ? "font-medium text-ink" : "text-ink-muted"}`}>
                {s.label}
                {i === stepIndex && <span className="sr-only"> (current)</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {order.status === "CANCELLED" && <Alert tone="danger" className="mt-6">This order was cancelled. Contact us if you have questions.</Alert>}

      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_18rem]">
        <section aria-label="Items" className="flex flex-col gap-4">
          {withPreviews.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex gap-2">
                {item.previews.map((p) => (
                  <figure key={p.side} className="w-28 rounded-[var(--radius-sm)] bg-garment-bg p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.src} alt={`${item.productName} ${p.side}`} className="w-full" />
                    <figcaption className="text-center text-xs capitalize text-ink-muted">{p.side}</figcaption>
                  </figure>
                ))}
              </div>
              <div className="mt-3 flex justify-between gap-3">
                <div>
                  <p className="font-semibold">{item.productName}</p>
                  <p className="text-sm text-ink-muted">
                    {item.colourName} · {item.printMethodCode}
                  </p>
                  <p className="mt-1 text-sm">{item.sizes.map((s) => `${s.sizeCode} × ${s.quantity}`).join(" · ")}</p>
                </div>
                <p className="font-semibold tabular-nums">{formatInr(item.lineTotalPaise)}</p>
              </div>
            </Card>
          ))}
        </section>
        <aside className="flex flex-col gap-4">
          <Card className="p-4">
            <OrderTotals totals={totals} />
          </Card>
          <Card className="p-4 text-sm">
            <p className="mb-1 flex items-center gap-1.5 font-semibold">
              <Package className="size-4" aria-hidden /> Delivering to
            </p>
            <p>{order.contactName}</p>
            {order.companyName && <p>{order.companyName}</p>}
            <p className="text-ink-muted">
              {order.addressLine1}
              {order.addressLine2 ? `, ${order.addressLine2}` : ""}, {order.city}, {order.state} {order.pincode}
            </p>
          </Card>
          <p className="text-xs text-ink-muted">Keep this page&apos;s link private — anyone with it can see this order.</p>
        </aside>
      </div>
    </main>
  );
}
