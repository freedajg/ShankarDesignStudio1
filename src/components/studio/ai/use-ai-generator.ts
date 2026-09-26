"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { AiOrientation, AiStyle } from "@/domain/ai/interpreter";
import type { ArtworkWarning } from "@/domain/artwork";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useStudioApi } from "../context";
import type { AssetInfo } from "../store";

export type AiImage = { id: string; asset: AssetInfo & { source?: string }; warnings: ArtworkWarning[]; selected: boolean };
export type AiGeneration = {
  id: string;
  parentGenerationId: string | null;
  prompt: string;
  refinement: string | null;
  style: string | null;
  orientation: string | null;
  lettering: boolean;
  textRequests: string[];
  createdAt: string;
  images: AiImage[];
};
export type AiStatus = { enabled: boolean; limit: number; used: number; remaining: number; variations: number };
export type AiStage = "interpreting" | "generating" | "processing";

export type AiRequest = {
  prompt: string;
  style: AiStyle | null;
  orientation: AiOrientation;
  lettering: boolean;
  refinement?: string | null;
  parentGenerationId?: string | null;
  referenceAssetId?: string | null;
};

type Phase =
  | { kind: "idle" }
  | { kind: "running"; stage: AiStage; request: AiRequest }
  | { kind: "error"; message: string; refused: boolean; request: AiRequest };

const GENERIC_ERROR = "Something went wrong while creating your artwork. Your design is safe. Please try again.";

/**
 * Client state for AI generation. Lives at the studio-shell level so closing the
 * dialog doesn't lose a running generation or the results.
 */
export function useAiGenerator() {
  const api = useStudioApi();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [history, setHistory] = useState<AiGeneration[]>([]);
  const [current, setCurrent] = useState<AiGeneration | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const openRef = useRef(false);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ status: AiStatus; generations: AiGeneration[] }>("/api/ai/generations");
      setStatus(data.status);
      setHistory(data.generations);
    } catch {
      setStatus((s) => s ?? { enabled: false, limit: 0, used: 0, remaining: 0, variations: 0 });
    }
  }, []);

  const ensureLoaded = useCallback(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void load();
  }, [load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const generate = useCallback(
    async (request: AiRequest) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const s = api.getState();
      setPhase({ kind: "running", stage: "interpreting", request });
      const body = {
        ...request,
        productId: s.product.id,
        colourId: s.doc.colourId,
        side: s.side,
        printAreaCode: s.doc.surfaces[s.side].printAreaCode,
        printMethodCode: s.printMethodCode,
      };
      const fail = (message: string, refused = false) => setPhase({ kind: "error", message, refused, request });
      try {
        const res = await fetch("/api/ai/generations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(200_000)]),
          credentials: "same-origin",
        });
        if (!res.ok || !res.body || !(res.headers.get("content-type") ?? "").includes("ndjson")) {
          const data = await res.json().catch(() => null);
          if (res.status === 429) void load();
          return fail(data?.error?.message ?? GENERIC_ERROR);
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            const event = JSON.parse(line) as
              | { type: "stage"; stage: AiStage }
              | { type: "done"; generation: AiGeneration; status: AiStatus }
              | { type: "error"; reason: string; message: string };
            if (event.type === "stage") setPhase({ kind: "running", stage: event.stage, request });
            else if (event.type === "done") {
              setCurrent(event.generation);
              setHistory((h) => [event.generation, ...h.filter((g) => g.id !== event.generation.id)].slice(0, 12));
              setStatus(event.status);
              setPhase({ kind: "idle" });
              if (!openRef.current) toast.success("Your AI designs are ready.", { description: "Open Generate with AI to choose one." });
              return;
            } else if (event.type === "error") {
              if (event.reason === "CANCELLED") return setPhase({ kind: "idle" });
              void load();
              return fail(event.message, event.reason === "REFUSED");
            }
          }
        }
        fail(GENERIC_ERROR);
      } catch (e) {
        if (ctrl.signal.aborted && (e as Error).name === "AbortError") return setPhase({ kind: "idle" });
        fail(e instanceof ApiError ? e.message : GENERIC_ERROR);
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
      }
    },
    [api, load],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setPhase({ kind: "idle" });
  }, []);

  /** Places a variation on the current side (plus requested words as editable text). Never removes anything. */
  const use = useCallback(
    (gen: AiGeneration, img: AiImage, withText: boolean) => {
      const s = api.getState();
      const id = withText && gen.textRequests.length ? s.addArtworkWithText(img.asset, gen.textRequests) : s.addImage(img.asset);
      if (!id) {
        s.registerAsset(img.asset);
        toast.error("That side is full. Remove something to add more.");
        return false;
      }
      const designId = api.getState().designId;
      void apiFetch(`/api/ai/generations/images/${img.id}/select`, { body: { designId } }).catch(() => undefined);
      const mark = (g: AiGeneration) => (g.id === gen.id ? { ...g, images: g.images.map((i) => (i.id === img.id ? { ...i, selected: true } : i)) } : g);
      setHistory((h) => h.map(mark));
      setCurrent((c) => (c ? mark(c) : c));
      return true;
    },
    [api],
  );

  return {
    status,
    history,
    current,
    setCurrent,
    phase,
    generate,
    cancel,
    use,
    ensureLoaded,
    reload: load,
    setOpen: (open: boolean) => {
      openRef.current = open;
    },
  };
}

export type AiGeneratorApi = ReturnType<typeof useAiGenerator>;
