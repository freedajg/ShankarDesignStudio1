"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CloudOff,
  ImagePlus,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  Redo2,
  Save,
  Shirt,
  ShoppingBag,
  Type,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { formatInr } from "@/domain/money";
import type { Side } from "@/domain/design/schema";
import { cn } from "@/lib/cn";
import { useStudioActions } from "./actions";
import { AddTextPanel, UploadPanel } from "./add-panels";
import { StudioProvider, useStudio, useStudioApi } from "./context";
import { Inspector } from "./inspector";
import { LayersPanel } from "./layers-panel";
import { OrderModeToggle, OrderPanel, PriceSummary } from "./order-panel";
import { readLocalDraft, usePersistence } from "./persistence";
import { ProductOptions } from "./product-options";
import { selectedElement, type StudioInit } from "./store";
import { useLinePrice } from "./use-price";

const Stage = dynamic(() => import("./stage").then((m) => m.Stage), { ssr: false });

export function Studio(props: { init: StudioInit; recoverLocal: boolean }) {
  // Restore unsynced local work (refresh, crash, offline) before the store is created.
  const [init] = useState<StudioInit>(() => {
    if (typeof window === "undefined" || !props.recoverLocal) return props.init;
    const local = readLocalDraft(props.init.product.slug);
    const sameDesign = local && (local.designId ?? null) === (props.init.designId ?? null);
    if (!local || !sameDesign || !local.unsynced || local.doc.productId !== props.init.product.id) return props.init;
    return {
      ...props.init,
      doc: local.doc,
      name: local.name,
      quantities: local.quantities,
      channel: local.channel,
      printMethodCode: local.printMethodCode,
      assets: { ...local.assets, ...props.init.assets },
    };
  });
  const recovered = init !== props.init;
  useEffect(() => {
    if (recovered) toast.info("We restored your unsaved changes.");
  }, [recovered]);

  return (
    <StudioProvider init={init}>
      <StudioShell />
    </StudioProvider>
  );
}

// ------------------------------------------------------------------ shell

type MobileTab = "product" | "text" | "upload" | "layers" | "order" | null;

function StudioShell() {
  const api = useStudioApi();
  const slug = useStudio((s) => s.product.slug);
  const { retry } = usePersistence(slug);
  const actions = useStudioActions();
  const selected = useStudio(selectedElement);
  const [tab, setTab] = useState<MobileTab>(null);
  const [rightTab, setRightTab] = useState<"design" | "order">("design");
  const textRef = useRef<HTMLTextAreaElement>(null);

  useKeyboardShortcuts();

  // desktop: jump to the inspector when something new is selected
  const [lastSelected, setLastSelected] = useState<string | null>(null);
  if ((selected?.id ?? null) !== lastSelected) {
    setLastSelected(selected?.id ?? null);
    if (selected && rightTab !== "design") setRightTab("design");
  }

  const editText = () => {
    setRightTab("design");
    setTimeout(() => textRef.current?.focus(), 50);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <TopBar onRetry={retry} onSave={actions.save} saving={actions.busy === "save"} />

      <div className="flex min-h-0 flex-1">
        {/* left rail (desktop) */}
        <aside aria-label="Product options" className="hidden w-72 shrink-0 overflow-y-auto border-r border-line bg-surface p-5 lg:block">
          <ProductOptions />
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold">Layers</h2>
            <LayersPanel />
          </div>
        </aside>

        {/* stage */}
        <main className="relative flex min-w-0 flex-1 flex-col" aria-label="Design canvas">
          <StageToolbar />
          <Stage className="relative min-h-0 flex-1 touch-none select-none bg-surface-muted" onEditText={editText} />
          <StageHint />
        </main>

        {/* right rail (desktop) */}
        <aside aria-label="Design tools" className="hidden w-[22rem] shrink-0 flex-col border-l border-line bg-surface lg:flex">
          <div className="border-b border-line p-3">
            <Segmented
              label="Panel"
              value={rightTab}
              onChange={setRightTab}
              className="w-full"
              options={[
                { value: "design", label: "Design" },
                { value: "order", label: "Sizes & price" },
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {rightTab === "design" ? (
              <div className="flex flex-col gap-6">
                <AddTextPanel />
                <UploadPanel />
                <div className="border-t border-line pt-5">
                  {selected ? (
                    <Inspector textAreaRef={textRef} />
                  ) : (
                    <p className="text-sm text-ink-muted">Select something on the shirt — or in Layers — to edit it.</p>
                  )}
                </div>
              </div>
            ) : (
              <OrderPanel />
            )}
          </div>
        </aside>
      </div>

      <OrderBar onAddToCart={actions.addToCart} busy={actions.busy === "cart"} onEditSizes={() => (window.matchMedia("(min-width: 1024px)").matches ? setRightTab("order") : setTab("order"))} />
      <MobileTabBar tab={tab} setTab={setTab} />

      {/* mobile sheets */}
      <Sheet open={tab === "product"} onOpenChange={(o) => setTab(o ? "product" : null)} title="Shirt">
        <ProductOptions />
      </Sheet>
      <Sheet open={tab === "text"} onOpenChange={(o) => setTab(o ? "text" : null)} title="Add text">
        <AddTextPanel onAdded={() => setTab(null)} />
      </Sheet>
      <Sheet open={tab === "upload"} onOpenChange={(o) => setTab(o ? "upload" : null)} title="Upload artwork">
        <UploadPanel onAdded={() => setTab(null)} />
      </Sheet>
      <Sheet open={tab === "layers"} onOpenChange={(o) => setTab(o ? "layers" : null)} title="Layers">
        <LayersPanel onSelect={() => setTab(null)} />
      </Sheet>
      <Sheet open={tab === "order"} onOpenChange={(o) => setTab(o ? "order" : null)} title="Sizes & price">
        <OrderPanel />
      </Sheet>
      <MobileInspector hidden={tab !== null} onDone={() => api.getState().select(null)} />
    </div>
  );
}

// ------------------------------------------------------------------ bars

function TopBar({ onRetry, onSave, saving }: { onRetry: () => void; onSave: () => void; saving: boolean }) {
  const name = useStudio((s) => s.name);
  const setName = useStudio((s) => s.setName);
  const product = useStudio((s) => s.product);
  const canUndo = useStudio((s) => s.past.length > 0);
  const canRedo = useStudio((s) => s.future.length > 0);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-2 sm:px-4">
      <Link href={`/products/${product.slug}`} className="grid size-10 place-items-center rounded-full hover:bg-surface-muted" aria-label="Back to product">
        <ArrowLeft className="size-5" aria-hidden />
      </Link>
      <div className="min-w-0 flex-1">
        <label htmlFor="design-name" className="sr-only">
          Design name
        </label>
        <input
          id="design-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full max-w-64 truncate rounded-[var(--radius-sm)] bg-transparent px-2 py-1 font-semibold outline-none hover:bg-surface-muted focus-visible:bg-surface-muted"
        />
        <p className="truncate px-2 text-xs text-ink-muted">{product.name}</p>
      </div>
      <SaveIndicator onRetry={onRetry} />
      <div className="flex items-center">
        <Button variant="ghost" size="icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <Undo2 aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
          <Redo2 aria-hidden />
        </Button>
      </div>
      <Button variant="secondary" size="sm" className="hidden sm:inline-flex" onClick={onSave} loading={saving}>
        <Save aria-hidden /> Save
      </Button>
    </header>
  );
}

function SaveIndicator({ onRetry }: { onRetry: () => void }) {
  const state = useStudio((s) => s.saveState);
  const content: Record<typeof state, ReactNode> = {
    idle: null,
    pending: <span className="text-ink-muted">Unsaved changes</span>,
    saving: (
      <span className="flex items-center gap-1 text-ink-muted">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
      </span>
    ),
    saved: (
      <span className="flex items-center gap-1 text-success">
        <Check className="size-3.5" aria-hidden /> Saved
      </span>
    ),
    error: (
      <button type="button" onClick={onRetry} className="flex items-center gap-1 font-medium text-danger hover:underline">
        <CloudOff className="size-3.5" aria-hidden /> Not saved — Retry
      </button>
    ),
  };
  return (
    <div role="status" aria-live="polite" className="hidden text-xs sm:block" data-testid="save-state" data-state={state}>
      {content[state]}
    </div>
  );
}

function StageToolbar() {
  const side = useStudio((s) => s.side);
  const setSide = useStudio((s) => s.setSide);
  const counts = useStudio((s) => [s.doc.surfaces.front.elements.length, s.doc.surfaces.back.elements.length].join(","));
  const [front, back] = counts.split(",").map(Number);
  const zoom = useStudio((s) => s.zoom);
  const setZoom = useStudio((s) => s.setZoom);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex items-center justify-center gap-2 px-3">
      <Segmented<Side>
        label="Shirt side"
        value={side}
        onChange={setSide}
        className="pointer-events-auto shadow-card"
        options={[
          { value: "front", label: <>Front {front > 0 && <CountDot n={front} />}</> },
          { value: "back", label: <>Back {back > 0 && <CountDot n={back} />}</> },
        ]}
      />
      <Button
        variant="secondary"
        size="icon"
        className="pointer-events-auto absolute right-3 shadow-card"
        aria-label={zoom === "area" ? "Show whole shirt" : "Zoom to print area"}
        aria-pressed={zoom === "area"}
        onClick={() => setZoom(zoom === "area" ? "garment" : "area")}
      >
        {zoom === "area" ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
      </Button>
    </div>
  );
}

const CountDot = ({ n }: { n: number }) => (
  <span className="grid min-w-5 place-items-center rounded-full bg-ginger px-1 text-[0.7rem] font-semibold text-white" aria-label={`${n} items`}>
    {n}
  </span>
);

function StageHint() {
  const side = useStudio((s) => s.side);
  const empty = useStudio((s) => s.doc.surfaces[s.side].elements.length === 0);
  if (!empty) return null;
  return (
    <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-sm text-ink-muted">
      Add text or upload artwork to design the {side}.
    </p>
  );
}

function OrderBar({ onAddToCart, busy, onEditSizes }: { onAddToCart: () => void; busy: boolean; onEditSizes: () => void }) {
  const { result, line, estimate } = useLinePrice();
  const hasDesign = useStudio((s) => s.doc.surfaces.front.elements.length + s.doc.surfaces.back.elements.length > 0);
  const channel = useStudio((s) => s.channel);
  const quantity = line?.quantity ?? 0;
  const ready = result.ok && hasDesign;
  const reason = !hasDesign ? "Add your design first" : !result.ok ? result.issues[0]?.message : null;

  return (
    <div className="shrink-0 border-t border-line bg-surface px-3 py-2.5 sm:px-4 lg:py-3">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-3">
        <div className="hidden lg:block">
          <OrderModeToggle />
        </div>
        <button type="button" onClick={onEditSizes} className="min-w-0 flex-1 text-left" aria-label="Edit sizes and quantities">
          <p className="truncate text-sm font-medium">
            {quantity > 0 ? `${quantity} ${quantity === 1 ? "piece" : "pieces"}` : "Choose sizes"} · {channel === "B2B" ? "Bulk" : "Single"}
            <span className="ml-1.5 text-ginger">Edit</span>
          </p>
          <p className="truncate text-xs text-ink-muted">{reason ?? (estimate ? "Estimate" : "Tax & shipping at checkout")}</p>
        </button>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums leading-tight" data-testid="order-total">
            {line && quantity > 0 ? formatInr(line.lineTotalPaise) : "—"}
          </p>
          {line && quantity > 1 && <p className="text-xs tabular-nums text-ink-muted">{formatInr(line.averageUnitPaise)} each</p>}
        </div>
        <Button variant="accent" size="lg" className="px-4 sm:px-6" onClick={onAddToCart} loading={busy} disabled={!ready} title={reason ?? undefined}>
          <ShoppingBag aria-hidden /> <span className="hidden sm:inline">Add to cart</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>
      <div className="sr-only" aria-live="polite">
        <PriceSummary compact />
      </div>
    </div>
  );
}

function MobileTabBar({ tab, setTab }: { tab: MobileTab; setTab: (t: MobileTab) => void }) {
  const items: { id: Exclude<MobileTab, null>; label: string; icon: typeof Shirt }[] = [
    { id: "product", label: "Shirt", icon: Shirt },
    { id: "text", label: "Text", icon: Type },
    { id: "upload", label: "Upload", icon: ImagePlus },
    { id: "layers", label: "Layers", icon: Layers },
    { id: "order", label: "Sizes", icon: ShoppingBag },
  ];
  return (
    <nav aria-label="Studio tools" className="grid shrink-0 grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={tab === id}
          onClick={() => setTab(tab === id ? null : id)}
          className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium", tab === id ? "text-ginger" : "text-ink-muted")}
        >
          <Icon className="size-5" aria-hidden />
          {label}
        </button>
      ))}
    </nav>
  );
}

/** Mobile: a compact, non-blocking inspector while something is selected. */
function MobileInspector({ hidden, onDone }: { hidden: boolean; onDone: () => void }) {
  const selected = useStudio(selectedElement);
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setIsDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  if (isDesktop || !selected || hidden) return null;
  return (
    <Sheet open onOpenChange={(o) => !o && onDone()} title={selected.type === "text" ? "Edit text" : "Edit image"} modal={false} className="max-h-[46dvh]">
      <Inspector />
    </Sheet>
  );
}

// ------------------------------------------------------------------ keyboard

function useKeyboardShortcuts() {
  const api = useStudioApi();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const s = api.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      const el = selectedElement(s);
      if (!el) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        s.removeElement(el.id);
      } else if (e.key === "Escape") {
        s.select(null);
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        s.duplicateElement(el.id);
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        s.updateElement(el.id, { x: el.x + dx, y: el.y + dy }, { coalesce: `${el.id}:nudge` });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api]);
}
