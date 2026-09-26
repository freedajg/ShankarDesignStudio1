import type { Box } from "../design/geometry";
import type { DesignElement, Surface } from "../design/schema";
import { drawText, layoutText, type Ctx2D, type Measure } from "./text";

/**
 * Deterministic drawing of a design surface and of the garment mockup, shared by
 * the server renderer (print files, admin previews) and the browser.
 */

export type Img = { width: number; height: number };

export type RenderCtx = Ctx2D & {
  globalAlpha: number;
  globalCompositeOperation: string;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality?: string;
  translate(x: number, y: number): void;
  rotate(rad: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(img: never, dx: number, dy: number, dw: number, dh: number): void;
};

export type CanvasLike = { width: number; height: number; getContext(type: "2d"): unknown };

export function elementBox(el: DesignElement, measure: Measure): Box {
  if (el.type === "image") return { x: el.x, y: el.y, hw: el.width / 2, hh: el.height / 2, rotation: el.rotation };
  const l = layoutText(el, measure);
  return { x: el.x, y: el.y, hw: l.hw, hh: l.hh, rotation: el.rotation };
}

/**
 * Draws all elements of a surface with the print area's top-left at the current
 * origin, `pxPerMm` pixels per millimetre. Missing images are skipped (the caller
 * validates presence before producing print files).
 */
export function drawSurface(
  ctx: RenderCtx,
  surface: Surface,
  opts: { pxPerMm: number; measure: Measure; images: Map<string, Img>; clip?: { width: number; height: number } },
) {
  const { pxPerMm } = opts;
  ctx.save();
  if (opts.clip) {
    ctx.beginPath();
    ctx.rect(0, 0, opts.clip.width * pxPerMm, opts.clip.height * pxPerMm);
    ctx.clip();
  }
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
  for (const el of surface.elements) {
    ctx.save();
    ctx.translate(el.x * pxPerMm, el.y * pxPerMm);
    ctx.rotate((el.rotation * Math.PI) / 180);
    if (el.type === "text") {
      drawText(ctx, el, layoutText(el, opts.measure), pxPerMm);
    } else {
      const img = opts.images.get(el.assetId);
      if (img) {
        const w = el.width * pxPerMm;
        const h = el.height * pxPerMm;
        ctx.drawImage(img as never, -w / 2, -h / 2, w, h);
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

export type MockupLayers = { mask: Img; shade: Img; highlight: Img };

/**
 * Composites garment colour + design + fabric shading into `target`:
 *   1. garment silhouette filled with the chosen colour
 *   2. the design, drawn by `drawDesign` in mockup pixel space
 *   3. shade (multiply) and highlight (screen) over both, so the print follows
 *      the folds of the fabric — it reads as printed, not pasted
 *   4. everything cut back to the garment silhouette
 */
export function composeMockup(
  target: CanvasLike,
  layers: MockupLayers,
  colourHex: string,
  drawDesign: ((ctx: RenderCtx) => void) | null,
  opts: { highlightAlpha?: number } = {},
) {
  const ctx = target.getContext("2d") as RenderCtx;
  const { width: W, height: H } = target;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(layers.mask as never, 0, 0, W, H);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = colourHex;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
  if (drawDesign) drawDesign(ctx);
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(layers.shade as never, 0, 0, W, H);
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = opts.highlightAlpha ?? 1;
  ctx.drawImage(layers.highlight as never, 0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(layers.mask as never, 0, 0, W, H);
  ctx.restore();
}

/** Mockup-pixel geometry of a print area (fractions stored in the DB). */
export function printAreaOnMockup(
  area: { widthMm: number; heightMm: number; mockupX: number; mockupY: number; mockupWidth: number },
  mockup: { width: number; height: number },
) {
  const left = area.mockupX * mockup.width;
  const top = area.mockupY * mockup.height;
  const width = area.mockupWidth * mockup.width;
  const pxPerMm = width / area.widthMm;
  return { left, top, width, height: area.heightMm * pxPerMm, pxPerMm };
}
