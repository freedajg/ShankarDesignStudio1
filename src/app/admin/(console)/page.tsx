import Link from "next/link";
import { AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge, Card } from "@/components/ui/feedback";
import { formatInr } from "@/domain/money";
import { requirePermissionPage } from "@/server/auth/session";
import { requestDb } from "@/server/db/request-db";
import { dashboardStats, listOrders, recentAttention } from "@/server/services/admin";
import { aiStaffStatus } from "@/server/services/ai-generation";

export default async function AdminDashboard() {
  const user = await requirePermissionPage("orders:read");
  const db = await requestDb();
  const [s, attention, recent, ai] = await Promise.all([
    dashboardStats(db),
    recentAttention(db),
    listOrders(db, { sort: "created", dir: "desc", page: 1 }),
    aiStaffStatus(db),
  ]);

  const tiles: { label: string; value: string | number; href: string; highlight?: boolean }[] = [
    { label: "Needs design review", value: s.review, href: "/admin/orders?status=DESIGN_REVIEW", highlight: s.review > 0 },
    { label: "Ready / in production", value: s.production, href: "/admin/orders?status=IN_PRODUCTION" },
    { label: "Printed / QC", value: s.printed, href: "/admin/orders?status=PRINTED" },
    { label: "Shipped / delivered", value: s.shipped, href: "/admin/orders?status=SHIPPED" },
    { label: "Awaiting payment", value: s.new, href: "/admin/orders?status=PAYMENT_PENDING" },
    { label: "Paid", value: s.paid, href: "/admin/orders?payment=PAID" },
    { label: "All orders", value: s.total, href: "/admin/orders" },
    { label: "Cancelled", value: s.cancelled, href: "/admin/orders?status=CANCELLED" },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-ink-muted">Signed in as {user.name}</p>
      </div>

      <section aria-label="Revenue and mix" className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-ink-muted">Paid revenue</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{formatInr(s.revenuePaise, { whole: true })}</p>
          <p className="mt-1 text-xs text-ink-muted">{s.piecesPaid.toLocaleString("en-IN")} pieces paid</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-ink-muted">Bulk (B2B) orders</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{s.b2b}</p>
          <Link href="/admin/orders?channel=B2B" className="mt-1 inline-block text-xs font-medium text-accent-ink hover:underline">View bulk orders</Link>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-ink-muted">Single (B2C) orders</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{s.b2c}</p>
          <Link href="/admin/orders?channel=B2C" className="mt-1 inline-block text-xs font-medium text-accent-ink hover:underline">View single orders</Link>
        </Card>
      </section>

      <section aria-label="Order pipeline">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((tile) => (
            <li key={tile.label}>
              <Link
                href={tile.href}
                className={`block rounded-[var(--radius-md)] border p-4 transition-colors hover:border-ink ${tile.highlight ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}
              >
                <p className="text-2xl font-semibold tabular-nums">{tile.value}</p>
                <p className="text-sm text-ink-muted">{tile.label}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {attention.length > 0 && (
        <section aria-labelledby="attention" className="rounded-[var(--radius-md)] border border-warning/30 bg-warning-soft p-4">
          <h2 id="attention" className="flex items-center gap-2 font-semibold text-warning-ink">
            <AlertTriangle className="size-4" aria-hidden /> Needs attention ({s.attention})
          </h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {attention.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.orderNumber}`} className="font-medium hover:underline">
                  {o.orderNumber}
                </Link>{" "}
                — {o.needsAttention}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="ai-status" data-testid="ai-status">
        <Card className="flex flex-col gap-2 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="size-4 text-accent" aria-hidden />
            <h2 id="ai-status" className="font-semibold">AI design generation</h2>
            {ai.enabled ? <Badge tone="success">On</Badge> : <Badge tone="neutral">Off</Badge>}
          </div>
          {ai.enabled ? (
            <p className="text-sm text-ink-muted">
              Using {ai.providers.map((p) => `${p.name === "openai" ? "OpenAI" : p.name === "gemini" ? "Google Gemini" : p.name} (${p.model})`).join(", then ")} · {ai.limit} designs per customer per day · last 7 days:{" "}
              {ai.week.SUCCEEDED ?? 0} succeeded, {ai.week.FAILED ?? 0} failed, {ai.week.REFUSED ?? 0} refused.
            </p>
          ) : (
            <p className="text-sm text-ink-muted">
              Customers see the button but can&apos;t generate yet. To switch it on, add <code className="rounded bg-surface-muted px-1">OPENAI_API_KEY</code> (or{" "}
              <code className="rounded bg-surface-muted px-1">GEMINI_API_KEY</code>) in Vercel → Settings → Environment Variables for this environment, then redeploy.
            </p>
          )}
          {ai.lastFailure && (!ai.lastSuccess || ai.lastFailure.at > ai.lastSuccess.at) && (
            <p className="text-sm text-warning-ink">
              Last attempt failed ({ai.lastFailure.at.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}): {ai.lastFailure.errorCode}
            </p>
          )}
        </Card>
      </section>

      <section aria-labelledby="recent">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent" className="font-semibold">Latest orders</h2>
          <Link href="/admin/orders" className="flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline">
            All orders <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <Card className="divide-y divide-line">
          {recent.rows.slice(0, 8).map((o) => (
            <Link key={o.id} href={`/admin/orders/${o.orderNumber}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted">
              <span className="font-medium">{o.orderNumber}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">
                {o.companyName ?? o.contactName} · {o.productSummary}
              </span>
              <StatusBadge status={o.status} />
              <span className="w-24 text-right text-sm font-medium tabular-nums">{formatInr(o.totalPaise)}</span>
            </Link>
          ))}
          {recent.rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-muted">No orders yet.</p>}
        </Card>
      </section>
    </div>
  );
}
