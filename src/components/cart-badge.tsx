"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Cart link with item count. Layouts persist across client navigations, so the
 * count re-syncs from the server whenever the route changes.
 */
export function CartBadge({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  const pathname = usePathname();
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/cart/count", { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count: number } | null) => d && setCount(d.count))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [pathname]);
  return (
    <Link
      href="/cart"
      className="relative ml-1 inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-muted"
      aria-label={count ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"}
    >
      <ShoppingBag className="size-5" aria-hidden />
      {count > 0 && (
        <span className="absolute right-1 top-1 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[0.7rem] font-semibold text-on-accent">{count}</span>
      )}
    </Link>
  );
}
