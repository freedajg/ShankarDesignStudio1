"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";

/** Bottom sheet (mobile) — Radix dialog with focus trap, Esc to close, focus return. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  modal = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  modal?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <Dialog.Portal>
        {modal && <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim data-[state=open]:animate-fade-in" />}
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col rounded-t-[var(--radius-lg)] border-t border-line bg-surface shadow-float data-[state=open]:animate-sheet-up",
            className,
          )}
          onOpenAutoFocus={(e) => {
            // keep the canvas visible: don't jump focus into an input and pop the keyboard
            if (!modal) e.preventDefault();
          }}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden />
          <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-2">
            <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
            <Dialog.Close className="grid size-10 place-items-center rounded-full text-ink-muted hover:bg-surface-muted" aria-label="Close">
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          {description ? <Dialog.Description className="px-4 text-sm text-ink-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
          <div className="overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
