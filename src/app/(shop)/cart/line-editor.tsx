"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/controls";
import { apiFetch } from "@/lib/api-client";

type Size = { sizeId: string; sizeCode: string; quantity: number };

export function LineEditor({ itemId, sizes, allSizes }: { itemId: string; sizes: Size[]; allSizes: { id: string; code: string }[] }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(sizes.map((s) => [s.sizeId, s.quantity])));
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = sizes.some((s) => qty[s.sizeId] !== s.quantity) || Object.entries(qty).some(([id, q]) => q > 0 && !sizes.some((s) => s.sizeId === id));
  const shown = allSizes.filter((s) => (qty[s.id] ?? 0) > 0 || sizes.some((x) => x.sizeId === s.id));

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/cart/items/${itemId}`, {
        method: "PATCH",
        body: { sizes: Object.entries(qty).map(([sizeId, quantity]) => ({ sizeId, quantity })) },
      });
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error("Couldn't update quantities.", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await apiFetch(`/api/cart/items/${itemId}`, { method: "DELETE" });
      toast.success("Removed from cart");
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error("Couldn't remove the item.", { description: (e as Error).message });
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3">
      <ul className="flex flex-wrap gap-2">
        {shown.map((s) => (
          <li key={s.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-line px-2 py-1">
            <span className="w-8 text-sm font-semibold">{s.code}</span>
            <Stepper size="sm" label={`${s.code} quantity`} value={qty[s.id] ?? 0} onChange={(n) => setQty({ ...qty, [s.id]: n })} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {dirty && (
          <Button size="sm" onClick={save} loading={saving || pending}>
            Update quantities
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft" onClick={remove}>
          <Trash2 aria-hidden /> Remove
        </Button>
      </div>
    </div>
  );
}
