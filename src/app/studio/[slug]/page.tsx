import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { StudioLoader } from "@/components/studio/studio-loader";
import { buttonVariants } from "@/components/ui/button";
import { requestDb } from "@/server/db/request-db";
import { currentOwner } from "@/server/owner";
import { loadProductConfig, loadSettings } from "@/server/services/catalogue";
import { getOwnedDesign } from "@/server/services/designs";
import { AppError } from "@/server/errors";
import type { StudioInit } from "@/components/studio/store";

export const metadata: Metadata = { title: "Design studio", robots: { index: false } };

export default async function StudioPage({ params, searchParams }: PageProps<"/studio/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const db = await requestDb();
  const [product, settings] = await Promise.all([loadProductConfig(db, { slug }), loadSettings(db)]);
  if (!product) notFound();

  const init: StudioInit = {
    product,
    settings,
    colourId: one(sp.colour),
    channel: one(sp.mode) === "bulk" ? "B2B" : "B2C",
  };

  const designId = one(sp.design);
  if (designId) {
    const owner = await currentOwner();
    let loaded: Awaited<ReturnType<typeof getOwnedDesign>> | null = null;
    if (owner && z.string().uuid().safeParse(designId).success) {
      loaded = await getOwnedDesign(db, owner, designId).catch((e) => {
        if (e instanceof AppError) return null;
        throw e;
      });
    }
    if (!loaded) return <DesignUnavailable slug={slug} />;
    if (loaded.doc.productId !== product.id) {
      const other = await loadProductConfig(db, { id: loaded.doc.productId });
      if (other) redirect(`/studio/${other.slug}?design=${designId}`);
      return <DesignUnavailable slug={slug} />;
    }
    init.doc = loaded.doc;
    init.designId = loaded.design.id;
    init.name = loaded.design.name;
    init.assets = Object.fromEntries(loaded.assets.map((a) => [a.id, a]));
  }

  return <StudioLoader init={init} recoverLocal />;
}

function DesignUnavailable({ slug }: { slug: string }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="max-w-md">
        <h1 className="text-xl font-semibold">This design isn&apos;t available here</h1>
        <p className="mt-2 text-ink-muted">
          Saved designs open on the device they were made on. If you placed an order, its design is safely attached to the order.
        </p>
        <Link href={`/studio/${slug}`} className={buttonVariants({ variant: "accent", className: "mt-6" })}>
          Start a new design
        </Link>
      </div>
    </main>
  );
}
