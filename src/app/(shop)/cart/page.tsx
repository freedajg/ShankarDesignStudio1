import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Pencil, ShoppingBag } from "lucide-react";
import { OrderTotals } from "@/components/order-totals";
import { buttonVariants } from "@/components/ui/button";
import { Alert, Badge, Card, EmptyState } from "@/components/ui/feedback";
import { formatInr } from "@/domain/money";
import { requestDb } from "@/server/db/request-db";
import { loadProductConfig } from "@/server/services/catalogue";
import { currentCartTokenHash, loadCart } from "@/server/services/cart";
import { getVersion } from "@/server/services/designs";
import { toDataUrl, versionPreview } from "@/server/render/design";
import { LineEditor } from "./line-editor";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };

export default async function CartPage() {
  const db = await requestDb();
  const { cart, lines, totals } = await loadCart(db, await currentCartTokenHash());

  if (!cart || lines.length === 0) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-16">
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          action={
            <Link href="/#products" className={buttonVariants({ variant: "accent" })}>
              Start designing
            </Link>
          }
        >
          Designs you add to the cart appear here with their sizes and price.
        </EmptyState>
      </main>
    );
  }

  const enriched = await Promise.all(
    lines.map(async (l) => {
      const version = await getVersion(db, l.designVersionId);
      const product = version ? await loadProductConfig(db, { id: version.productId }) : null;
      const sides = (["front", "back"] as const).filter((s) => version && version.doc.surfaces[s].elements.length > 0);
      const previews =
        product && version
          ? await Promise.all(
              sides.map(async (side) => ({
                side,
                src: toDataUrl(await versionPreview(db, { versionId: l.designVersionId, product, doc: version.doc, side, width: 360 })),
              })),
            )
          : [];
      return { ...l, previews, allSizes: product?.sizes ?? [] };
    }),
  );
  const blocked = lines.some((l) => l.problem);

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_22rem]">
      <section aria-labelledby="cart-heading">
        <div className="flex items-baseline justify-between">
          <h1 id="cart-heading" className="text-2xl font-semibold">
            Your cart
          </h1>
          <Badge tone={cart.channel === "B2B" ? "accent" : "neutral"}>{cart.channel === "B2B" ? "Bulk order" : "Single order"}</Badge>
        </div>
        <ul className="mt-6 flex flex-col gap-4">
          {enriched.map((l) => (
            <li key={l.id}>
              <Card className="flex flex-col gap-4 p-4 sm:flex-row" data-testid="cart-line">
                <div className="flex shrink-0 gap-2">
                  {l.previews.map((p) => (
                    <figure key={p.side} className="w-32 rounded-[var(--radius-sm)] bg-surface-muted p-1.5 sm:w-36">
                      {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered data URL of the exact ordered design */}
                      <img src={p.src} alt={`${l.productName} ${p.side} with your design`} className="w-full" />
                      <figcaption className="text-center text-xs capitalize text-ink-muted">{p.side}</figcaption>
                    </figure>
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">{l.productName}</h2>
                      <p className="text-sm text-ink-muted">
                        <span className="mr-1 inline-block size-3 rounded-full border border-black/15 align-middle" style={{ backgroundColor: l.colourHex }} />
                        {l.colourName} · {l.printMethodName} · printed {l.placements.join(" & ")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{formatInr(l.lineTotalPaise)}</p>
                      <p className="text-xs text-ink-muted">{l.quantity} {l.quantity === 1 ? "piece" : "pieces"}</p>
                    </div>
                  </div>
                  {l.tier && <Badge tone="success" className="mt-2">{l.tier.discountBps / 100}% volume discount</Badge>}
                  {l.problem && (
                    <Alert tone="warning" className="mt-3">
                      {l.problem}
                    </Alert>
                  )}
                  {l.priceChanged && !l.problem && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-warning-ink">
                      <AlertTriangle className="size-3.5" aria-hidden /> The price was updated since you added this item.
                    </p>
                  )}
                  <LineEditor itemId={l.id} sizes={l.sizes} allSizes={l.allSizes} />
                  <Link href={`/studio/${l.productSlug}?design=${l.designId}`} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline">
                    <Pencil className="size-3.5" aria-hidden /> Edit design
                  </Link>
                  <p className="mt-1 text-xs text-ink-muted">Edits create a new version — add it to the cart again and remove this one.</p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <aside aria-label="Order summary" className="lg:sticky lg:top-24 lg:self-start">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Summary</h2>
          {totals && <OrderTotals totals={totals} />}
          {blocked ? (
            <Alert tone="warning" className="mt-4">Fix the items marked above to continue.</Alert>
          ) : (
            <Link href="/checkout" className={buttonVariants({ variant: "accent", size: "lg", className: "mt-5 w-full" })}>
              Checkout
            </Link>
          )}
          <Link href="/#products" className="mt-3 block text-center text-sm font-medium text-ink-muted hover:text-ink">
            Continue designing
          </Link>
        </Card>
      </aside>
    </main>
  );
}
