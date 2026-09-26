"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api-client";
import { countElements, designDocSchema, type DesignDoc } from "@/domain/design/schema";
import type { Channel } from "@/domain/catalogue";
import { useStudioApi } from "./context";
import type { AssetInfo, StudioStore } from "./store";

/**
 * "Never make the customer wonder whether their work was saved."
 *   1. every change → localStorage (instant, survives refresh / offline)
 *   2. 1.5 s after the last change → server draft (survives device loss via link)
 *   3. tab hidden → immediate flush; leaving with unsaved work → browser warning
 *   4. explicit Save / Add to cart → immutable server version (see actions)
 */

const LOCAL_KEY = (slug: string) => `sg:studio:v1:${slug}`;
const SERVER_DEBOUNCE_MS = 1500;
const LOCAL_DEBOUNCE_MS = 300;

export type LocalDraft = {
  designId: string | null;
  doc: DesignDoc;
  name: string;
  quantities: Record<string, number>;
  channel: Channel;
  printMethodCode: string;
  assets: Record<string, AssetInfo>;
  /** true when this draft has changes the server hasn't confirmed */
  unsynced: boolean;
  savedAt: number;
};

export function readLocalDraft(slug: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY(slug));
    if (!raw) return null;
    const d = JSON.parse(raw) as LocalDraft;
    return designDocSchema.safeParse(d.doc).success ? d : null;
  } catch {
    return null;
  }
}

export function clearLocalDraft(slug: string) {
  try {
    localStorage.removeItem(LOCAL_KEY(slug));
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

function writeLocalDraft(slug: string, s: StudioStore, unsynced: boolean) {
  try {
    const draft: LocalDraft = {
      designId: s.designId,
      doc: s.doc,
      name: s.name,
      quantities: s.quantities,
      channel: s.channel,
      printMethodCode: s.printMethodCode,
      assets: s.assets,
      unsynced,
      savedAt: Date.now(),
    };
    localStorage.setItem(LOCAL_KEY(slug), JSON.stringify(draft));
  } catch {
    /* private mode / quota — the server autosave still protects the design */
  }
}

/** Keeps the URL pointing at the saved design so refresh and sharing the link reopen it. */
function rememberInUrl(designId: string) {
  const url = new URL(window.location.href);
  if (url.searchParams.get("design") === designId) return;
  url.searchParams.set("design", designId);
  url.searchParams.delete("colour");
  window.history.replaceState(window.history.state, "", url);
}

export async function saveToServer(s: StudioStore, opts: { keepalive?: boolean } = {}): Promise<string> {
  const revision = s.revision;
  s.markSaving();
  const body = { doc: s.doc, name: s.name };
  try {
    let id = s.designId;
    if (!id) {
      const res = await apiFetch<{ design: { id: string } }>("/api/designs", { body, keepalive: opts.keepalive });
      id = res.design.id;
      s.setDesignId(id);
      rememberInUrl(id);
    } else {
      await apiFetch(`/api/designs/${id}`, { method: "PUT", body, keepalive: opts.keepalive });
    }
    s.markSaved(revision);
    return id;
  } catch (e) {
    s.markSaveError();
    throw e;
  }
}

export function usePersistence(slug: string) {
  const api = useStudioApi();
  const serverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(4000);

  useEffect(() => {
    const worthSaving = (s: StudioStore) => s.designId !== null || countElements(s.doc) > 0;

    const flushServer = async (keepalive = false) => {
      const s = api.getState();
      if (!worthSaving(s) || s.revision === s.savedRevision || s.saveState === "saving") return;
      try {
        await saveToServer(s, { keepalive });
        retryDelay.current = 4000;
        writeLocalDraft(slug, api.getState(), api.getState().revision !== api.getState().savedRevision);
      } catch (e) {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) {
          toast.error("Your latest changes couldn't be saved.", { description: e.message });
          return; // not retryable without a change
        }
        // network / server hiccup: retry with backoff while the design stays safe locally
        schedule(retryDelay.current);
        retryDelay.current = Math.min(retryDelay.current * 2, 60000);
      }
    };

    const schedule = (ms = SERVER_DEBOUNCE_MS) => {
      if (serverTimer.current) clearTimeout(serverTimer.current);
      serverTimer.current = setTimeout(() => void flushServer(), ms);
    };

    let prevRevision = api.getState().revision;
    let prevQty = api.getState().quantities;
    const unsub = api.subscribe((s) => {
      const changed = s.revision !== prevRevision;
      const orderChanged = s.quantities !== prevQty;
      prevRevision = s.revision;
      prevQty = s.quantities;
      if (!changed && !orderChanged) return;
      if (localTimer.current) clearTimeout(localTimer.current);
      localTimer.current = setTimeout(() => writeLocalDraft(slug, api.getState(), api.getState().revision !== api.getState().savedRevision), LOCAL_DEBOUNCE_MS);
      if (changed && worthSaving(s)) schedule();
    });

    const onHide = () => {
      if (document.visibilityState === "hidden") {
        writeLocalDraft(slug, api.getState(), api.getState().revision !== api.getState().savedRevision);
        void flushServer(true);
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = api.getState();
      if (worthSaving(s) && (s.revision !== s.savedRevision || s.saveState === "saving")) {
        writeLocalDraft(slug, s, true);
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (serverTimer.current) clearTimeout(serverTimer.current);
      if (localTimer.current) clearTimeout(localTimer.current);
    };
  }, [api, slug]);

  return {
    retry: () => {
      const s = api.getState();
      return saveToServer(s).then(
        () => toast.success("Saved"),
        (e: Error) => toast.error("Still couldn't save.", { description: e.message }),
      );
    },
  };
}
