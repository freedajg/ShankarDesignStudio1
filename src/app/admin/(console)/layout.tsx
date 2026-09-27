import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboard, LogOut, Package } from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { requirePermissionPage } from "@/server/auth/session";
import { logout } from "../login/actions";
import { Badge } from "@/components/ui/feedback";
import { env } from "@/server/env";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false } };

const nav = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: Package },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePermissionPage("admin:access");
  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:flex-col lg:border-b-0 lg:border-r">
        {/* phones/tablets: one row; desktop sidebar: logo above the controls */}
        <div className="flex items-center justify-between gap-4 px-4 py-3 lg:flex-col lg:items-start lg:gap-3 lg:py-5">
          <Logo href="/admin" />
          <div className="flex items-center gap-1 lg:w-full lg:justify-between">
            {env().DEMO_MODE && <Badge tone="info">Demo</Badge>}
            <ThemeToggle />
            {/* phones and tablets: the sidebar footer is hidden, so sign-out lives here */}
            <form action={logout} className="lg:hidden">
              <Button variant="ghost" size="icon" type="submit" aria-label="Sign out" title="Sign out">
                <LogOut aria-hidden />
              </Button>
            </form>
          </div>
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-1 lg:flex-col lg:pb-0">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-muted hover:text-ink"
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="hidden border-t border-line p-4 lg:block">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-ink-muted">{user.roles.join(", ").toLowerCase()}</p>
          <form action={logout} className="mt-3">
            <Button variant="secondary" size="sm" className="w-full" type="submit">
              <LogOut aria-hidden /> Sign out
            </Button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
