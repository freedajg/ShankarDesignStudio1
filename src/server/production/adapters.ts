import "server-only";
import type { DesignDoc, Side } from "@/domain/design/schema";
import type { Settings } from "@/domain/settings";
import { artworkWarnings } from "@/domain/artwork";

/**
 * Print-method adapters. One generic PNG is NOT suitable for every method, so
 * each adapter states what its file is and what production must still do.
 * New methods (screen print, sublimation…) are added here.
 */
export type ProductionNote = { level: "info" | "warning"; message: string };

export interface PrintMethodAdapter {
  code: string;
  /** resolution the print file is rendered at */
  dpi: number;
  /** what the downloadable file is, in production terms */
  fileDescription: string;
  /** checks specific to this method for one decorated surface */
  review(input: { doc: DesignDoc; side: Side; assets: Map<string, { widthPx: number; heightPx: number; hasAlpha: boolean }>; rules: Settings["artwork"] }): ProductionNote[];
}

function imageNotes(input: Parameters<PrintMethodAdapter["review"]>[0]): ProductionNote[] {
  const notes: ProductionNote[] = [];
  for (const el of input.doc.surfaces[input.side].elements) {
    if (el.type !== "image") continue;
    const a = input.assets.get(el.assetId);
    if (!a) {
      notes.push({ level: "warning", message: "An artwork file is missing." });
      continue;
    }
    for (const w of artworkWarnings(a, el.width, input.rules)) notes.push({ level: "warning", message: w.message });
  }
  return notes;
}

const textColours = (doc: DesignDoc, side: Side) => new Set(doc.surfaces[side].elements.flatMap((e) => (e.type === "text" ? [e.fill.toUpperCase()] : [])));
const hasImages = (doc: DesignDoc, side: Side) => doc.surfaces[side].elements.some((e) => e.type === "image");

const DTF: PrintMethodAdapter = {
  code: "DTF",
  dpi: 300,
  fileDescription: "Print-ready transparent PNG at 300 DPI and exact physical size of the print area.",
  review: (input) => imageNotes(input),
};

const VINYL: PrintMethodAdapter = {
  code: "VINYL",
  dpi: 300,
  fileDescription: "Reference PNG at 300 DPI and physical size. Vinyl is cut from vector paths — trace or rebuild before cutting.",
  review: (input) => {
    const notes = imageNotes(input);
    const colours = textColours(input.doc, input.side);
    if (hasImages(input.doc, input.side)) {
      notes.push({ level: "warning", message: "Contains uploaded images. Vinyl needs solid-colour vector shapes; photos and gradients can't be cut." });
    }
    notes.push({
      level: "info",
      message: hasImages(input.doc, input.side)
        ? `${colours.size} text colour(s) plus image artwork — count vinyl colours manually.`
        : `${colours.size} vinyl colour(s): ${[...colours].join(", ")}.`,
    });
    return notes;
  },
};

const EMBROIDERY: PrintMethodAdapter = {
  code: "EMBROIDERY",
  dpi: 300,
  fileDescription: "Placement reference PNG at physical size. Embroidery needs a digitised stitch file (e.g. DST/PES) made from this artwork — not generated automatically.",
  review: (input) => {
    const notes = imageNotes(input).filter((n) => !/transparent background/.test(n.message));
    if (hasImages(input.doc, input.side)) notes.push({ level: "warning", message: "Check that image artwork has few, solid colours — fine gradients don't embroider well." });
    for (const el of input.doc.surfaces[input.side].elements) {
      if (el.type === "text" && el.fontSize < 5) notes.push({ level: "warning", message: `Text “${el.text.slice(0, 20)}” is under 5 mm tall — very small lettering may not stitch cleanly.` });
    }
    return notes;
  },
};

const ADAPTERS: Record<string, PrintMethodAdapter> = { DTF, VINYL, EMBROIDERY };

export function adapterFor(code: string): PrintMethodAdapter {
  const a = ADAPTERS[code];
  if (!a) throw new Error(`No production adapter for print method ${code}`);
  return a;
}
