import { guidanceFor } from "./print-guidance";
import type { ArtworkRequirements } from "./interpreter";

/**
 * Builds the image-model prompt from structured requirements. The output must
 * be the printable ARTWORK itself — never a garment, model, mockup or scene.
 */

export const NEGATIVE_RULES = [
  "no t-shirt, no garment, no clothing, no fabric",
  "no person, no model, no mannequin",
  "no mockup, no product photo, no studio scene, no hanger",
  "no watermark, no signature, no logo of any brand",
  "no border or frame, no background scenery",
];

export function buildImagePrompt(r: ArtworkRequirements): { prompt: string; negative: string[] } {
  const ctx = r.context;
  const lines: string[] = [];
  lines.push(`Standalone print-ready artwork for a custom T-shirt: ${r.subject}.`);
  if (r.style) lines.push(`Style: ${r.style.toLowerCase()}${r.style === "Streetwear" ? " graphic" : ""}.`);
  if (r.moods.length) lines.push(`Mood: ${r.moods.join(", ")}.`);
  if (r.colours.length) lines.push(`Colour palette: ${r.colours.join(", ")}.`);
  lines.push(
    r.contrastOn === "dark"
      ? `It will be printed on a ${ctx.shirtColourName.toLowerCase()} (dark) shirt: use bright, high-contrast colours; avoid dark areas that would disappear into the fabric.`
      : `It will be printed on a ${ctx.shirtColourName.toLowerCase()} (light) shirt: use strong, saturated or dark colours; avoid pale colours and white that would disappear into the fabric.`,
  );
  lines.push(
    r.complexity === "simple"
      ? `Small print (${ctx.printAreaWidthMm / 10} × ${ctx.printAreaHeightMm / 10} cm ${ctx.printAreaName.toLowerCase()}): one compact, simple, instantly readable motif with thick shapes.`
      : r.complexity === "moderate"
        ? `Medium complexity composition sized for a ${ctx.printAreaWidthMm / 10} × ${ctx.printAreaHeightMm / 10} cm print.`
        : `Rich, detailed composition that fills a ${ctx.printAreaWidthMm / 10} × ${ctx.printAreaHeightMm / 10} cm ${ctx.printAreaName.toLowerCase()} print.`,
  );
  lines.push(`Composition: centered, ${r.orientation}, subject isolated with clean edges, generous detail at print size.`);
  for (const rule of guidanceFor(ctx.printMethodCode).promptRules) lines.push(`Print constraint: ${rule}.`);
  if (r.textRequests.length && r.letteringInImage) {
    lines.push(`Include the exact lettering ${r.textRequests.map((t) => `"${t}"`).join(" and ")}, spelled exactly, integrated into the design.`);
  } else {
    lines.push("Do not include any text, letters, numbers or words in the image.");
  }
  if (r.refinement) lines.push(`Revision request: ${r.refinement}.`);
  lines.push("Transparent background; only the artwork itself.");

  const negative = [...NEGATIVE_RULES];
  return { prompt: `${lines.join("\n")}\nAvoid: ${negative.join("; ")}.`, negative };
}

/** Pixel size to request: print-area aspect, about 150 DPI, within provider limits. */
export function requestedPixelSize(r: ArtworkRequirements, limits = { maxPixels: 3_686_400, min: 1024 }): { width: number; height: number } {
  const ratio = r.orientation === "portrait" ? 4 / 5 : r.orientation === "landscape" ? 5 / 4 : 1;
  const targetW = (Math.max(r.context.printAreaWidthMm, 1) / 25.4) * 150;
  let width = Math.max(limits.min * Math.min(1, ratio), targetW);
  let height = width / ratio;
  const scale = Math.min(1, Math.sqrt(limits.maxPixels / (width * height)));
  width *= scale;
  height *= scale;
  if (Math.min(width, height) < limits.min) {
    const up = limits.min / Math.min(width, height);
    width *= up;
    height *= up;
  }
  const r16 = (n: number) => Math.max(16, Math.round(n / 16) * 16);
  return { width: r16(width), height: r16(height) };
}
