import Link from "next/link";
import { ArrowRight, Boxes, Palette, Truck } from "lucide-react";
import { GarmentImage } from "@/components/garment-image";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { formatInr } from "@/domain/money";
import { requestDb } from "@/server/db/request-db";
import { listProducts } from "@/server/services/catalogue";
import { cn } from "@/lib/cn";

export default async function Home() {
  const products = await listProducts(await requestDb());
  const hero = products[0];
  const bestBulk = Math.max(0, ...products.map((p) => p.bestB2bDiscountBps));

  return (
    <main>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-10 pt-10 md:grid-cols-[1.1fr_1fr] md:pt-16">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-accent-ink">Printed in Jaipur</p>
          <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">Custom T-shirts, designed by you.</h1>
          <p className="mt-4 max-w-xl text-lg text-ink-muted">
            Pick a shirt, add your text or logo, see exactly how it will look, and order one piece or a thousand. No
            back-and-forth on WhatsApp.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {hero && (
              <Link href={`/studio/${hero.slug}`} className={buttonVariants({ variant: "accent", size: "lg" })}>
                Start designing <ArrowRight aria-hidden />
              </Link>
            )}
            <Link href="/bulk" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Bulk &amp; corporate orders
            </Link>
          </div>
        </div>
        {hero?.mockup && (
          <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-4" aria-hidden>
            {hero.colours.slice(1, 5).map((c, i) => (
              <div key={c.id} className={cn("rounded-[var(--radius-lg)] bg-surface-muted p-3", i % 2 === 1 && "translate-y-6")}>
                <GarmentImage mockup={hero.mockup!} hex={c.hex} alt="" priority />
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="products" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12">
        <h2 className="text-2xl font-semibold">Choose your shirt</h2>
        <p className="mt-1 text-ink-muted">Every style comes in multiple colours and sizes. Prices include one print.</p>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p, i) => (
            <li key={p.id}>
              <Link
                href={`/products/${p.slug}`}
                className="group block rounded-[var(--radius-lg)] border border-line bg-surface p-4 transition-shadow hover:shadow-card"
              >
                <div className="rounded-[var(--radius-md)] bg-surface-muted p-4">
                  {p.mockup && (
                    <GarmentImage
                      mockup={p.mockup}
                      hex={(p.colours[(i * 2 + 1) % p.colours.length] ?? p.colours[0]).hex}
                      alt={`${p.name} in ${(p.colours[(i * 2 + 1) % p.colours.length] ?? p.colours[0]).name}`}
                    />
                  )}
                </div>
                <div className="mt-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold group-hover:text-accent-ink">{p.name}</h3>
                    <p className="text-sm text-ink-muted">
                      {p.categoryName} {p.gsm ? `· ${p.gsm} GSM` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-ink-muted">from</p>
                    <p className="font-semibold tabular-nums">{formatInr(p.basePriceB2cPaise, { whole: true })}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <ul className="flex -space-x-1" aria-label={`${p.colours.length} colours`}>
                    {p.colours.slice(0, 8).map((c) => (
                      <li key={c.id} className="size-5 rounded-full border-2 border-surface ring-1 ring-line" style={{ backgroundColor: c.hex }} title={c.name} />
                    ))}
                  </ul>
                  <Badge tone="accent">Bulk from {formatInr(p.basePriceB2bPaise, { whole: true })}</Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
          {[
            { icon: Palette, title: "Design it yourself", body: "Add text in curated fonts or upload your logo. Move, resize and rotate it on the front and back." },
            { icon: Boxes, title: "One piece or bulk", body: `Order a single tee, or set quantities per size for your team. Bulk pricing up to ${bestBulk / 100}% off, applied automatically.` },
            { icon: Truck, title: "Print-ready from the start", body: "Your exact design, placement and sizes go straight to our print floor — nothing lost in translation." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <div className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent-ink">
                <Icon className="size-5" aria-hidden />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-ink-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
