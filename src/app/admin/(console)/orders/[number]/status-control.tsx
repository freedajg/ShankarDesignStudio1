"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { NativeSelect, Textarea } from "@/components/ui/field";
import { STATUS_LABEL, type OrderStatus } from "@/domain/orders";
import { updateStatus, type StatusActionState } from "./actions";

export function StatusControl({ orderId, orderNumber, options, noteRequiredFor }: { orderId: string; orderNumber: string; options: OrderStatus[]; noteRequiredFor: OrderStatus[] }) {
  const [state, action, pending] = useActionState<StatusActionState, FormData>(updateStatus, {});
  const [to, setTo] = useState<OrderStatus | "">(options[0] ?? "");
  if (!options.length) return <p className="text-sm text-ink-muted">No further status changes available.</p>;
  const needsNote = to !== "" && noteRequiredFor.includes(to);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <label htmlFor="to" className="text-sm font-medium">
        Move order to
      </label>
      <NativeSelect id="to" name="to" value={to} onChange={(e) => setTo(e.target.value as OrderStatus)}>
        {options.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
            {noteRequiredFor.includes(s) ? " (note required)" : ""}
          </option>
        ))}
      </NativeSelect>
      <label htmlFor="note" className="text-sm font-medium">
        Note {needsNote ? <span className="text-danger">(required)</span> : <span className="font-normal text-ink-subtle">(optional)</span>}
      </label>
      <Textarea id="note" name="note" rows={2} maxLength={500} required={needsNote} placeholder={needsNote ? "Why is this changing?" : "Visible to staff in the history"} />
      <Button type="submit" loading={pending} variant={to === "CANCELLED" ? "danger" : "primary"}>
        Update status
      </Button>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="success">{state.ok}</Alert>}
    </form>
  );
}
