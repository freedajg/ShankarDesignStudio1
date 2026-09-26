"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { countElements } from "@/domain/design/schema";
import { useStudioApi } from "./context";
import { clearLocalDraft, saveToServer } from "./persistence";

/** Explicit save (immutable version) and add-to-cart — both freeze the design server-side first. */
export function useStudioActions() {
  const api = useStudioApi();
  const router = useRouter();
  const [busy, setBusy] = useState<"save" | "cart" | null>(null);

  const freezeVersion = async () => {
    const s = api.getState();
    const id = await saveToServer(s);
    const { version } = await apiFetch<{ version: { versionId: string; version: number } }>(`/api/designs/${id}/versions`, {
      body: { doc: api.getState().doc, name: api.getState().name },
    });
    return { designId: id, ...version };
  };

  const save = async () => {
    if (countElements(api.getState().doc) === 0) return toast.error("Add some text or artwork first.");
    setBusy("save");
    try {
      const v = await freezeVersion();
      toast.success(`Design saved (version ${v.version})`, { description: "Reopen it any time from this device — the link in your address bar brings you back here." });
    } catch (e) {
      toast.error("Your design couldn't be saved.", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const addToCart = async () => {
    const s = api.getState();
    if (countElements(s.doc) === 0) return toast.error("Add some text or artwork first — an order needs a design to print.");
    setBusy("cart");
    try {
      const v = await freezeVersion();
      const st = api.getState();
      await apiFetch("/api/cart/items", {
        body: {
          designVersionId: v.versionId,
          channel: st.channel,
          printMethodCode: st.printMethodCode,
          sizes: Object.entries(st.quantities).map(([sizeId, quantity]) => ({ sizeId, quantity })),
        },
      });
      clearLocalDraft(st.product.slug);
      toast.success("Added to your cart");
      router.push("/cart");
    } catch (e) {
      toast.error("Couldn't add to cart.", { description: (e as Error).message });
      setBusy(null);
    }
  };

  return { save, addToCart, busy };
}
