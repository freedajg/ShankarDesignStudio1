import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, ClipboardList, Receipt } from "lucide-react";
import { GarmentImage } from "@/components/garment-image";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/feedback";
import { taxNote } from "@/domain/colour";
import { formatInr } from "@/domain/money";
import { referencePriceTable } from "@/domain/price-table";
import { requestDb } from "@/server/db/request-db";
import { listProducts, loadProductConfig, loadSettings } from "@/server/services/catalogue";

export const metadata: Metadata = {
  title: "Bulk & corporate T-shirt printing",
  description:
    "Custom T-shirts and polos in bulk for companies, events, schools and teams. Upload your logo, set quantities per size, and see volume pricing instantly. GST invoices and PO references supported.",
};

export default async function BulkPage() {
  const db = await requestDb();
  const [summaries, settings] = await Promise.all([listProducts(db), loadSettings(db)]);
  const configs = (await Promise.all(summaries.map((s) => loadProductConfig(db, { id: s.id })))).filter((c) => c !== null);

  return (
    <main>
      <section className="mx-auto max-w-6xl px-4 py-10 md:py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-accent-ink">Sweet Ginger Basics</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold">Bulk custom apparel for your team, event or brand</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-muted">
          Design once, set quantities for every size, and see your per-piece price drop as the order grows. Your logo,
          placement and size breakdown go straight to production.
        </p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { icon: ClipboardList, t: "Size breakdown", d: "Enter S / M / L / XL counts in one place; the total updates as you type." },
            { icon: Receipt, t: "Business details", d: "Add your company name, GSTIN and PO reference at checkout." },
            { icon: Building2, t: "Volume pricing", d: "Tiered discounts apply automatically across all sizes of a design." },
          ].map(({ icon: Icon, t, d }) => (
            <li key={t} className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
              <Icon className="size-5 text-accent-ink" aria-hidden />
              <p className="mt-3 font-semibold">{t}</p>
              <p className="mt-1 text-sm text-ink-muted">{d}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="text-2xl font-semibold">Bulk prices</h2>
        <p className="mt-1 text-sm text-ink-muted">{taxNote(settings.tax)} Shipping calculated at checkout.</p>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {configs.map((p) => {
            const table = referencePriceTable(p, "B2B", settings);
            return (
              <Card key={p.id} className="flex flex-col overflow-hidden">
                <div className="flex items-center gap-4 border-b border-line p-4">
                  <div className="w-20 shrink-0 rounded-[var(--radius-sm)] bg-surface-muted p-1.5">
                    <GarmentImage mockup={p.mockups.front} hex={p.colours[2]?.hex ?? p.colours[0].hex} alt="" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{p.name}</h3>
                    <p className="text-sm text-ink-muted">
                      Min. {p.minQtyB2b} pcs · {table.method?.name}
                    </p>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <caption className="sr-only">{p.name} bulk price per piece</caption>
                  <tbody>
                    {table.rows.map((r) => (
                      <tr key={r.minQty} className="border-b border-line last:border-0">
                        <th scope="row" className="px-4 py-2 text-left font-normal tabular-nums text-ink-muted">
                          {r.label} pcs
                        </th>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">{formatInr(r.unitPaise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-auto p-4">
                  <Link href={`/studio/${p.slug}?mode=bulk`} className={buttonVariants({ variant: "primary", className: "w-full" })}>
                    Design in bulk <ArrowRight aria-hidden />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </main>
  );
}
