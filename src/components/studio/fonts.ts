"use client";

import { DESIGN_FONTS, FONT_PUBLIC_DIR, fontFileName, getFont } from "@/domain/fonts";
import { measurerFor, type Ctx2D, type Measure } from "@/domain/render/text";

/**
 * Loads design fonts in the browser from the same files the server renderer
 * registers, so on-screen text metrics match the print file.
 */
const loaded = new Map<string, Promise<void>>();

export function loadDesignFont(fontId: string): Promise<void> {
  const font = getFont(fontId);
  let p = loaded.get(font.id);
  if (!p) {
    p = Promise.all(
      font.faces.map(async (face) => {
        const [weight, style] = face.split("-");
        const ff = new FontFace(font.family, `url(${FONT_PUBLIC_DIR}/${fontFileName(font.id, face)}) format("woff2")`, {
          weight,
          style,
          display: "block",
        });
        await ff.load();
        document.fonts.add(ff);
      }),
    ).then(() => undefined);
    // allow a retry after a network failure
    p.catch(() => loaded.delete(font.id));
    loaded.set(font.id, p);
  }
  return p;
}

export function isFontLoaded(fontId: string) {
  return loaded.has(getFont(fontId).id);
}

export function loadAllDesignFonts() {
  return Promise.allSettled(DESIGN_FONTS.map((f) => loadDesignFont(f.id)));
}

let measure: Measure | null = null;
export function browserMeasure(): Measure {
  if (!measure) {
    const ctx = document.createElement("canvas").getContext("2d") as unknown as Ctx2D;
    measure = measurerFor(ctx);
  }
  return measure;
}
