"use client";

import { ImagePlus, Plus } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { ACCEPT_ATTR } from "@/domain/artwork";
import { cn } from "@/lib/cn";
import { useUpload } from "./add-panels";
import { AiButton } from "./ai/ai-generator";
import { useStudio } from "./context";

/**
 * Empty state for the current side: the three ways to start a design.
 * `compact` is the floating version over the canvas on small screens.
 */
export function DesignStart({ onAddText, onAi, compact = false, className }: { onAddText: () => void; onAi: () => void; compact?: boolean; className?: string }) {
  const side = useStudio((s) => s.side);
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, busy, error } = useUpload();
  return (
    <section
      aria-labelledby={compact ? "start-title-m" : "start-title"}
      className={cn("flex flex-col gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4", compact && "shadow-float", className)}
      data-testid={compact ? "design-start-mobile" : "design-start"}
    >
      <div>
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-muted">Design your T-shirt</p>
        <h2 id={compact ? "start-title-m" : "start-title"} className="mt-1 text-lg font-semibold">
          What would you like to create?
        </h2>
        {!compact && <p className="text-sm text-ink-muted">Start on the {side} with your own words, your artwork, or an idea.</p>}
      </div>
      <div className={cn("grid gap-2", compact ? "grid-cols-3" : "grid-cols-1")}>
        <Button variant="secondary" onClick={onAddText} className={cn(compact && "h-auto flex-col gap-1 px-1 py-2 text-xs")}>
          <Plus aria-hidden /> Add Text
        </Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={busy} className={cn(compact && "h-auto flex-col gap-1 px-1 py-2 text-xs")}>
          {!busy && <ImagePlus aria-hidden />} Upload Artwork
        </Button>
        <AiButton onClick={onAi} className={cn(compact && "h-auto flex-col gap-1 px-1 py-2 text-xs")}>
          Generate with AI
        </AiButton>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {!compact && <p className="text-center text-xs text-ink-muted">Or start with an AI-generated design.</p>}
    </section>
  );
}
