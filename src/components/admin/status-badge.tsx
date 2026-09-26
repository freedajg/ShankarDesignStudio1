import { Badge } from "@/components/ui/feedback";
import { STATUS_LABEL, STATUS_TONE, type OrderStatus } from "@/domain/orders";

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

const PAYMENT_TONE = { UNPAID: "neutral", PENDING: "warning", PAID: "success", FAILED: "danger", REFUNDED: "neutral" } as const;
const PAYMENT_LABEL = { UNPAID: "Unpaid", PENDING: "Pending", PAID: "Paid", FAILED: "Failed", REFUNDED: "Refunded" } as const;

export function PaymentBadge({ status }: { status: keyof typeof PAYMENT_TONE }) {
  return <Badge tone={PAYMENT_TONE[status]}>{PAYMENT_LABEL[status]}</Badge>;
}
