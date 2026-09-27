import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { AlertTriangle, ArrowLeft, Download, FileJson, FileText, ImageIcon } from "lucide-react";
import { PaymentBadge, StatusBadge } from "@/components/admin/status-badge";
import { OrderTotals } from "@/components/order-totals";
import { buttonVariants } from "@/components/ui/button";
import { Alert, Badge, Card } from "@/components/ui/feedback";
import { artworkWarnings } from "@/domain/artwork";
import { SIDES } from "@/domain/design/schema";
import { getFont } from "@/domain/fonts";
import { formatInr } from "@/domain/money";
import { allowedNext, checkTransition, STATUS_LABEL } from "@/domain/orders";
import type { OrderTotals as Totals } from "@/domain/pricing";
import { requirePermissionPage } from "@/server/auth/session";
import { requestDb } from "@/server/db/request-db";
import * as t from "@/server/db/schema";
import { aiOriginOf } from "@/server/services/ai-generation";
import { loadSettings } from "@/server/services/catalogue";
import { orderDetail } from "@/server/services/orders";
import { toDataUrl, versionPreview } from "@/server/render/design";
import { adapterFor } from "@/server/production/adapters";
import { fileBase, loadItemContext, productionNotes } from "@/server/production/files";
import { StatusControl } from "./status-control";

export const metadata: Metadata = { title: "Order" };

const fmt = (d: Date | null) => (d ? d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "—");

export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[number]">) {
  const { number } = await params;
  const user = await requirePermissionPage("orders:read", `/admin/orders/${number}`);
  const db = await requestDb();
  const [row] = await db.select({ id: t.orders.id }).from(t.orders).where(eq(t.orders.orderNumber, number)).limit(1);
  if (!row) notFound();
  const detail = await orderDetail(db, row.id);
  const { order } = detail;
  const rules = (await loadSettings(db)).artwork;
  const totals = (order.pricingSnapshot as { totals: Totals }).totals;
  const dl = (q: string) => `/api/admin/orders/${order.orderNumber}/download?${q}`;

  const items = await Promise.all(
    detail.items.map(async (item, index) => {
      const { doc, product, version } = await loadItemContext(db, item);
      const sides = SIDES.filter((s) => doc.surfaces[s].elements.length);
      const previews = await Promise.all(sides.map(async (side) => ({ side, src: toDataUrl(await versionPreview(db, { versionId: version.id, product, doc, side, width: 520 })) })));
      const assetIds = sides.flatMap((s) => doc.surfaces[s].elements.flatMap((e) => (e.type === "image" ? [e.assetId] : [])));
      const assets = assetIds.length ? await db.select().from(t.artworkAssets).where(inArray(t.artworkAssets.id, assetIds)) : [];
      const aiOrigin = await aiOriginOf(db, assets.filter((a) => a.source === "AI").map((a) => a.id));
      const notes = await productionNotes(db, item);
      return { item, index, doc, product, version, sides, previews, assets, aiOrigin, notes, adapter: adapterFor(item.printMethodCode) };
    }),
  );
  const options = allowedNext(order.status, user);
  const noteRequiredFor = options.filter((s) => {
    const c = checkTransition(order.status, s, user);
    return c.ok && c.requiresNote;
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Orders
      </Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{order.orderNumber}</h1>
        <StatusBadge status={order.status} />
        <PaymentBadge status={order.paymentStatus} />
        <Badge tone={order.channel === "B2B" ? "accent" : "neutral"}>{order.channel === "B2B" ? "Bulk (B2B)" : "Single (B2C)"}</Badge>
        <span className="text-sm text-ink-muted">Placed {fmt(order.placedAt)}</span>
        <a href={dl("kind=pdf")} className={buttonVariants({ variant: "secondary", size: "sm", className: "ml-auto" })}>
          <FileText aria-hidden /> Job sheet PDF
        </a>
      </header>

      {order.needsAttention && (
        <Alert tone="warning" title="Needs attention">
          {order.needsAttention}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          {items.map(({ item, index, doc, product, previews, assets, aiOrigin, notes, adapter }) => {
            const base = fileBase(order.orderNumber, index, detail.items.length);
            return (
              <Card key={item.id} className="overflow-hidden" data-testid="admin-order-item">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
                  <div>
                    <h2 className="font-semibold">
                      {detail.items.length > 1 && `${index + 1}. `}
                      {item.productName}
                    </h2>
                    <p className="text-sm text-ink-muted">
                      <span className="mr-1 inline-block size-3 rounded-full border border-swatch-edge align-middle" style={{ backgroundColor: item.colourHex }} />
                      {item.colourName} ({item.colourHex}) · {item.printMethodCode} · {item.quantity} pcs
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums">{formatInr(item.lineTotalPaise)}</p>
                </div>

                <div className="grid gap-6 p-5 md:grid-cols-2">
                  {previews.map((p) => {
                    const area = product.printAreas.find((a) => a.side === p.side && a.code === doc.surfaces[p.side].printAreaCode)!;
                    return (
                      <figure key={p.side} className="flex flex-col gap-3">
                        <div className="rounded-[var(--radius-md)] bg-garment-bg p-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.src} alt={`${p.side} design as ordered`} className="mx-auto w-full max-w-sm" />
                        </div>
                        <figcaption className="text-sm">
                          <p className="font-semibold capitalize">{p.side}</p>
                          <p className="text-ink-muted">
                            {area.name} · {area.widthMm} × {area.heightMm} mm
                          </p>
                          <ul className="mt-2 flex flex-col gap-1 text-xs">
                            {doc.surfaces[p.side].elements.map((el) => (
                              <li key={el.id} className="rounded bg-surface-muted px-2 py-1">
                                {el.type === "text"
                                  ? `Text “${el.text.replace(/\n/g, " / ")}” · ${getFont(el.fontId).label}${el.bold ? " bold" : ""}${el.italic ? " italic" : ""} · ${el.fontSize} mm · ${el.fill}`
                                  : `${assets.find((a) => a.id === el.assetId)?.source === "AI" ? "AI-generated image" : "Image"} ${assets.find((a) => a.id === el.assetId)?.originalFilename ?? ""} · ${el.width} × ${el.height} mm`}{" "}
                                · at ({el.x}, {el.y}) mm · {el.rotation}°
                              </li>
                            ))}
                          </ul>
                          {(notes[p.side] ?? []).map((n, i) => (
                            <p key={i} className={`mt-2 flex items-start gap-1 text-xs ${n.level === "warning" ? "font-medium text-warning-ink" : "text-ink-muted"}`}>
                              {n.level === "warning" && <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />} {n.message}
                            </p>
                          ))}
                          <a href={dl(`kind=print&item=${index + 1}&side=${p.side}`)} className={buttonVariants({ variant: "primary", size: "sm", className: "mt-3" })}>
                            <Download aria-hidden /> {base}_{p.side.toUpperCase()}_{adapter.code}.png
                          </a>
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
                <p className="px-5 text-xs text-ink-muted">{adapter.fileDescription}</p>

                <div className="mt-4 border-t border-line px-5 py-4">
                  <h3 className="mb-2 text-sm font-semibold">Size breakdown</h3>
                  <table className="text-sm">
                    <thead>
                      <tr className="text-left text-ink-muted">
                        <th scope="col" className="pr-6 font-medium">Size</th>
                        <th scope="col" className="pr-6 font-medium">SKU</th>
                        <th scope="col" className="pr-6 text-right font-medium">Qty</th>
                        <th scope="col" className="text-right font-medium">Unit</th>
                      </tr>
                    </thead>
                    <tbody data-testid="size-breakdown">
                      {item.sizes.map((s) => (
                        <tr key={s.variantId}>
                          <td className="pr-6 font-semibold">{s.sizeCode}</td>
                          <td className="pr-6 font-mono text-xs text-ink-muted">{s.sku}</td>
                          <td className="pr-6 text-right tabular-nums">{s.quantity}</td>
                          <td className="text-right tabular-nums">{formatInr(s.unitPricePaise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
                  <a href={dl(`kind=json&item=${index + 1}`)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    <FileJson aria-hidden /> {base}_DESIGN.json
                  </a>
                  {assets.map((a) => {
                    const w = artworkWarnings(a, null, rules);
                    return (
                      <span key={a.id} className="flex flex-wrap items-center gap-1">
                        <a href={dl(`kind=original&asset=${a.id}`)} className={buttonVariants({ variant: "secondary", size: "sm" })} title={w.map((x) => x.message).join(" ")}>
                          <ImageIcon aria-hidden /> Original: {a.originalFilename ?? "artwork"}
                        </a>
                        {a.source === "AI" && (
                          <Badge tone="accent" title={aiOrigin.get(a.id) ? `Prompt: ${aiOrigin.get(a.id)!.prompt}` : undefined}>
                            AI-generated
                          </Badge>
                        )}
                        <a href={dl(`kind=processed&asset=${a.id}`)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                          Processed PNG
                        </a>
                      </span>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>

        <aside className="flex flex-col gap-4">
          <Card className="p-4">
            <h2 className="mb-3 font-semibold">Production status</h2>
            <StatusControl orderId={order.id} orderNumber={order.orderNumber} options={options} noteRequiredFor={noteRequiredFor} />
          </Card>

          <Card className="p-4 text-sm">
            <h2 className="mb-2 font-semibold">Customer</h2>
            <p>{order.contactName}</p>
            <p><a className="text-accent-ink hover:underline" href={`mailto:${order.contactEmail}`}>{order.contactEmail}</a></p>
            <p><a className="text-accent-ink hover:underline" href={`tel:${order.contactPhone}`}>{order.contactPhone}</a></p>
            {order.companyName && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="font-medium">{order.companyName}</p>
                {order.gstin && <p className="font-mono text-xs">GSTIN {order.gstin}</p>}
                {order.poReference && <p className="text-xs">PO {order.poReference}</p>}
              </div>
            )}
            <div className="mt-3 border-t border-line pt-3 text-ink-muted">
              {order.addressLine1}
              {order.addressLine2 ? `, ${order.addressLine2}` : ""}, {order.city}, {order.state} {order.pincode}
            </div>
            {order.notes && <p className="mt-3 rounded bg-surface-muted p-2 text-xs">“{order.notes}”</p>}
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 font-semibold">Pricing (snapshot)</h2>
            <OrderTotals totals={totals} />
          </Card>

          <Card className="p-4 text-sm">
            <h2 className="mb-2 font-semibold">Payments</h2>
            {detail.payments.length === 0 && <p className="text-ink-muted">No payment attempts.</p>}
            <ul className="flex flex-col gap-2">
              {detail.payments.map((p) => (
                <li key={p.id} className="rounded bg-surface-muted p-2 text-xs">
                  <span className="font-semibold">{p.status}</span> · {formatInr(p.amountPaise)} · {p.provider}
                  <br />
                  <span className="font-mono">{p.providerPaymentId ?? p.providerOrderId}</span>
                  {p.failureReason && <span className="block text-danger">{p.failureReason}</span>}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4 text-sm">
            <h2 className="mb-2 font-semibold">History</h2>
            <ol className="flex flex-col gap-2" data-testid="status-history">
              {detail.history.map((h) => (
                <li key={h.id} className="border-l-2 border-line pl-3">
                  <p className="font-medium">{STATUS_LABEL[h.toStatus]}</p>
                  <p className="text-xs text-ink-muted">
                    {fmt(h.createdAt)} · {h.changedByName ?? "System"}
                  </p>
                  {h.note && <p className="text-xs">{h.note}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  );
}
