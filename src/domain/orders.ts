import { can, type Role } from "./permissions";

/**
 * Order production workflow (docs/BUSINESS_RULES.md). Status changes happen only
 * through `checkTransition`, and every change is recorded with actor and time.
 */
export const ORDER_STATUSES = [
  "NEW",
  "PAYMENT_PENDING",
  "PAID",
  "DESIGN_REVIEW",
  "APPROVED",
  "IN_PRODUCTION",
  "PRINTED",
  "QUALITY_CHECK",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  NEW: "New",
  PAYMENT_PENDING: "Awaiting payment",
  PAID: "Paid",
  DESIGN_REVIEW: "Design review",
  APPROVED: "Approved",
  IN_PRODUCTION: "In production",
  PRINTED: "Printed",
  QUALITY_CHECK: "Quality check",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const STATUS_TONE: Record<OrderStatus, "neutral" | "info" | "success" | "warning" | "danger" | "accent"> = {
  NEW: "neutral",
  PAYMENT_PENDING: "warning",
  PAID: "info",
  DESIGN_REVIEW: "accent",
  APPROVED: "info",
  IN_PRODUCTION: "info",
  PRINTED: "info",
  QUALITY_CHECK: "info",
  SHIPPED: "success",
  DELIVERED: "success",
  CANCELLED: "danger",
};

/** Customer-facing wording. */
export const CUSTOMER_STATUS: Record<OrderStatus, string> = {
  NEW: "Order received",
  PAYMENT_PENDING: "Waiting for payment",
  PAID: "Paid — we're checking your design",
  DESIGN_REVIEW: "Paid — we're checking your design",
  APPROVED: "Design approved, queued for printing",
  IN_PRODUCTION: "Being printed",
  PRINTED: "Printed",
  QUALITY_CHECK: "Quality check",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** The main forward path of production. */
const FORWARD: [OrderStatus, OrderStatus][] = [
  ["PAID", "DESIGN_REVIEW"],
  ["PAID", "APPROVED"],
  ["DESIGN_REVIEW", "APPROVED"],
  ["APPROVED", "IN_PRODUCTION"],
  ["IN_PRODUCTION", "PRINTED"],
  ["PRINTED", "QUALITY_CHECK"],
  ["QUALITY_CHECK", "SHIPPED"],
  ["SHIPPED", "DELIVERED"],
];

/** Rework loops: allowed for admins, with a mandatory note. */
const BACKWARD: [OrderStatus, OrderStatus][] = [
  ["QUALITY_CHECK", "IN_PRODUCTION"],
  ["PRINTED", "IN_PRODUCTION"],
  ["APPROVED", "DESIGN_REVIEW"],
  ["IN_PRODUCTION", "APPROVED"],
];

/** Transitions only the system performs (checkout, payment verification). */
const SYSTEM: [OrderStatus, OrderStatus][] = [
  ["NEW", "PAYMENT_PENDING"],
  ["PAYMENT_PENDING", "PAID"],
];

/** Production staff handle the print floor stages only. */
const PRODUCTION_ALLOWED = new Set(["APPROVED>IN_PRODUCTION", "IN_PRODUCTION>PRINTED", "PRINTED>QUALITY_CHECK", "QUALITY_CHECK>SHIPPED"]);

const CANCELLABLE = new Set<OrderStatus>(["NEW", "PAYMENT_PENDING", "PAID", "DESIGN_REVIEW", "APPROVED", "IN_PRODUCTION", "PRINTED", "QUALITY_CHECK"]);

export type TransitionCheck = { ok: true; requiresNote: boolean } | { ok: false; reason: string };

export function checkTransition(from: OrderStatus, to: OrderStatus, actor: { roles: readonly Role[] } | "system"): TransitionCheck {
  if (from === to) return { ok: false, reason: "The order is already in that status." };
  const key = `${from}>${to}`;
  const is = (list: [OrderStatus, OrderStatus][]) => list.some(([a, b]) => a === from && b === to);

  if (actor === "system") {
    return is(SYSTEM) || is(FORWARD) ? { ok: true, requiresNote: false } : { ok: false, reason: "Not a system transition." };
  }
  if (is(SYSTEM)) return { ok: false, reason: "Payment status is set by payment verification, not manually." };
  if (to === "CANCELLED") {
    if (!can(actor.roles, "orders:cancel")) return { ok: false, reason: "Only admins can cancel orders." };
    return CANCELLABLE.has(from) ? { ok: true, requiresNote: true } : { ok: false, reason: "Shipped or delivered orders can't be cancelled." };
  }
  if (!can(actor.roles, "orders:update_status")) return { ok: false, reason: "You don't have permission to change order status." };
  const isAdmin = can(actor.roles, "orders:cancel"); // admins hold the full set
  if (is(FORWARD)) {
    if (!isAdmin && !PRODUCTION_ALLOWED.has(key)) return { ok: false, reason: "Production staff can move orders between print-floor stages only." };
    return { ok: true, requiresNote: false };
  }
  if (is(BACKWARD)) {
    if (!isAdmin) return { ok: false, reason: "Only admins can move an order back a stage." };
    return { ok: true, requiresNote: true };
  }
  return { ok: false, reason: `An order can't go from ${STATUS_LABEL[from]} to ${STATUS_LABEL[to]}.` };
}

/** Next statuses the actor may choose from (for the admin UI). */
export function allowedNext(from: OrderStatus, actor: { roles: readonly Role[] }) {
  return ORDER_STATUSES.filter((to) => checkTransition(from, to, actor).ok);
}

/** Orders that production can act on. */
export const PRODUCTION_READY: OrderStatus[] = ["APPROVED", "IN_PRODUCTION", "PRINTED", "QUALITY_CHECK"];
