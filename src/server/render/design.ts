import "server-only";
import { inArray } from "drizzle-orm";
import sharp from "sharp";
import type { DbOrTx } from "../db/client";
import { artworkAssets } from "../db/schema";
import { BUCKETS, storage, type Bucket } from "../storage";
import { createCanvas, ensureFonts, loadImage, loadPublicImage, serverMeasure } from "./canvas";
import type { ProductConfig } from "@/domain/catalogue";
import { assetIds, type DesignDoc, type Side } from "@/domain/design/schema";
import { composeMockup, drawSurface, printAreaOnMockup, type Img, type RenderCtx } from "@/domain/render/surface";

/**
 * Deterministic server rendering of a structured design — the production source of
 * truth. Uses the same layout/draw code and font files as the browser studio.
 */

type Quality = "preview" | "print";

/** Loads the design's images: editor previews for mockups, full processed files for print. */
async function loadDesignImages(db: DbOrTx, doc: DesignDoc, quality: Quality) {
  const ids = assetIds(doc);
  const images = new Map<string, Img>();
  if (!ids.length) return images;
  const rows = await db.select().from(artworkAssets).where(inArray(artworkAssets.id, ids));
  await Promise.all(
    rows.map(async (a) => {
      const key = quality === "preview" && a.previewKey ? a.previewKey : a.storageKey;
      const data = await storage().get(a.bucket as Bucket, key);
      if (!data) throw new Error(`Artwork file missing for asset ${a.id}`);
      images.set(a.id, (await loadImage(data)) as unknown as Img);
    }),
  );
  const missing = ids.filter((id) => !images.has(id));
  if (missing.length) throw new Error(`Artwork missing: ${missing.join(", ")}`);
  return images;
}

function areaOf(product: ProductConfig, side: Side, code: string) {
  const a = product.printAreas.find((x) => x.side === side && x.code === code);
  if (!a) throw new Error(`Unknown print area ${code} on ${side}`);
  return a;
}

/** Garment mockup with the design, as WebP of the given width. */
export async function renderMockup(
  db: DbOrTx,
  input: { product: ProductConfig; doc: DesignDoc; side: Side; width: number; colourHex?: string },
): Promise<Buffer> {
  ensureFonts();
  const { product, doc, side } = input;
  const m = product.mockups[side];
  const [mask, shade, highlight] = await Promise.all([loadPublicImage(m.maskUrl), loadPublicImage(m.shadeUrl), loadPublicImage(m.highlightUrl)]);
  const images = await loadDesignImages(db, doc, "preview");
  const surface = doc.surfaces[side];
  const area = areaOf(product, side, surface.printAreaCode);
  const p = printAreaOnMockup(area, { width: m.widthPx, height: m.heightPx });
  const hex = input.colourHex ?? product.colours.find((c) => c.id === doc.colourId)?.hex ?? "#FFFFFF";

  const canvas = createCanvas(m.widthPx, m.heightPx);
  composeMockup(
    canvas as never,
    { mask: mask as unknown as Img, shade: shade as unknown as Img, highlight: highlight as unknown as Img },
    hex,
    (ctx: RenderCtx) => {
      ctx.save();
      ctx.translate(p.left, p.top);
      drawSurface(ctx, surface, { pxPerMm: p.pxPerMm, measure: serverMeasure(), images, clip: { width: area.widthMm, height: area.heightMm } });
      ctx.restore();
    },
  );
  const png = canvas.toBuffer("image/png");
  return sharp(png).resize({ width: input.width }).webp({ quality: 85 }).toBuffer();
}

/** Cached mockup preview for an immutable design version. */
export async function versionPreview(
  db: DbOrTx,
  input: { versionId: string; product: ProductConfig; doc: DesignDoc; side: Side; width: number },
): Promise<Buffer> {
  const key = `${input.versionId}/${input.side}-${input.width}.webp`;
  const cached = await storage().get(BUCKETS.previews, key);
  if (cached) return cached;
  const buf = await renderMockup(db, input);
  await storage().put(BUCKETS.previews, key, buf, "image/webp");
  return buf;
}

export const toDataUrl = (buf: Buffer, mime = "image/webp") => `data:${mime};base64,${buf.toString("base64")}`;

/**
 * Print artwork for one surface: transparent PNG at the physical print-area size
 * and the requested DPI, full-resolution artwork, nothing but the design.
 */
export async function renderPrintFile(
  db: DbOrTx,
  input: { product: ProductConfig; doc: DesignDoc; side: Side; dpi: number },
): Promise<{ png: Buffer; widthPx: number; heightPx: number; widthMm: number; heightMm: number }> {
  ensureFonts();
  const surface = input.doc.surfaces[input.side];
  const area = areaOf(input.product, input.side, surface.printAreaCode);
  const pxPerMm = input.dpi / 25.4;
  const widthPx = Math.round(area.widthMm * pxPerMm);
  const heightPx = Math.round(area.heightMm * pxPerMm);
  const images = await loadDesignImages(db, input.doc, "print");
  const canvas = createCanvas(widthPx, heightPx);
  const ctx = canvas.getContext("2d") as unknown as RenderCtx;
  drawSurface(ctx, surface, { pxPerMm, measure: serverMeasure(), images, clip: { width: area.widthMm, height: area.heightMm } });
  const raw = canvas.toBuffer("image/png");
  // embed the physical resolution so print software opens it at the right size
  const png = await sharp(raw).withMetadata({ density: input.dpi }).png({ compressionLevel: 6 }).toBuffer();
  return { png, widthPx, heightPx, widthMm: area.widthMm, heightMm: area.heightMm };
}
