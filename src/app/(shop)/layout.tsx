import { DemoPricingBanner, SiteFooter, SiteHeader } from "@/components/site-chrome";
import { requestDb } from "@/server/db/request-db";
import { env } from "@/server/env";
import { hasDemoCatalogue } from "@/server/db/seed";
import { cartCount, currentCartTokenHash } from "@/server/services/cart";

export default async function ShopLayout({ children }: LayoutProps<"/">) {
  const db = await requestDb();
  const [demo, count] = await Promise.all([hasDemoCatalogue(db), cartCount(db, await currentCartTokenHash())]);
  return (
    <>
      {(demo || env().DEMO_MODE) && <DemoPricingBanner demoMode={env().DEMO_MODE} />}
      <SiteHeader cartCount={count} />
      <div className="flex flex-1 flex-col">{children}</div>
      <SiteFooter />
    </>
  );
}
