import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import sharp, { type Metadata, type OutputInfo } from "sharp";
import type { Db, DbOrTx } from "../db/client";
import { artworkAssets } from "../db/schema";
import { AppError } from "../errors";
import { BUCKETS, storage } from "../storage";
import { sha256Hex } from "../auth/crypto";
import { ACCEPTED_FORMATS, type AcceptedFormat } from "@/domain/artwork";
import type { Settings } from "@/domain/settings";

export const PREVIEW_MAX_PX = 1200;

export type UploadedAsset = {
  id: string; // processed asset id — what designs reference
  originalId: string;
  previewUrl: string;
  widthPx: number;
  heightPx: number;
  hasAlpha: boolean;
  mime: string;
  originalFilename: string | null;
};

const cleanName = (name: string | null) => (name ? name.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) : null);

/**
 * Validates and stores an upload.
 *  - format decided from the file's content (magic bytes via libvips), not its name
 *  - full decode with a pixel limit (rejects corrupt files and decompression bombs)
 *  - ORIGINAL kept byte-for-byte; PROCESSED = auto-oriented, metadata-stripped PNG;
 *    plus a small WebP preview for the editor
 */
export async function processUpload(
  db: Db,
  input: { data: Buffer; filename: string | null; ownerTokenHash: string; rules: Settings["artwork"] },
): Promise<UploadedAsset> {
  const { data, rules } = input;
  if (data.length === 0) throw new AppError("VALIDATION", "That file is empty.");
  if (data.length > rules.maxUploadBytes) {
    throw new AppError("VALIDATION", `That file is too large. The limit is ${Math.round(rules.maxUploadBytes / 1024 / 1024)} MB.`);
  }

  const opts = { limitInputPixels: rules.maxPixels, failOn: "error" as const };
  let format: AcceptedFormat;
  let meta: Metadata;
  try {
    meta = await sharp(data, opts).metadata();
    if (meta.format !== "png" && meta.format !== "jpeg") throw new Error("unsupported");
    if ((meta.pages ?? 1) > 1) throw new Error("animated");
    format = meta.format;
  } catch {
    throw new AppError("VALIDATION", "Please upload a PNG or JPG image. Other file types aren't supported yet.");
  }

  let processed: { data: Buffer; info: OutputInfo };
  let alphaUsed = false;
  try {
    processed = await sharp(data, opts).rotate().png({ compressionLevel: 6 }).toBuffer({ resolveWithObject: true });
    if (processed.info.channels === 4) {
      const stats = await sharp(processed.data).stats();
      alphaUsed = (stats.channels[3]?.min ?? 255) < 250;
    }
  } catch (err) {
    if (err instanceof Error && /pixel limit/i.test(err.message)) {
      throw new AppError("VALIDATION", "That image has too many pixels to process. Please resize it and try again.");
    }
    throw new AppError("VALIDATION", "That image couldn't be read. It may be damaged — please export it again and retry.");
  }
  const preview = await sharp(processed.data)
    .resize({ width: PREVIEW_MAX_PX, height: PREVIEW_MAX_PX, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 86, alphaQuality: 90 })
    .toBuffer();

  const originalId = randomUUID();
  const processedId = randomUUID();
  const ext = format === "png" ? "png" : "jpg";
  const originalKey = `${originalId}.${ext}`;
  const processedKey = `${processedId}.png`;
  const previewKey = `${processedId}-preview.webp`;

  const s = storage();
  await s.put(BUCKETS.originals, originalKey, data, ACCEPTED_FORMATS[format]);
  await s.put(BUCKETS.processed, processedKey, processed.data, "image/png");
  await s.put(BUCKETS.processed, previewKey, preview, "image/webp");

  const filename = cleanName(input.filename);
  await db.transaction(async (tx) => {
    await tx.insert(artworkAssets).values({
      id: originalId,
      kind: "ORIGINAL",
      ownerTokenHash: input.ownerTokenHash,
      bucket: BUCKETS.originals,
      storageKey: originalKey,
      mime: ACCEPTED_FORMATS[format],
      bytes: data.length,
      widthPx: meta.width ?? processed.info.width,
      heightPx: meta.height ?? processed.info.height,
      hasAlpha: !!meta.hasAlpha,
      sha256: sha256Hex(data),
      originalFilename: filename,
    });
    await tx.insert(artworkAssets).values({
      id: processedId,
      kind: "PROCESSED",
      parentAssetId: originalId,
      ownerTokenHash: input.ownerTokenHash,
      bucket: BUCKETS.processed,
      storageKey: processedKey,
      previewKey,
      mime: "image/png",
      bytes: processed.data.length,
      widthPx: processed.info.width,
      heightPx: processed.info.height,
      hasAlpha: alphaUsed,
      sha256: sha256Hex(processed.data),
      originalFilename: filename,
    });
  });

  return {
    id: processedId,
    originalId,
    previewUrl: previewUrl(processedId),
    widthPx: processed.info.width,
    heightPx: processed.info.height,
    hasAlpha: alphaUsed,
    mime: "image/png",
    originalFilename: filename,
  };
}

export const previewUrl = (assetId: string) => `/api/artwork/${assetId}/preview`;

export async function getAsset(db: DbOrTx, id: string) {
  const [row] = await db.select().from(artworkAssets).where(eq(artworkAssets.id, id)).limit(1);
  return row ?? null;
}

/** Processed assets owned by this owner, by id — used to validate designs. */
export async function ownedProcessedAssets(db: DbOrTx, ownerTokenHash: string, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select()
    .from(artworkAssets)
    .where(and(inArray(artworkAssets.id, ids), eq(artworkAssets.kind, "PROCESSED"), eq(artworkAssets.ownerTokenHash, ownerTokenHash)));
}

export function toClientAsset(row: typeof artworkAssets.$inferSelect) {
  return {
    id: row.id,
    previewUrl: previewUrl(row.id),
    widthPx: row.widthPx,
    heightPx: row.heightPx,
    hasAlpha: row.hasAlpha,
    mime: row.mime,
    originalFilename: row.originalFilename,
  };
}
