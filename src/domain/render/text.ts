import { cssFont, getFont, resolveFace } from "../fonts";
import type { TextElement } from "../design/schema";

/**
 * Text layout and drawing shared by the browser editor and the server print
 * renderer. Both call these functions on a standard Canvas 2D context with the
 * same font files, so what the customer sees is what gets printed.
 *
 * Measurements are taken at REF_PX and scaled, so layout is independent of the
 * zoom level the element is drawn at.
 */
export const REF_PX = 200;

export type Measure = (text: string, font: string) => {
  width: number;
  left: number; // actualBoundingBoxLeft
  right: number; // actualBoundingBoxRight
  ascent: number; // actualBoundingBoxAscent (baseline = middle)
  descent: number; // actualBoundingBoxDescent
};

export type TextLayout = {
  /** half-extents in mm (symmetric around the origin) */
  hw: number;
  hh: number;
  lines: { text: string; dx: number; dy: number }[]; // mm, left/middle anchor of each line
};

export type Ctx2D = {
  font: string;
  fillStyle: unknown;
  textAlign: string;
  textBaseline: string;
  measureText(text: string): {
    width: number;
    actualBoundingBoxLeft: number;
    actualBoundingBoxRight: number;
    actualBoundingBoxAscent: number;
    actualBoundingBoxDescent: number;
  };
  fillText(text: string, x: number, y: number): void;
  save(): void;
  restore(): void;
};

export function measurerFor(ctx: Ctx2D): Measure {
  return (text, font) => {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const m = ctx.measureText(text);
    ctx.restore();
    return {
      width: m.width,
      left: m.actualBoundingBoxLeft,
      right: m.actualBoundingBoxRight,
      ascent: m.actualBoundingBoxAscent,
      descent: m.actualBoundingBoxDescent,
    };
  };
}

export function textFontAt(el: Pick<TextElement, "fontId" | "bold" | "italic">, sizePx: number) {
  const font = getFont(el.fontId);
  return cssFont(font, resolveFace(font, el.bold, el.italic), sizePx);
}

export function layoutText(el: TextElement, measure: Measure): TextLayout {
  const k = el.fontSize / REF_PX; // mm per reference px
  const font = textFontAt(el, REF_PX);
  const raw = el.text.split("\n");
  const metrics = raw.map((t) => (t.length ? measure(t, font) : { width: 0, left: 0, right: 0, ascent: 0, descent: 0 }));
  const advW = Math.max(1, ...metrics.map((m) => m.width)) * k;
  const lineAdv = el.lineHeight * el.fontSize;
  const advH = raw.length * lineAdv;

  let minX = -advW / 2, maxX = advW / 2, minY = -advH / 2, maxY = advH / 2;
  const lines = raw.map((text, i) => {
    const w = metrics[i].width * k;
    const dx = el.align === "left" ? -advW / 2 : el.align === "right" ? advW / 2 - w : -w / 2;
    const dy = -advH / 2 + (i + 0.5) * lineAdv;
    if (text.length) {
      const m = metrics[i];
      minX = Math.min(minX, dx - m.left * k);
      maxX = Math.max(maxX, dx + m.right * k);
      minY = Math.min(minY, dy - m.ascent * k);
      maxY = Math.max(maxY, dy + m.descent * k);
    }
    return { text, dx, dy };
  });
  // symmetric, conservative box around the origin
  return { hw: Math.max(-minX, maxX), hh: Math.max(-minY, maxY), lines };
}

/** Draws text centred on the current origin (caller has translated/rotated). */
export function drawText(ctx: Ctx2D, el: TextElement, layout: TextLayout, pxPerMm: number) {
  ctx.save();
  ctx.font = textFontAt(el, el.fontSize * pxPerMm);
  ctx.fillStyle = el.fill;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const line of layout.lines) {
    if (line.text) ctx.fillText(line.text, line.dx * pxPerMm, line.dy * pxPerMm);
  }
  ctx.restore();
}
