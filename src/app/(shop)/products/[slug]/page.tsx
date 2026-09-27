import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, Users } from "lucide-react";
import { GarmentImage } from "@/components/garment-image";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/feedback";
import { isLightColour, taxNote } from "@/domain/colour";
import { formatInr } from "@/domain/money";
import { referencePriceTable } from "@/domain/price-table";
import { getDb } from "@/server/db/client";
import { requestDb } from "@/server/db/request-db";
import { loadProductConfig, loadSettings } from "@/server/services/catalogue";
import { cn } from "@/lib/cn";

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = await loadProductConfig(await getDb(), { slug });
  if (!p) return {};
  return {
    title: `Custom ${p.name} — design & print online`,
    description: `Design your own ${p.name.toLowerCase()} with text or a logo. ${p.colours.length} colours, sizes ${p.sizes[0]?.code}–${p.sizes.at(-1)?.code}. Single pieces or bulk orders with volume pricing.`,
  };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const { colour: colourParam } = await searchParams;
  const db = await requestDb();
  const [p, settings] = await Promise.all([loadProductConfig(db, { slug }), loadSettings(db)]);
  if (!p) notFound();

  const colour = p.colours.find((c) => c.id === colourParam) ?? p.colours[0];
  const b2c = referencePriceTable(p, "B2C", settings);
  const b2b = referencePriceTable(p, "B2B", settings);
  const single = b2c.rows[0];

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-8 md:grid-cols-2 md:py-12">
      <div className="md:sticky md:top-24 md:self-start">
        <div className="rounded-[var(--radius-lg)] bg-garment-bg p-6 sm:p-10">
          <GarmentImage mockup={p.mockups.front} hex={colour.hex} alt={`${p.name} in ${colour.name}, front`} priority />
        </div>
      </div>

      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
          <Link href="/#products" className="hover:text-ink">Products</Link> / <span>{p.categoryName}</span>
        </nav>
        <h1 className="mt-2 text-3xl font-semibold">{p.name}</h1>
        <p className="mt-2 text-ink-muted">{p.description}</p>
        {single && (
          <p className="mt-4 text-2xl font-semibold tabular-nums">
            {formatInr(single.unitPaise)}
            <span className="ml-2 text-sm font-normal text-ink-muted">per piece, with one {b2c.method?.name} ({b2c.area?.name.toLowerCase()})</span>
          </p>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
          {p.fabric && (
            <div>
              <dt className="text-ink-muted">Fabric</dt>
              <dd className="font-medium">{p.fabric}</dd>
            </div>
          )}
          {p.gsm && (
            <div>
              <dt className="text-ink-muted">Weight</dt>
              <dd className="font-medium">{p.gsm} GSM</dd>
            </div>
          )}
          <div>
            <dt className="text-ink-muted">Sizes</dt>
            <dd className="font-medium">{p.sizes.map((s) => s.code).join(" · ")}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Print methods</dt>
            <dd className="font-medium">{p.printMethods.map((m) => m.name).join(", ")}</dd>
          </div>
        </dl>

        <fieldset className="mt-6">
          <legend className="text-sm font-medium">
            Colour: <span className="font-normal text-ink-muted">{colour.name}</span>
          </legend>
          <ul className="mt-3 flex flex-wrap gap-2">
            {p.colours.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/products/${p.slug}?colour=${c.id}`}
                  scroll={false}
                  aria-label={c.name}
                  aria-current={c.id === colour.id ? "true" : undefined}
                  title={c.name}
                  className={cn(
                    "grid size-10 place-items-center rounded-full border border-swatch-edge",
                    c.id === colour.id && "ring-2 ring-accent ring-offset-2 ring-offset-canvas",
                  )}
                  style={{ backgroundColor: c.hex }}
                >
                  {c.id === colour.id && <Check className={cn("size-4", isLightColour(c.hex) ? "text-on-light" : "text-on-dark")} aria-hidden />}
                </Link>
              </li>
            ))}
          </ul>
        </fieldset>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`/studio/${p.slug}?colour=${colour.id}`} className={buttonVariants({ variant: "accent", size: "lg" })}>
            Design this shirt <ArrowRight aria-hidden />
          </Link>
          <Link href={`/studio/${p.slug}?colour=${colour.id}&mode=bulk`} className={buttonVariants({ variant: "secondary", size: "lg" })}>
            <Users aria-hidden /> Start a bulk order
          </Link>
        </div>

        {b2b.rows.length > 0 && (
          <Card className="mt-10 overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <h2 className="font-semibold">Bulk pricing</h2>
              <p className="text-sm text-ink-muted">
                Per piece with one {b2b.method?.name} ({b2b.area?.name.toLowerCase()}). Mix sizes freely — the total quantity
                sets the price. Minimum {p.minQtyB2b} pieces.
              </p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Quantity</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Per piece</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Saving</th>
                </tr>
              </thead>
              <tbody>
                {b2b.rows.map((r) => (
                  <tr key={r.minQty} className="border-t border-line">
                    <td className="px-4 py-2.5 tabular-nums">{r.label}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatInr(r.unitPaise)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-success">{r.discountBps ? `${r.discountBps / 100}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <p className="mt-3 text-xs text-ink-muted">
          {taxNote(settings.tax)} Shipping calculated at checkout. Larger sizes may cost more.
        </p>
      </div>
    </main>
  );
}
