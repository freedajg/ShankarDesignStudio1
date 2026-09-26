"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { INDIAN_STATES, type CheckoutInput } from "@/domain/checkout";
import { formatInr } from "@/domain/money";
import { apiFetch, ApiError } from "@/lib/api-client";
import { launchPayment, type ClientPayment } from "@/lib/payment-client";

type Result = { orderNumber: string; accessToken: string; totalPaise: number; payment: ClientPayment | null; paymentError: string | null };
type FieldName = keyof CheckoutInput;

export function CheckoutForm({ channel, totalPaise, devPayments }: { channel: "B2C" | "B2B"; totalPaise: number; devPayments: boolean }) {
  // one key per checkout attempt: resubmits can't create a second order
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const form = { ...data, idempotencyKey };
    setBusy(true);
    try {
      const res = await apiFetch<Result>("/api/checkout", { body: { form } });
      if (!res.payment) {
        router.push(`/orders/${res.orderNumber}?t=${encodeURIComponent(res.accessToken)}`);
        return;
      }
      await launchPayment({ payment: res.payment, orderNumber: res.orderNumber, accessToken: res.accessToken, prefill: { name: data.name, email: data.email, contact: data.phone }, navigate: router.push });
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError) {
        const fields = (err.details as { fields?: { path: string; message: string }[] } | undefined)?.fields;
        if (fields?.length) {
          setErrors(Object.fromEntries(fields.map((f) => [f.path, f.message])));
          setFormError("Please check the highlighted fields.");
          document.querySelector<HTMLElement>(`[name="${fields[0].path}"]`)?.focus();
          return;
        }
        setFormError(err.message);
        return;
      }
      setFormError("Something went wrong. Your cart is unchanged — please try again.");
    }
  };

  const f = (name: FieldName) => ({ name, error: errors[name] });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8">
      {formError && <Alert tone="danger">{formError}</Alert>}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-lg font-semibold">Contact</legend>
        <Field label="Full name" error={f("name").error}>
          {(p) => <Input {...p} name="name" autoComplete="name" required />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" error={f("email").error} hint="Your order confirmation and tracking link go here.">
            {(p) => <Input {...p} name="email" type="email" autoComplete="email" required />}
          </Field>
          <Field label="Mobile number" error={f("phone").error}>
            {(p) => <Input {...p} name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="98XXXXXXXX" required />}
          </Field>
        </div>
      </fieldset>

      {channel === "B2B" && (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-lg font-semibold">Business details</legend>
          <Field label="Company name" error={f("companyName").error}>
            {(p) => <Input {...p} name="companyName" autoComplete="organization" required />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="GSTIN" optional error={f("gstin").error} hint="For a GST invoice.">
              {(p) => <Input {...p} name="gstin" maxLength={15} className="uppercase" autoComplete="off" />}
            </Field>
            <Field label="PO / reference" optional error={f("poReference").error}>
              {(p) => <Input {...p} name="poReference" maxLength={80} autoComplete="off" />}
            </Field>
          </div>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-lg font-semibold">Delivery address</legend>
        <Field label="Address" error={f("addressLine1").error}>
          {(p) => <Input {...p} name="addressLine1" autoComplete="address-line1" required />}
        </Field>
        <Field label="Apartment, landmark" optional error={f("addressLine2").error}>
          {(p) => <Input {...p} name="addressLine2" autoComplete="address-line2" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="City" error={f("city").error}>
            {(p) => <Input {...p} name="city" autoComplete="address-level2" required />}
          </Field>
          <Field label="State" error={f("state").error}>
            {(p) => (
              <NativeSelect {...p} name="state" autoComplete="address-level1" defaultValue="" required>
                <option value="" disabled>
                  Choose…
                </option>
                {INDIAN_STATES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label="PIN code" error={f("pincode").error}>
            {(p) => <Input {...p} name="pincode" inputMode="numeric" maxLength={6} autoComplete="postal-code" required />}
          </Field>
        </div>
        <Field label="Notes for our team" optional error={f("notes").error}>
          {(p) => <Textarea {...p} name="notes" maxLength={1000} rows={3} placeholder="Delivery date, special instructions…" />}
        </Field>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="accent" size="lg" loading={busy} className="w-full">
          <Lock aria-hidden /> Place order &amp; pay {formatInr(totalPaise)}
        </Button>
        <p className="text-center text-xs text-ink-muted">
          {devPayments ? "Development mode: payment is simulated — no money moves." : "Secure payment by Razorpay: UPI, cards and netbanking."}
        </p>
      </div>
    </form>
  );
}
