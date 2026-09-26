"use client";

import { ChevronDown, ChevronUp, ImageIcon, Layers, Trash2, Type } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import { useStudio } from "./context";

/**
 * Accessible mirror of the canvas: every element can be selected, reordered and
 * deleted from here with the keyboard.
 */
export function LayersPanel({ onSelect }: { onSelect?: () => void }) {
  const side = useStudio((s) => s.side);
  const elements = useStudio((s) => s.doc.surfaces[s.side].elements);
  const selectedId = useStudio((s) => s.selectedId);
  const assets = useStudio((s) => s.assets);
  const select = useStudio((s) => s.select);
  const moveLayer = useStudio((s) => s.moveLayer);
  const remove = useStudio((s) => s.removeElement);

  if (!elements.length) {
    return (
      <EmptyState icon={Layers} title={`Nothing on the ${side} yet`}>
        Add text or upload artwork to start.
      </EmptyState>
    );
  }
  // top-most first, like design tools
  const ordered = [...elements].reverse();
  return (
    <ul aria-label={`Layers on the ${side}`} className="flex flex-col gap-1">
      {ordered.map((el, i) => {
        const active = el.id === selectedId;
        const label = el.type === "text" ? el.text.replace(/\n/g, " ") : assets[el.assetId]?.originalFilename ?? "Image";
        return (
          <li key={el.id} className={cn("flex items-center gap-1 rounded-[var(--radius-sm)] border", active ? "border-ginger bg-ginger-soft" : "border-transparent hover:bg-surface-muted")}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => {
                select(el.id);
                onSelect?.();
              }}
              className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm"
            >
              {el.type === "text" ? <Type className="size-4 shrink-0 text-ink-muted" aria-hidden /> : <ImageIcon className="size-4 shrink-0 text-ink-muted" aria-hidden />}
              <span className="truncate">{label}</span>
            </button>
            <button type="button" className="grid size-9 place-items-center rounded text-ink-muted hover:text-ink disabled:opacity-30" aria-label={`Bring ${label} forward`} disabled={i === 0} onClick={() => moveLayer(el.id, "up")}>
              <ChevronUp className="size-4" aria-hidden />
            </button>
            <button type="button" className="grid size-9 place-items-center rounded text-ink-muted hover:text-ink disabled:opacity-30" aria-label={`Send ${label} backward`} disabled={i === ordered.length - 1} onClick={() => moveLayer(el.id, "down")}>
              <ChevronDown className="size-4" aria-hidden />
            </button>
            <button type="button" className="grid size-9 place-items-center rounded text-ink-muted hover:text-danger" aria-label={`Delete ${label}`} onClick={() => remove(el.id)}>
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
