"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { apiFetch } from "@/lib/api-client";
import { launchPayment, type ClientPayment } from "@/lib/payment-client";

export function RetryPayment({ orderNumber, token, label }: { orderNumber: string; token: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const { payment } = await apiFetch<{ payment: ClientPayment }>(`/api/orders/${orderNumber}/pay`, { body: { token } });
      await launchPayment({ payment, orderNumber, accessToken: token, navigate: router.push });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Button variant="accent" size="lg" onClick={pay} loading={busy}>
        {label}
      </Button>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
