import { DemoPricingBanner, SiteFooter, SiteHeader } from "@/components/site-chrome";
import { requestDb } from "@/server/db/request-db";
import { hasDemoCatalogue } from "@/server/db/seed";
import { cartCount, currentCartTokenHash } from "@/server/services/cart";

export default async function ShopLayout({ children }: LayoutProps<"/">) {
  const db = await requestDb();
  const [demo, count] = await Promise.all([hasDemoCatalogue(db), cartCount(db, await currentCartTokenHash())]);
  return (
    <>
      {demo && <DemoPricingBanner />}
      <SiteHeader cartCount={count} />
      <div className="flex flex-1 flex-col">{children}</div>
      <SiteFooter />
    </>
  );
}
