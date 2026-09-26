import type { Settings } from "./settings";

/**
 * Artwork rules. The accepted-format list is the single switch for adding SVG/PDF
 * later (each will need its own sanitiser before being accepted).
 */
export const ACCEPTED_FORMATS = { png: "image/png", jpeg: "image/jpeg" } as const;
export type AcceptedFormat = keyof typeof ACCEPTED_FORMATS;
export const ACCEPT_ATTR = ".png,.jpg,.jpeg,image/png,image/jpeg";

export type ArtworkWarning = { code: "LOW_DPI" | "VERY_LOW_DPI" | "NO_TRANSPARENCY" | "SMALL_SOURCE"; message: string };

const MM_PER_INCH = 25.4;

/** Effective print resolution of an image placed at a physical width. */
export function effectiveDpi(widthPx: number, printedWidthMm: number) {
  return printedWidthMm > 0 ? (widthPx / printedWidthMm) * MM_PER_INCH : Infinity;
}

/** Warnings only — the system never silently alters artwork. */
export function artworkWarnings(
  asset: { widthPx: number; heightPx: number; hasAlpha: boolean },
  placedWidthMm: number | null,
  rules: Settings["artwork"],
): ArtworkWarning[] {
  const out: ArtworkWarning[] = [];
  if (placedWidthMm !== null) {
    const dpi = effectiveDpi(asset.widthPx, placedWidthMm);
    if (dpi < rules.poorDpi) {
      out.push({ code: "VERY_LOW_DPI", message: `This image will likely print blurry at this size (about ${Math.round(dpi)} DPI). Make it smaller or upload a larger file.` });
    } else if (dpi < rules.warnDpi) {
      out.push({ code: "LOW_DPI", message: `This image may look soft at this size (about ${Math.round(dpi)} DPI; ${rules.warnDpi}+ recommended).` });
    }
  }
  if (!asset.hasAlpha) {
    out.push({ code: "NO_TRANSPARENCY", message: "This image has no transparent background, so its background will print as a solid rectangle." });
  }
  if (Math.max(asset.widthPx, asset.heightPx) < rules.minLongEdgePx) {
    out.push({ code: "SMALL_SOURCE", message: `The image is small (${asset.widthPx}×${asset.heightPx}px). A larger original will print sharper.` });
  }
  return out;
}

/** Largest width (mm) at which the image still meets the recommended DPI. */
export function maxSharpWidthMm(widthPx: number, rules: Settings["artwork"]) {
  return (widthPx / rules.warnDpi) * MM_PER_INCH;
}
