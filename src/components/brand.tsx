import Link from "next/link";
import { cn } from "@/lib/cn";

/** Wordmark: an original ginger-root inspired mark + name. */
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 rounded-sm", className)} aria-label="Sweet Ginger Design Studio — home">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="9" className="fill-navy" />
        <path
          d="M9 21.5c2.2 1.6 5.6 1.9 7.8.4 2.6-1.8 2.2-4.7-.6-5.5l-2.6-.7c-2.3-.7-2.4-3.1-.3-4.1 1.9-.9 4.4-.5 6 .9"
          fill="none"
          stroke="white"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <circle cx="22.6" cy="9.4" r="2.1" className="fill-accent" />
      </svg>
      <span className="flex flex-col gap-1 leading-none">
        <span className="text-[0.95rem] font-semibold tracking-tight">Sweet Ginger</span>
        <span className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-ink-muted">Design Studio</span>
      </span>
    </Link>
  );
}
