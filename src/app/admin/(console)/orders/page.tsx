import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, Package, Search } from "lucide-react";
import { PaymentBadge, StatusBadge } from "@/components/admin/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/feedback";
import { Input, NativeSelect } from "@/components/ui/field";
import { formatInr } from "@/domain/money";
import { ORDER_STATUSES, STATUS_LABEL } from "@/domain/orders";
import { requirePermissionPage } from "@/server/auth/session";
import { requestDb } from "@/server/db/request-db";
import { listOrders, orderListQuery, type OrderListQuery } from "@/server/services/admin";

export const metadata: Metadata = { title: "Orders" };

function listHref(q: OrderListQuery, patch: Partial<OrderListQuery>) {
  const next = { ...q, ...patch };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) {
    const isDefault = (k === "page" && v === 1) || (k === "sort" && v === "created") || (k === "dir" && v === "desc");
    if (v !== undefined && v !== "" && !isDefault) params.set(k, String(v));
  }
  const s = params.toString();
  return `/admin/orders${s ? `?${s}` : ""}`;
}

function SortHead({ q, col, label, className }: { q: OrderListQuery; col: OrderListQuery["sort"]; label: string; className?: string }) {
  const active = q.sort === col;
  const nextDir = active && q.dir === "desc" ? "asc" : "desc";
  return (
    <th scope="col" aria-sort={active ? (q.dir === "asc" ? "ascending" : "descending") : "none"} className={`px-3 py-2 font-medium ${className ?? ""}`}>
      <Link href={listHref(q, { sort: col, dir: nextDir, page: 1 })} className="inline-flex items-center gap-1 hover:text-ink">
        {label}
        {active && (q.dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
      </Link>
    </th>
  );
}

const fmtDate = (d: Date) => d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requirePermissionPage("orders:read", "/admin/orders");
  const raw = await searchParams;
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const q = orderListQuery.parse(flat);
  const { rows, total, pages } = await listOrders(await requestDb(), q);

  const href = (patch: Partial<OrderListQuery>) => listHref(q, patch);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <p className="text-sm text-ink-muted">{total} total</p>
      </div>

      <form className="flex flex-wrap items-end gap-3" role="search" aria-label="Filter orders">
        <div className="flex min-w-60 flex-1 flex-col gap-1">
          <label htmlFor="q" className="text-xs font-medium text-ink-muted">Search</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input id="q" name="q" defaultValue={q.q} placeholder="Order #, name, email, phone, company, PO" className="pl-9" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-xs font-medium text-ink-muted">Status</label>
          <NativeSelect id="status" name="status" defaultValue={q.status ?? ""} className="w-44">
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="channel" className="text-xs font-medium text-ink-muted">Type</label>
          <NativeSelect id="channel" name="channel" defaultValue={q.channel ?? ""} className="w-32">
            <option value="">All</option>
            <option value="B2C">Single</option>
            <option value="B2B">Bulk</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="payment" className="text-xs font-medium text-ink-muted">Payment</label>
          <NativeSelect id="payment" name="payment" defaultValue={q.payment ?? ""} className="w-32">
            <option value="">All</option>
            <option value="PAID">Paid</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
          </NativeSelect>
        </div>
        <Button type="submit" variant="primary">Filter</Button>
        {(q.q || q.status || q.channel || q.payment || q.attention) && (
          <Link href="/admin/orders" className={buttonVariants({ variant: "ghost" })}>Clear</Link>
        )}
      </form>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={Package} title="No orders match">Try a different search or clear the filters.</EmptyState>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="sticky top-0 bg-surface-muted text-left text-ink-muted">
              <tr>
                <SortHead q={q} col="number" label="Order" />
                <th scope="col" className="px-3 py-2 font-medium">Customer</th>
                <th scope="col" className="px-3 py-2 font-medium">Type</th>
                <th scope="col" className="px-3 py-2 font-medium">Product</th>
                <SortHead q={q} col="quantity" label="Qty" className="text-right" />
                <SortHead q={q} col="total" label="Amount" className="text-right" />
                <th scope="col" className="px-3 py-2 font-medium">Payment</th>
                <th scope="col" className="px-3 py-2 font-medium">Production</th>
                <SortHead q={q} col="created" label="Created" />
                <SortHead q={q} col="updated" label="Updated" />
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-line hover:bg-surface-muted/60">
                  <td className="px-3 py-2.5 font-medium">
                    <Link href={`/admin/orders/${o.orderNumber}`} className="inline-flex items-center gap-1 text-ink hover:text-accent-ink">
                      {o.orderNumber}
                      {o.needsAttention && <AlertTriangle className="size-3.5 text-warning" aria-label="Needs attention" />}
                    </Link>
                  </td>
                  <td className="max-w-48 px-3 py-2.5">
                    <p className="truncate">{o.companyName ?? o.contactName}</p>
                    {o.companyName && <p className="truncate text-xs text-ink-muted">{o.contactName}</p>}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={o.channel === "B2B" ? "accent" : "neutral"}>{o.channel === "B2B" ? "Bulk" : "Single"}</Badge>
                  </td>
                  <td className="max-w-56 truncate px-3 py-2.5 text-ink-muted">{o.productSummary}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{o.totalQuantity}</td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatInr(o.totalPaise)}</td>
                  <td className="px-3 py-2.5"><PaymentBadge status={o.paymentStatus} /></td>
                  <td className="px-3 py-2.5"><StatusBadge status={o.status} /></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{fmtDate(o.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{fmtDate(o.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">Page {q.page} of {pages}</span>
          <div className="flex gap-2">
            {q.page > 1 && <Link href={href({ page: q.page - 1 })} className={buttonVariants({ variant: "secondary", size: "sm" })}>Previous</Link>}
            {q.page < pages && <Link href={href({ page: q.page + 1 })} className={buttonVariants({ variant: "secondary", size: "sm" })}>Next</Link>}
          </div>
        </nav>
      )}
    </div>
  );
}
