import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { Logo } from "./brand";

export function SiteHeader({ cartCount = 0 }: { cartCount?: number }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-1 text-sm font-medium">
          <Link href="/#products" className="hidden rounded-[var(--radius-sm)] px-3 py-2 text-ink-muted hover:text-ink sm:block">
            Products
          </Link>
          <Link href="/bulk" className="hidden rounded-[var(--radius-sm)] px-3 py-2 text-ink-muted hover:text-ink sm:block">
            Bulk &amp; corporate
          </Link>
          <Link
            href="/cart"
            className="relative ml-1 inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-muted"
            aria-label={cartCount ? `Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}` : "Cart"}
          >
            <ShoppingBag className="size-5" aria-hidden />
            {cartCount > 0 && (
              <span className="absolute right-1 top-1 grid min-w-5 place-items-center rounded-full bg-ginger px-1 text-[0.7rem] font-semibold text-white">
                {cartCount}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-ink-muted sm:flex-row sm:justify-between">
        <div>
          <p className="font-medium text-ink">Sweet Ginger Fashions · Jaipur</p>
          <p className="mt-1">The T-Shirt Shop · Sweet Ginger Basics · Ginger Prints</p>
        </div>
        <nav aria-label="Footer" className="flex gap-4">
          <Link href="/#products" className="hover:text-ink">Products</Link>
          <Link href="/bulk" className="hover:text-ink">Bulk orders</Link>
          <Link href="/admin" className="hover:text-ink">Staff</Link>
        </nav>
      </div>
    </footer>
  );
}

export function DemoPricingBanner() {
  return (
    <div className="border-b border-info/20 bg-info-soft px-4 py-2 text-center text-xs text-info">
      <strong className="font-semibold">Demo catalogue.</strong> Prices, bulk tiers and print sizes are placeholders pending confirmation — not live prices.
    </div>
  );
}
