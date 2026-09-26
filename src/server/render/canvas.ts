import "server-only";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import fs from "node:fs";
import path from "node:path";
import { DESIGN_FONTS, fontFileName } from "@/domain/fonts";
import { measurerFor, type Ctx2D, type Measure } from "@/domain/render/text";

/**
 * Server canvas (Skia via @napi-rs/canvas) with the design fonts registered from
 * the same woff2 files the browser loads.
 */
const PUBLIC_DIR = path.join(process.cwd(), "public");

let fontsRegistered = false;
export function ensureFonts() {
  if (fontsRegistered) return;
  for (const font of DESIGN_FONTS) {
    for (const face of font.faces) {
      const file = path.join(PUBLIC_DIR, "fonts", "design", fontFileName(font.id, face));
      if (!GlobalFonts.registerFromPath(file, font.family)) {
        throw new Error(`Could not register design font ${file}`);
      }
    }
  }
  fontsRegistered = true;
}

let measureCtx: Ctx2D | null = null;
export function serverMeasure(): Measure {
  ensureFonts();
  measureCtx ??= createCanvas(8, 8).getContext("2d") as unknown as Ctx2D;
  return measurerFor(measureCtx);
}

/** Loads an image shipped in /public (mockup layers). Cached per process. */
const publicImages = new Map<string, Promise<Awaited<ReturnType<typeof loadImage>>>>();
export function loadPublicImage(publicUrl: string) {
  const rel = publicUrl.replace(/^\/+/, "");
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) throw new Error("invalid public path");
  let p = publicImages.get(file);
  if (!p) {
    p = fs.promises.readFile(file).then((buf) => loadImage(buf));
    publicImages.set(file, p);
  }
  return p;
}

export { createCanvas, loadImage };
