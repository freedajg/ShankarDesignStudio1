"use client";

import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bold,
  BringToFront,
  Copy,
  Italic,
  RotateCcw,
  SendToBack,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Label, Textarea } from "@/components/ui/field";
import { artworkWarnings } from "@/domain/artwork";
import { contrastRatio } from "@/domain/colour";
import { round2 } from "@/domain/design/geometry";
import type { DesignElement, ImageElement, TextElement } from "@/domain/design/schema";
import { DESIGN_FONTS, getFont } from "@/domain/fonts";
import { cn } from "@/lib/cn";
import { useStudio } from "./context";
import { loadAllDesignFonts } from "./fonts";
import { areaFor, selectedElement } from "./store";

const PRINT_COLOURS = [
  ["White", "#FFFFFF"],
  ["Black", "#1C1A17"],
  ["Ginger", "#B8521A"],
  ["Red", "#C62828"],
  ["Gold", "#E0A526"],
  ["Yellow", "#F4D03F"],
  ["Green", "#2E7D32"],
  ["Teal", "#00897B"],
  ["Sky", "#4FA3E0"],
  ["Navy", "#1F2A44"],
  ["Purple", "#6A3FA0"],
  ["Pink", "#E86A9A"],
  ["Grey", "#9E9E9E"],
] as const;

function Row({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium uppercase tracking-wider text-ink-muted">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Toggle({ pressed, onClick, label, disabled, children }: { pressed: boolean; onClick: () => void; label: string; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={disabled ? `${label} isn't available in this font` : label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-10 place-items-center rounded-[var(--radius-sm)] border transition-colors disabled:opacity-35",
        pressed ? "border-ink bg-ink text-white" : "border-line-strong hover:border-ink",
      )}
    >
      {children}
    </button>
  );
}

function RangeWithValue({
  id,
  value,
  min,
  max,
  step,
  onChange,
  format,
  label,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  format: (n: number) => string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        aria-valuetext={format(value)}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 flex-1 cursor-pointer accent-[var(--color-ginger)]"
      />
      <span className="w-16 text-right text-sm tabular-nums">{format(value)}</span>
    </div>
  );
}

export function Inspector({ textAreaRef }: { textAreaRef?: React.RefObject<HTMLTextAreaElement | null> }) {
  const el = useStudio(selectedElement);
  if (!el) return null;
  return el.type === "text" ? <TextInspector el={el} textAreaRef={textAreaRef} /> : <ImageInspector el={el} />;
}

function CommonControls({ el }: { el: DesignElement }) {
  const update = useStudio((s) => s.updateElement);
  const duplicate = useStudio((s) => s.duplicateElement);
  const remove = useStudio((s) => s.removeElement);
  const moveLayer = useStudio((s) => s.moveLayer);
  const product = useStudio((s) => s.product);
  const surface = useStudio((s) => s.doc.surfaces[s.side]);
  const side = useStudio((s) => s.side);
  const area = areaFor(product, side, surface.printAreaCode);
  const rid = useId();
  const nudge = (dx: number, dy: number) => update(el.id, { x: round2(el.x + dx), y: round2(el.y + dy) }, { coalesce: `${el.id}:nudge` });

  return (
    <>
      <Row label="Rotation" htmlFor={rid}>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <RangeWithValue id={rid} label="Rotation" value={el.rotation} min={-180} max={180} step={1} format={(n) => `${Math.round(n)}°`} onChange={(n) => update(el.id, { rotation: n }, { coalesce: `${el.id}:rot` })} />
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Reset rotation" onClick={() => update(el.id, { rotation: 0 })}>
            <RotateCcw aria-hidden />
          </Button>
        </div>
      </Row>
      <Row label="Position">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="secondary" size="icon-sm" aria-label="Move left 2 mm" onClick={() => nudge(-2, 0)}><ArrowLeft aria-hidden /></Button>
          <Button variant="secondary" size="icon-sm" aria-label="Move up 2 mm" onClick={() => nudge(0, -2)}><ArrowUp aria-hidden /></Button>
          <Button variant="secondary" size="icon-sm" aria-label="Move down 2 mm" onClick={() => nudge(0, 2)}><ArrowDown aria-hidden /></Button>
          <Button variant="secondary" size="icon-sm" aria-label="Move right 2 mm" onClick={() => nudge(2, 0)}><ArrowRight aria-hidden /></Button>
          <Button variant="secondary" size="sm" onClick={() => update(el.id, { x: round2(area.widthMm / 2) })}>
            <AlignHorizontalJustifyCenter aria-hidden /> Centre
          </Button>
        </div>
      </Row>
      <div className="flex flex-wrap gap-1.5 border-t border-line pt-4">
        <Button variant="secondary" size="sm" onClick={() => moveLayer(el.id, "top")}><BringToFront aria-hidden /> Front</Button>
        <Button variant="secondary" size="sm" onClick={() => moveLayer(el.id, "bottom")}><SendToBack aria-hidden /> Back</Button>
        <Button variant="secondary" size="sm" onClick={() => duplicate(el.id)}><Copy aria-hidden /> Duplicate</Button>
        <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" onClick={() => remove(el.id)}><Trash2 aria-hidden /> Delete</Button>
      </div>
    </>
  );
}

function TextInspector({ el, textAreaRef }: { el: TextElement; textAreaRef?: React.RefObject<HTMLTextAreaElement | null> }) {
  const update = useStudio((s) => s.updateElement);
  const garment = useStudio((s) => s.product.colours.find((c) => c.id === s.doc.colourId));
  const lowContrast = garment ? contrastRatio(el.fill, garment.hex) < 1.6 : false;
  const [fontsReady, setFontsReady] = useState(false);
  const textId = useId();
  const sizeId = useId();
  // local draft so the field can be emptied while retyping; the design keeps the last non-empty text
  const [draft, setDraft] = useState(el.text);
  const [source, setSource] = useState(`${el.id}\u0000${el.text}`);
  if (source !== `${el.id}\u0000${el.text}`) {
    setSource(`${el.id}\u0000${el.text}`);
    setDraft(el.text);
  }
  useEffect(() => {
    void loadAllDesignFonts().then(() => setFontsReady(true));
  }, []);
  const font = getFont(el.fontId);
  const hasBold = font.faces.some((f) => f.startsWith("700"));
  const hasItalic = font.faces.some((f) => f.endsWith("italic"));

  return (
    <div className="flex flex-col gap-5" data-testid="text-inspector">
      <Row label="Text" htmlFor={textId}>
        <Textarea
          id={textId}
          ref={textAreaRef}
          value={draft}
          rows={2}
          maxLength={200}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value.trim()) update(el.id, { text: e.target.value }, { coalesce: `${el.id}:text` });
          }}
          onBlur={() => !draft.trim() && setDraft(el.text)}
          className="min-h-16 resize-y"
        />
      </Row>
      <Row label="Font">
        <div role="radiogroup" aria-label="Font" className="grid grid-cols-2 gap-1.5">
          {DESIGN_FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={f.id === el.fontId}
              onClick={() => update(el.id, { fontId: f.id })}
              className={cn(
                "truncate rounded-[var(--radius-sm)] border px-2.5 py-2 text-left text-[0.95rem] transition-colors",
                f.id === el.fontId ? "border-ginger bg-ginger-soft" : "border-line hover:border-ink",
              )}
              style={{ fontFamily: fontsReady ? `${f.family}, sans-serif` : undefined }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Size" htmlFor={sizeId}>
        <RangeWithValue id={sizeId} label="Text size" value={el.fontSize} min={3} max={160} step={0.5} format={(n) => `${(n / 10).toFixed(1)} cm`} onChange={(n) => update(el.id, { fontSize: n }, { coalesce: `${el.id}:size` })} />
      </Row>
      <Row label="Style">
        <div className="flex flex-wrap gap-1.5">
          <Toggle label="Bold" pressed={el.bold && hasBold} disabled={!hasBold} onClick={() => update(el.id, { bold: !el.bold })}><Bold className="size-4" aria-hidden /></Toggle>
          <Toggle label="Italic" pressed={el.italic && hasItalic} disabled={!hasItalic} onClick={() => update(el.id, { italic: !el.italic })}><Italic className="size-4" aria-hidden /></Toggle>
          <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
          <Toggle label="Align left" pressed={el.align === "left"} onClick={() => update(el.id, { align: "left" })}><AlignLeft className="size-4" aria-hidden /></Toggle>
          <Toggle label="Align centre" pressed={el.align === "center"} onClick={() => update(el.id, { align: "center" })}><AlignCenter className="size-4" aria-hidden /></Toggle>
          <Toggle label="Align right" pressed={el.align === "right"} onClick={() => update(el.id, { align: "right" })}><AlignRight className="size-4" aria-hidden /></Toggle>
        </div>
      </Row>
      <Row label="Colour">
        <div role="radiogroup" aria-label="Text colour" className="flex flex-wrap items-center gap-2">
          {PRINT_COLOURS.map(([name, hex]) => (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={el.fill.toUpperCase() === hex}
              aria-label={name}
              title={name}
              onClick={() => update(el.id, { fill: hex })}
              className={cn("size-8 rounded-full border border-black/15", el.fill.toUpperCase() === hex && "ring-2 ring-ginger ring-offset-2")}
              style={{ backgroundColor: hex }}
            />
          ))}
          <label className="relative size-8 cursor-pointer overflow-hidden rounded-full border border-black/15 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" title="Custom colour">
            <span className="sr-only">Custom colour</span>
            <input type="color" value={el.fill} onChange={(e) => update(el.id, { fill: e.target.value.toUpperCase() }, { coalesce: `${el.id}:fill` })} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
      </Row>
      {lowContrast && garment && (
        <Alert tone="warning">This text colour is hard to see on a {garment.name.toLowerCase()} shirt.</Alert>
      )}
      <CommonControls el={el} />
    </div>
  );
}

function ImageInspector({ el }: { el: ImageElement }) {
  const update = useStudio((s) => s.updateElement);
  const asset = useStudio((s) => s.assets[el.assetId]);
  const rules = useStudio((s) => s.settings.artwork);
  const product = useStudio((s) => s.product);
  const surface = useStudio((s) => s.doc.surfaces[s.side]);
  const side = useStudio((s) => s.side);
  const area = areaFor(product, side, surface.printAreaCode);
  const sizeId = useId();
  const warnings = asset ? artworkWarnings(asset, el.width, rules) : [];
  const aspect = el.height / el.width;

  return (
    <div className="flex flex-col gap-5" data-testid="image-inspector">
      {asset && (
        <div className="flex items-center gap-3">
          <div className="grid size-14 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-line bg-[conic-gradient(#eee_25%,#fff_0_50%,#eee_0_75%,#fff_0)] bg-[length:10px_10px] p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.previewUrl} alt="" className="max-h-full max-w-full object-contain" />
          </div>
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{asset.originalFilename ?? "Uploaded image"}</p>
            <p className="text-ink-muted tabular-nums">
              {asset.widthPx} × {asset.heightPx}px · prints {(el.width / 10).toFixed(1)} × {(el.height / 10).toFixed(1)} cm
            </p>
          </div>
        </div>
      )}
      {warnings.map((w) => (
        <Alert key={w.code} tone="warning">
          {w.message}
        </Alert>
      ))}
      <Row label="Size" htmlFor={sizeId}>
        <RangeWithValue
          id={sizeId}
          label="Image width"
          value={el.width}
          min={5}
          max={Math.floor(Math.min(area.widthMm, area.heightMm / aspect))}
          step={1}
          format={(n) => `${(n / 10).toFixed(1)} cm`}
          onChange={(n) => update(el.id, { width: n, height: round2(n * aspect) }, { coalesce: `${el.id}:size` })}
        />
      </Row>
      <CommonControls el={el} />
    </div>
  );
}
