"use client";

import { Dialog } from "radix-ui";
import { ArrowLeft, Check, ChevronDown, Loader2, PenLine, RefreshCw, Sparkles, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Input, Textarea } from "@/components/ui/field";
import { AI_STYLES, type AiOrientation, type AiStyle } from "@/domain/ai/interpreter";
import { guidanceFor } from "@/domain/ai/print-guidance";
import { cn } from "@/lib/cn";
import { useStudio } from "../context";
import { areaFor } from "../store";
import type { AiGeneration, AiGeneratorApi, AiImage, AiRequest, AiStage } from "./use-ai-generator";

export const AI_PLACEHOLDER = "Create a bold vintage mountain design with a rising sun, pine trees and the words ADVENTURE AWAITS.";

export const AI_EXAMPLES = [
  { label: "Geometric lion", prompt: "A geometric lion head made of bold triangles in gold and deep blue" },
  { label: "Retro motorcycle", prompt: "A retro motorcycle with a sunset behind it and the words RIDE FREE" },
  { label: "Astronaut cat", prompt: "A cute cartoon astronaut cat floating among stars and planets" },
  { label: "Streetwear tiger", prompt: "A fierce streetwear tiger head with bold outlines and the words STAY WILD" },
  { label: "Minimal floral", prompt: "A minimal line-art floral bouquet with soft pastel colours" },
  { label: "Indian heritage", prompt: "An Indian heritage geometric mandala inspired by Jaipur's Hawa Mahal, in pink and gold" },
];

const STAGES: { id: AiStage; label: string }[] = [
  { id: "interpreting", label: "Understanding your idea..." },
  { id: "generating", label: "Creating your artwork..." },
  { id: "processing", label: "Preparing it for your T-shirt..." },
];

/** The "✨ Generate with AI" button. Distinct but calm: coral→gold edge, static sparkle. */
export function AiButton({ onClick, className, size = "md", children = "Generate with AI" }: { onClick: () => void; className?: string; size?: "sm" | "md" | "lg"; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="ai-open"
      className={cn(
        "ai-edge inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold text-ink shadow-card transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-float active:translate-y-0",
        size === "sm" ? "h-9 px-3 text-sm" : size === "lg" ? "h-13 px-6 text-base" : "h-11 px-4 text-[0.9375rem]",
        className,
      )}
    >
      <Sparkles className="size-4 shrink-0 text-accent" aria-hidden />
      {children}
    </button>
  );
}

type View = "form" | "results";

export function AiGenerator({ ai, open, onOpenChange }: { ai: AiGeneratorApi; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<AiStyle | null>(null);
  const [orientation, setOrientation] = useState<AiOrientation>("auto");
  const [lettering, setLettering] = useState(false);
  const [refinement, setRefinement] = useState("");
  const [addWords, setAddWords] = useState(true);
  const [view, setView] = useState<View>("form");
  const promptId = useId();
  const refineId = useId();

  // show results as soon as a generation finishes (adjusting state during render)
  const [shownId, setShownId] = useState<string | null>(null);
  if ((ai.current?.id ?? null) !== shownId) {
    setShownId(ai.current?.id ?? null);
    if (ai.current) {
      setView("results");
      setRefinement("");
      setAddWords(true);
    }
  }

  const running = ai.phase.kind === "running";
  // options are arriving: show them with placeholders for the rest
  const partial = ai.phase.kind === "running" && !!ai.phase.generationId && ai.current?.id === ai.phase.generationId;
  const pending = partial && ai.phase.kind === "running" ? Math.max(0, (ai.phase.expected ?? 0) - (ai.current?.images.length ?? 0)) : 0;
  const noQuota = !!ai.status && ai.status.enabled && ai.status.remaining <= 0;

  const request = (over: Partial<AiRequest> = {}): AiRequest => ({ prompt: prompt.trim(), style, orientation, lettering, ...over });
  const submit = () => {
    if (prompt.trim().length < 3) return;
    void ai.generate(request());
  };
  const fromGeneration = (g: AiGeneration, over: Partial<AiRequest>) =>
    ai.generate({ prompt: g.prompt, style: (g.style as AiStyle | null) ?? null, orientation: (g.orientation as AiOrientation | null) ?? "auto", lettering: g.lettering, parentGenerationId: g.id, ...over });

  const place = (g: AiGeneration, img: AiImage) => {
    if (!ai.use(g, img, addWords)) return;
    onOpenChange(false);
    toast.success("Added to your design", { description: "Drag to move it. Use the handles to resize or rotate." });
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        ai.setOpen(o);
        if (o) ai.ensureLoaded();
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim data-[state=open]:animate-fade-in" />
        <Dialog.Content
          data-testid="ai-dialog"
          className="fixed inset-0 z-50 flex flex-col bg-surface shadow-float data-[state=open]:animate-sheet-up sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[92dvh] sm:w-[min(46rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-lg)] sm:border sm:border-line"
        >
          <header className="flex items-start gap-3 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
            {(view === "results" && !running) || partial ? (
              <button type="button" onClick={() => setView("form")} className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full hover:bg-surface-muted" aria-label="Back to your idea">
                <ArrowLeft className="size-5" aria-hidden />
              </button>
            ) : (
              <span className="ai-edge-soft mt-0.5 grid size-9 shrink-0 place-items-center rounded-full" aria-hidden>
                <Sparkles className="size-4 text-accent" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold">Create your design with AI</Dialog.Title>
              <Dialog.Description className="text-sm text-ink-muted">Describe what you want on your T-shirt. Our AI will turn your idea into artwork.</Dialog.Description>
            </div>
            <Dialog.Close className="grid size-10 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-muted" aria-label="Close">
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
            {!ai.status ? (
              <div className="flex flex-col gap-3" aria-label="Loading">
                <Skeleton className="h-28" />
                <Skeleton className="h-9 w-2/3" />
                <Skeleton className="h-9" />
              </div>
            ) : !ai.status.enabled ? (
              <Alert tone="info" title="AI design generation isn't available right now">
                You can still upload your own artwork or add text to your shirt.
                {ai.status.setupHint && (
                  <span className="mt-2 block text-xs" data-testid="ai-setup-hint">
                    Shop owner: add <code className="rounded bg-surface px-1">OPENAI_API_KEY</code> or <code className="rounded bg-surface px-1">OPENROUTER_API_KEY</code> in Vercel → Settings → Environment Variables, then redeploy.
                  </span>
                )}
              </Alert>
            ) : running && !partial ? (
              <Progress stage={ai.phase.kind === "running" ? ai.phase.stage : "interpreting"} onCancel={ai.cancel} />
            ) : (view === "results" || partial) && ai.current ? (
              <Results
                gen={ai.current}
                pending={pending}
                onCancel={partial ? ai.cancel : undefined}
                addWords={addWords}
                setAddWords={setAddWords}
                onUse={(img) => place(ai.current!, img)}
                onSimilar={(img) => void fromGeneration(ai.current!, { referenceAssetId: img.asset.id, refinement: null })}
                disabled={noQuota}
                refine={
                  <form
                    className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-surface-muted p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (refinement.trim()) void fromGeneration(ai.current!, { refinement: refinement.trim() });
                    }}
                  >
                    <label htmlFor={refineId} className="text-sm font-medium">
                      Want changes?
                    </label>
                    <div className="flex gap-2">
                      <Input id={refineId} value={refinement} maxLength={300} placeholder="e.g. make it more colourful, add a moon, simpler lines" onChange={(e) => setRefinement(e.target.value)} />
                      <Button type="submit" variant="secondary" disabled={!refinement.trim() || noQuota}>
                        <RefreshCw aria-hidden /> Refine
                      </Button>
                    </div>
                  </form>
                }
                onEditPrompt={() => {
                  setPrompt(ai.current!.prompt);
                  setView("form");
                }}
              />
            ) : (
              <div className="flex flex-col gap-5">
                {ai.phase.kind === "error" && (
                  <Alert
                    tone={ai.phase.refused ? "warning" : "danger"}
                    action={
                      !ai.phase.refused && !noQuota ? (
                        <Button size="sm" variant="secondary" onClick={() => ai.phase.kind === "error" && void ai.generate(ai.phase.request)}>
                          Try again
                        </Button>
                      ) : undefined
                    }
                  >
                    {ai.phase.message}
                  </Alert>
                )}
                <form
                  className="flex flex-col gap-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                  }}
                >
                  <div className="flex flex-col gap-2">
                    <label htmlFor={promptId} className="font-semibold">
                      What do you want to create?
                    </label>
                    <Textarea
                      id={promptId}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      maxLength={600}
                      rows={4}
                      placeholder={AI_PLACEHOLDER}
                      className="resize-none text-base"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          submit();
                        }
                      }}
                    />
                    <div className="flex flex-wrap gap-2" aria-label="Example ideas">
                      {AI_EXAMPLES.map((ex) => (
                        <button
                          key={ex.label}
                          type="button"
                          onClick={() => setPrompt(ex.prompt)}
                          className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-ink hover:text-ink"
                        >
                          {ex.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <fieldset>
                    <legend className="mb-2 text-sm font-medium">
                      Style <span className="font-normal text-ink-muted">(optional)</span>
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {AI_STYLES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={style === s}
                          onClick={() => setStyle(style === s ? null : s)}
                          className={cn(
                            "rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm transition-colors",
                            style === s ? "border-ink bg-ink font-medium text-on-ink" : "border-line-strong hover:border-ink",
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <details className="group rounded-[var(--radius-md)] border border-line">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-medium">
                      More options
                      <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                    </summary>
                    <div className="flex flex-col gap-4 border-t border-line px-3 py-3">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium">Shape</span>
                        <Segmented<AiOrientation>
                          label="Artwork shape"
                          size="sm"
                          value={orientation}
                          onChange={setOrientation}
                          options={[
                            { value: "auto", label: "Fit print area" },
                            { value: "portrait", label: "Portrait" },
                            { value: "square", label: "Square" },
                            { value: "landscape", label: "Landscape" },
                          ]}
                          className="flex w-full overflow-x-auto"
                        />
                      </div>
                      <label className="flex items-start gap-2.5 text-sm">
                        <input type="checkbox" checked={lettering} onChange={(e) => setLettering(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-ink)]" />
                        <span>
                          Draw the words into the artwork
                          <span className="block text-xs text-ink-muted">Off: words you mention are added as editable text, so you can change the spelling, font and colour.</span>
                        </span>
                      </label>
                    </div>
                  </details>

                  <DesignContext />

                  <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Quota status={ai.status} />
                    <Button type="submit" size="lg" variant="primary" disabled={prompt.trim().length < 3 || noQuota} data-testid="ai-generate">
                      <Sparkles aria-hidden /> Generate designs
                    </Button>
                  </div>
                </form>

                {ai.history.length > 0 && (
                  <section aria-labelledby="ai-recent">
                    <h3 id="ai-recent" className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-muted">
                      Your recent AI designs
                    </h3>
                    <ul className="flex gap-2 overflow-x-auto pb-1">
                      {ai.history.map((g) => (
                        <li key={g.id}>
                          <button
                            type="button"
                            onClick={() => {
                              ai.setCurrent(g);
                              setView("results");
                            }}
                            title={g.prompt}
                            aria-label={`Show designs for: ${g.prompt}`}
                            className="grid size-16 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-line bg-surface-muted p-1 hover:border-ink"
                          >
                            {g.images[0] && (
                              // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked preview
                              <img src={g.images[0].asset.previewUrl} alt="" className="max-h-full max-w-full object-contain" />
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Quota({ status }: { status: AiGeneratorApi["status"] }) {
  if (!status) return null;
  return (
    <p className={cn("text-xs", status.remaining <= 0 ? "font-medium text-warning-ink" : "text-ink-muted")} data-testid="ai-quota">
      {status.remaining <= 0
        ? "You've used all your AI designs for today. You can still use the ones you made, upload artwork or add text."
        : `${status.remaining} of ${status.limit} AI designs left today · ${status.variations} options each`}
    </p>
  );
}

function DesignContext() {
  const product = useStudio((s) => s.product);
  const colour = useStudio((s) => s.product.colours.find((c) => c.id === s.doc.colourId));
  const side = useStudio((s) => s.side);
  const areaCode = useStudio((s) => s.doc.surfaces[s.side].printAreaCode);
  const methodCode = useStudio((s) => s.printMethodCode);
  const area = areaFor(product, side, areaCode);
  const method = product.printMethods.find((m) => m.code === methodCode);
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-md)] bg-surface-muted p-3 text-sm">
      <span className="mt-0.5 size-5 shrink-0 rounded-full border border-swatch-edge" style={{ backgroundColor: colour?.hex }} aria-hidden />
      <p className="text-ink-muted">
        Made for your <span className="font-medium text-ink">{colour?.name.toLowerCase()} {product.name}</span> · {area.name.toLowerCase()} ({area.widthMm / 10} × {area.heightMm / 10} cm) on the {side}
        {method && (
          <>
            {" "}
            · {method.name}. <span className="block sm:inline">{guidanceFor(method.code).summary}</span>
          </>
        )}
      </p>
    </div>
  );
}

function Progress({ stage, onCancel }: { stage: AiStage; onCancel: () => void }) {
  const index = STAGES.findIndex((s) => s.id === stage);
  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center" data-testid="ai-progress">
      <div className="ai-edge-soft grid size-16 place-items-center rounded-full">
        <Loader2 className="size-7 animate-spin text-accent" aria-hidden />
      </div>
      <div role="status" aria-live="polite">
        <p className="text-lg font-semibold">{STAGES[index]?.label}</p>
        <p className="mt-1 text-sm text-ink-muted">This usually takes 20–60 seconds. Your design is safe while you wait.</p>
      </div>
      <ol className="flex w-full max-w-xs flex-col gap-2 text-left text-sm">
        {STAGES.map((s, i) => (
          <li key={s.id} className={cn("flex items-center gap-2", i > index ? "text-ink-subtle" : "text-ink")}>
            {i < index ? (
              <Check className="size-4 text-success" aria-hidden />
            ) : i === index ? (
              <Loader2 className="size-4 animate-spin text-accent" aria-hidden />
            ) : (
              <span className="size-4 rounded-full border border-line-strong" aria-hidden />
            )}
            {s.label.replace("...", "")}
          </li>
        ))}
      </ol>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function Results({
  gen,
  addWords,
  setAddWords,
  onUse,
  onSimilar,
  onEditPrompt,
  refine,
  disabled,
  pending = 0,
  onCancel,
}: {
  pending?: number;
  onCancel?: () => void;
  gen: AiGeneration;
  addWords: boolean;
  setAddWords: (v: boolean) => void;
  onUse: (img: AiImage) => void;
  onSimilar: (img: AiImage) => void;
  onEditPrompt: () => void;
  refine: ReactNode;
  disabled: boolean;
}) {
  const shirtHex = useStudio((s) => s.product.colours.find((c) => c.id === s.doc.colourId)?.hex ?? "#FFFFFF");
  const colourName = useStudio((s) => s.product.colours.find((c) => c.id === s.doc.colourId)?.name ?? "");
  return (
    <div className="flex flex-col gap-5" data-testid="ai-results">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">Your idea</p>
          <p className="mt-0.5 line-clamp-3 text-sm">
            “{gen.prompt}”{gen.refinement && <span className="text-ink-muted"> · {gen.refinement}</span>}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onEditPrompt}>
          <PenLine aria-hidden /> Edit
        </Button>
      </div>

      {gen.textRequests.length > 0 && (
        <label className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-line p-3 text-sm">
          <input type="checkbox" checked={addWords} onChange={(e) => setAddWords(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-ink)]" />
          <span>
            Also add {gen.textRequests.map((t) => `“${t}”`).join(" and ")} as editable text
            <span className="block text-xs text-ink-muted">You can change the words, font and colour afterwards.</span>
          </span>
        </label>
      )}

      <ul className="grid grid-cols-2 gap-3">
        {gen.images.map((img, i) => (
          <li key={img.id} className="flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface" data-testid="ai-variation">
            <div className="relative grid aspect-square place-items-center p-3" style={{ backgroundColor: shirtHex }} title={`Preview on ${colourName}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked preview */}
              <img src={img.asset.previewUrl} alt={`AI design option ${i + 1}`} className="max-h-full max-w-full object-contain" />
              {img.selected && (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-surface/95 px-2 py-0.5 text-xs font-medium">
                  <Check className="size-3 text-success" aria-hidden /> Added
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-2.5">
              {img.warnings[0] && <p className="text-xs text-warning-ink">{img.warnings[0].message}</p>}
              <Button size="sm" variant="primary" className="w-full" onClick={() => onUse(img)}>
                Use this design
              </Button>
              <Button size="sm" variant="ghost" className="w-full" onClick={() => onSimilar(img)} disabled={disabled}>
                <RefreshCw aria-hidden /> Generate similar
              </Button>
            </div>
          </li>
        ))}
        {Array.from({ length: pending }, (_, i) => (
          <li key={`pending-${i}`} className="flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-dashed border-line-strong" data-testid="ai-variation-pending">
            <div className="grid aspect-square place-items-center bg-surface-muted p-3 text-center">
              <div className="flex flex-col items-center gap-2 text-sm text-ink-muted">
                <Loader2 className="size-5 animate-spin text-accent" aria-hidden />
                Creating option {gen.images.length + i + 1}…
              </div>
            </div>
          </li>
        ))}
      </ul>

      {pending > 0 && onCancel && (
        <div className="flex items-center justify-between gap-3 text-sm text-ink-muted" role="status" aria-live="polite">
          <span>You can use a design now — the next one is on its way.</span>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Stop
          </Button>
        </div>
      )}
      {pending === 0 && refine}
      <p className="text-xs text-ink-muted">AI-generated artwork. Please check spelling and details before ordering — our team also reviews every design before printing.</p>
    </div>
  );
}
