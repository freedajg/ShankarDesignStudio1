import "server-only";
import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import * as t from "../db/schema";
import { AppError } from "../errors";
import { env } from "../env";
import { storage, type Bucket } from "../storage";
import { removeFlatBackground } from "../ai/image-generation/background";
import { imageProviders, ProviderError, type GeneratedImage, type ImageGenerationProvider } from "../ai/image-generation/registry";
import { getAsset, processUpload, toClientAsset } from "./artwork";
import { loadProductConfig, loadSettings } from "./catalogue";
import { enforce } from "./rate-limit";
import { AI_ORIENTATIONS, AI_STYLES, ruleBasedInterpreter, type ArtworkContext, type ArtworkRequirements } from "@/domain/ai/interpreter";
import { buildImagePrompt, requestedPixelSize } from "@/domain/ai/prompt-builder";
import { guidanceFor } from "@/domain/ai/print-guidance";
import { artworkWarnings, type ArtworkWarning } from "@/domain/artwork";

/**
 * AI design generation: prompt → interpreted requirements → enhanced prompt →
 * provider (with fallback) → the same validated storage pipeline as uploads →
 * history rows. The result is ordinary artwork the studio inserts like an upload.
 */

export const AI_MESSAGES = {
  failed: "Something went wrong while creating your artwork. Your design is safe. Please try again.",
  refused: "This request can't be generated. Try describing a different design idea.",
  disabled: "AI design generation isn't switched on for this shop yet.",
  cancelled: "Generation cancelled.",
} as const;

/** Window over which AI_MAX_GENERATIONS_PER_SESSION applies. */
const LIMIT_WINDOW_HOURS = 24;

export const generationInput = z.object({
  prompt: z.string().trim().min(3, "Describe your idea in a few words.").max(600, "Please keep your description under 600 characters."),
  style: z.enum(AI_STYLES).nullish(),
  orientation: z.enum(AI_ORIENTATIONS).default("auto"),
  lettering: z.boolean().default(false),
  refinement: z.string().trim().max(300, "Please keep your changes under 300 characters.").nullish(),
  /** previous generation this one refines or varies */
  parentGenerationId: z.string().uuid().nullish(),
  /** "generate similar": an AI image the customer already has */
  referenceAssetId: z.string().uuid().nullish(),
  productId: z.string().uuid(),
  colourId: z.string().uuid(),
  side: z.enum(["front", "back"]),
  printAreaCode: z.string().min(1).max(40),
  printMethodCode: z.string().min(1).max(40),
});
export type GenerationInput = z.infer<typeof generationInput>;

export type GenerationStage = "interpreting" | "generating" | "processing";

export type GenerationImageDto = {
  id: string;
  asset: ReturnType<typeof toClientAsset>;
  warnings: ArtworkWarning[];
  selected: boolean;
};

export type GenerationDto = {
  id: string;
  parentGenerationId: string | null;
  prompt: string;
  refinement: string | null;
  style: string | null;
  orientation: string | null;
  lettering: boolean;
  /** words the customer asked for — offered as editable canvas text */
  textRequests: string[];
  createdAt: string;
  images: GenerationImageDto[];
};

export type Prepared = {
  id: string;
  ownerTokenHash: string;
  requirements: ArtworkRequirements;
  prompt: string;
  negative: string[];
  size: { width: number; height: number };
  reference: { data: Buffer; mime: string } | null;
  context: ArtworkContext;
  count: number;
  input: GenerationInput;
  parentId: string | null;
};

export async function aiStatus(db: Db, ownerTokenHash: string | null) {
  const e = env();
  const enabled = imageProviders().length > 0 && e.AI_MAX_GENERATIONS_PER_SESSION > 0;
  const used = ownerTokenHash ? await usedGenerations(db, ownerTokenHash) : 0;
  return {
    enabled,
    limit: e.AI_MAX_GENERATIONS_PER_SESSION,
    used,
    remaining: Math.max(0, e.AI_MAX_GENERATIONS_PER_SESSION - used),
    variations: e.AI_VARIATIONS,
    // demo sites are shown to the shop owner: say how to switch AI on
    setupHint: !enabled && e.DEMO_MODE,
  };
}

/** For staff: is AI switched on, and how have recent generations gone? */
export async function aiStaffStatus(db: Db) {
  const e = env();
  const providers = imageProviders().map((p) => ({ name: p.name, model: p.model }));
  const since = new Date(Date.now() - 7 * 24 * 3600_000);
  const counts = await db
    .select({ status: t.aiGenerations.status, n: sql<number>`count(*)::int` })
    .from(t.aiGenerations)
    .where(gte(t.aiGenerations.createdAt, since))
    .groupBy(t.aiGenerations.status);
  const [lastFailure] = await db
    .select({ at: t.aiGenerations.createdAt, errorCode: t.aiGenerations.errorCode })
    .from(t.aiGenerations)
    .where(eq(t.aiGenerations.status, "FAILED"))
    .orderBy(desc(t.aiGenerations.createdAt))
    .limit(1);
  const [lastSuccess] = await db
    .select({ at: t.aiGenerations.createdAt, provider: t.aiGenerations.provider, model: t.aiGenerations.model })
    .from(t.aiGenerations)
    .where(eq(t.aiGenerations.status, "SUCCEEDED"))
    .orderBy(desc(t.aiGenerations.createdAt))
    .limit(1);
  return {
    enabled: providers.length > 0 && e.AI_MAX_GENERATIONS_PER_SESSION > 0,
    providers,
    limit: e.AI_MAX_GENERATIONS_PER_SESSION,
    week: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Partial<Record<string, number>>,
    lastFailure: lastFailure ?? null,
    lastSuccess: lastSuccess ?? null,
  };
}

/** Staff-facing failure reason (stored in ai_generations.error_code; never shown to customers). */
function staffReason(err: ProviderError | null) {
  if (!err) return "UNAVAILABLE";
  const detail = err.detail.replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-…").slice(0, 240);
  return `${err.kind}: ${detail}`;
}

async function usedGenerations(db: Db, ownerTokenHash: string) {
  const since = new Date(Date.now() - LIMIT_WINDOW_HOURS * 3600_000);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.aiGenerations)
    // failures on our/provider side don't count against the customer
    .where(and(eq(t.aiGenerations.ownerTokenHash, ownerTokenHash), gte(t.aiGenerations.createdAt, since), ne(t.aiGenerations.status, "FAILED")));
  return n;
}

/**
 * Validates everything and reserves a generation slot. Product context comes
 * from the database, never from the client. Throws AppError before any cost.
 */
export async function prepareGeneration(
  db: Db,
  opts: { ownerTokenHash: string; ip: string | null; input: GenerationInput; providers?: ImageGenerationProvider[] },
): Promise<Prepared> {
  const e = env();
  const { input, ownerTokenHash } = opts;
  const providers = opts.providers ?? imageProviders();
  if (!providers.length || e.AI_MAX_GENERATIONS_PER_SESSION <= 0) throw new AppError("UNAVAILABLE", AI_MESSAGES.disabled);

  await enforce(db, `ai:owner:${ownerTokenHash}`, 6, 60, "You're generating designs very quickly. Please wait a minute and try again.");
  await enforce(db, `ai:ip:${opts.ip ?? "unknown"}`, 40, 60 * 60, "Too many AI designs from your network. Please try again later.");

  const product = await loadProductConfig(db, { id: input.productId });
  if (!product) throw new AppError("VALIDATION", "That product isn't available.");
  const colour = product.colours.find((c) => c.id === input.colourId);
  const area = product.printAreas.find((a) => a.code === input.printAreaCode && a.side === input.side && a.isActive);
  const method = product.printMethods.find((m) => m.code === input.printMethodCode);
  if (!colour || !area || !method) throw new AppError("VALIDATION", "Those product options aren't available.");

  let previous: ArtworkRequirements | null = null;
  let parentId: string | null = null;
  if (input.parentGenerationId) {
    const [parent] = await db
      .select()
      .from(t.aiGenerations)
      .where(and(eq(t.aiGenerations.id, input.parentGenerationId), eq(t.aiGenerations.ownerTokenHash, ownerTokenHash)))
      .limit(1);
    if (!parent) throw new AppError("NOT_FOUND", "That earlier design could not be found.");
    previous = parent.interpretation as ArtworkRequirements;
    parentId = parent.id;
  }

  let reference: Prepared["reference"] = null;
  if (input.referenceAssetId) {
    const asset = await getAsset(db, input.referenceAssetId);
    if (!asset || asset.kind !== "PROCESSED" || asset.ownerTokenHash !== ownerTokenHash) throw new AppError("NOT_FOUND", "That design could not be found.");
    const data = await storage().get(asset.bucket as Bucket, asset.storageKey);
    if (!data) throw new AppError("NOT_FOUND", "That design could not be found.");
    reference = { data, mime: "image/png" };
  }

  const context: ArtworkContext = {
    productName: product.name,
    shirtColourName: colour.name,
    shirtColourHex: colour.hex,
    side: input.side,
    printAreaName: area.name,
    printAreaWidthMm: area.widthMm,
    printAreaHeightMm: area.heightMm,
    printMethodCode: method.code,
  };
  const requirements = ruleBasedInterpreter.interpret(
    { prompt: input.prompt, style: input.style ?? null, orientation: input.orientation, lettering: input.lettering, refinement: input.refinement ?? null },
    context,
    previous,
  );
  const { prompt, negative } = buildImagePrompt(requirements);
  const size = requestedPixelSize(requirements);

  // reserve the slot first, then count, so parallel requests can't slip past the limit
  const [row] = await db
    .insert(t.aiGenerations)
    .values({
      ownerTokenHash,
      parentGenerationId: parentId,
      referenceAssetId: input.referenceAssetId ?? null,
      prompt: input.prompt,
      refinement: input.refinement ?? null,
      style: input.style ?? null,
      orientation: input.orientation,
      lettering: input.lettering,
      interpretation: requirements,
      finalPrompt: prompt,
      productId: product.id,
      colourId: colour.id,
      printAreaCode: area.code,
      printMethodCode: method.code,
    })
    .returning({ id: t.aiGenerations.id });
  if ((await usedGenerations(db, ownerTokenHash)) > e.AI_MAX_GENERATIONS_PER_SESSION) {
    await db.delete(t.aiGenerations).where(eq(t.aiGenerations.id, row.id));
    throw new AppError(
      "RATE_LIMITED",
      `You've created ${e.AI_MAX_GENERATIONS_PER_SESSION} AI designs today, which is the limit for now. You can still use the ones you made, upload artwork or add text.`,
    );
  }

  return { id: row.id, ownerTokenHash, requirements, prompt, negative, size, reference, context, count: e.AI_VARIATIONS, input, parentId };
}

export class GenerationFailed extends Error {
  constructor(
    readonly reason: "REFUSED" | "CANCELLED" | "FAILED",
    readonly customerMessage: string,
  ) {
    super(customerMessage);
    this.name = "GenerationFailed";
  }
}

/** Calls the providers (primary → fallback), stores the images and records history. */
export async function runGeneration(
  db: Db,
  prep: Prepared,
  opts: { signal: AbortSignal; onStage?: (stage: GenerationStage) => void; providers?: ImageGenerationProvider[] },
): Promise<GenerationDto> {
  const started = Date.now();
  const providers = opts.providers ?? imageProviders();
  const signal = AbortSignal.any([opts.signal, AbortSignal.timeout(env().AI_TIMEOUT_MS)]);
  const finish = (values: Partial<typeof t.aiGenerations.$inferInsert>) =>
    db
      .update(t.aiGenerations)
      .set({ ...values, completedAt: new Date(), durationMs: Date.now() - started })
      .where(eq(t.aiGenerations.id, prep.id));

  opts.onStage?.("generating");
  let images: GeneratedImage[] | null = null;
  let used: ImageGenerationProvider | null = null;
  let lastError: ProviderError | null = null;
  for (const provider of providers) {
    try {
      images = await provider.generateArtwork({
        prompt: prep.prompt,
        negativePrompt: prep.negative,
        style: prep.requirements.style,
        aspectRatio: prep.requirements.orientation,
        size: prep.size,
        count: prep.count,
        referenceImage: prep.reference,
        productContext: { productName: prep.context.productName, side: prep.context.side },
        printArea: { name: prep.context.printAreaName, widthMm: prep.context.printAreaWidthMm, heightMm: prep.context.printAreaHeightMm },
        shirtColour: { name: prep.context.shirtColourName, hex: prep.context.shirtColourHex },
        printMethod: prep.context.printMethodCode,
        endUser: prep.ownerTokenHash.slice(0, 32),
        signal,
      });
      used = provider;
      break;
    } catch (err) {
      lastError = err instanceof ProviderError ? err : new ProviderError("BAD_RESPONSE", err instanceof Error ? err.message : String(err));
      console.warn(`[ai] ${provider.name}/${provider.model} failed: ${lastError.kind} ${lastError.detail}`);
      // a safety refusal is final: never shop the same request around to another provider
      if (lastError.kind === "REFUSED" || lastError.kind === "CANCELLED" || lastError.kind === "TIMEOUT") break;
    }
  }

  if (!images || !used) {
    const kind = lastError?.kind ?? "UNAVAILABLE";
    if (kind === "REFUSED") {
      await finish({ status: "REFUSED", errorCode: staffReason(lastError), provider: providers[0]?.name, model: providers[0]?.model });
      throw new GenerationFailed("REFUSED", AI_MESSAGES.refused);
    }
    if (kind === "CANCELLED" && opts.signal.aborted) {
      await finish({ status: "CANCELLED", errorCode: kind });
      throw new GenerationFailed("CANCELLED", AI_MESSAGES.cancelled);
    }
    await finish({ status: "FAILED", errorCode: staffReason(lastError), provider: providers[providers.length - 1]?.name, model: providers[providers.length - 1]?.model });
    throw new GenerationFailed("FAILED", AI_MESSAGES.failed);
  }

  opts.onStage?.("processing");
  try {
    const rules = (await loadSettings(db)).artwork;
    const saved: Awaited<ReturnType<typeof processUpload>>[] = [];
    for (const [i, img] of images.entries()) {
      const needsBackgroundLift = !img.transparent;
      const asset = await processUpload(db, {
        data: /^image\/(png|jpeg)$/.test(img.mime) ? img.data : await toPng(img.data),
        filename: `ai-design-${i + 1}.png`,
        ownerTokenHash: prep.ownerTokenHash,
        rules,
        source: "AI",
        transform: needsBackgroundLift ? (png) => removeFlatBackground(png).catch(() => null) : undefined,
      });
      saved.push(asset);
    }
    const rows = await db
      .insert(t.aiGenerationImages)
      .values(saved.map((a, position) => ({ generationId: prep.id, position, assetId: a.id })))
      .returning();
    await finish({ status: "SUCCEEDED", provider: used.name, model: used.model });

    const placedWidth = prep.context.printAreaWidthMm * 0.7;
    return {
      ...dtoBase(prep),
      images: rows.map((r, i) => {
        const a = saved[i];
        return {
          id: r.id,
          asset: { id: a.id, previewUrl: a.previewUrl, widthPx: a.widthPx, heightPx: a.heightPx, hasAlpha: a.hasAlpha, mime: a.mime, originalFilename: a.originalFilename, source: "AI" as const },
          warnings: artworkWarnings(a, placedWidth, rules),
          selected: false,
        };
      }),
    };
  } catch (err) {
    console.error("[ai] storing generated images failed", err);
    await finish({ status: "FAILED", errorCode: "STORAGE", provider: used.name, model: used.model });
    throw new GenerationFailed("FAILED", AI_MESSAGES.failed);
  }
}

function dtoBase(prep: Prepared) {
  return {
    id: prep.id,
    parentGenerationId: prep.parentId,
    prompt: prep.input.prompt,
    refinement: prep.requirements.refinement,
    style: prep.input.style ?? null,
    orientation: prep.input.orientation,
    lettering: prep.requirements.letteringInImage,
    textRequests: prep.requirements.letteringInImage ? [] : prep.requirements.textRequests,
    createdAt: new Date().toISOString(),
  };
}

async function toPng(data: Buffer) {
  const sharp = (await import("sharp")).default;
  return sharp(data).png().toBuffer();
}

/** The owner's recent successful generations, newest first. */
export async function listGenerations(db: Db, ownerTokenHash: string, limit = 12): Promise<GenerationDto[]> {
  const gens = await db
    .select()
    .from(t.aiGenerations)
    .where(and(eq(t.aiGenerations.ownerTokenHash, ownerTokenHash), eq(t.aiGenerations.status, "SUCCEEDED")))
    .orderBy(desc(t.aiGenerations.createdAt))
    .limit(limit);
  if (!gens.length) return [];
  const imgs = await db
    .select({ img: t.aiGenerationImages, asset: t.artworkAssets })
    .from(t.aiGenerationImages)
    .innerJoin(t.artworkAssets, eq(t.artworkAssets.id, t.aiGenerationImages.assetId))
    .where(
      inArray(
        t.aiGenerationImages.generationId,
        gens.map((g) => g.id),
      ),
    )
    .orderBy(t.aiGenerationImages.position);
  return gens.map((g) => {
    const req = g.interpretation as ArtworkRequirements;
    return {
      id: g.id,
      parentGenerationId: g.parentGenerationId,
      prompt: g.prompt,
      refinement: g.refinement,
      style: g.style,
      orientation: g.orientation,
      lettering: g.lettering,
      textRequests: g.lettering ? [] : (req.textRequests ?? []),
      createdAt: g.createdAt.toISOString(),
      images: imgs
        .filter((r) => r.img.generationId === g.id)
        .map((r) => ({ id: r.img.id, asset: toClientAsset(r.asset), warnings: [], selected: !!r.img.selectedAt })),
    };
  });
}

/** Records that the customer placed a variation on their design. */
export async function markSelected(db: Db, ownerTokenHash: string, imageId: string, designId: string | null) {
  const [row] = await db
    .select({ img: t.aiGenerationImages })
    .from(t.aiGenerationImages)
    .innerJoin(t.aiGenerations, eq(t.aiGenerations.id, t.aiGenerationImages.generationId))
    .where(and(eq(t.aiGenerationImages.id, imageId), eq(t.aiGenerations.ownerTokenHash, ownerTokenHash)))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "That design could not be found.");
  await db
    .update(t.aiGenerationImages)
    .set({ selectedAt: row.img.selectedAt ?? new Date(), designId: designId ?? row.img.designId })
    .where(eq(t.aiGenerationImages.id, imageId));
}

/** For staff: which assets in a set were AI-generated, with the prompt that made them. */
export async function aiOriginOf(db: Db, assetIds: string[]) {
  if (!assetIds.length) return new Map<string, { prompt: string; provider: string | null; model: string | null }>();
  const rows = await db
    .select({ assetId: t.aiGenerationImages.assetId, prompt: t.aiGenerations.prompt, provider: t.aiGenerations.provider, model: t.aiGenerations.model })
    .from(t.aiGenerationImages)
    .innerJoin(t.aiGenerations, eq(t.aiGenerations.id, t.aiGenerationImages.generationId))
    .where(inArray(t.aiGenerationImages.assetId, assetIds));
  return new Map(rows.map((r) => [r.assetId, { prompt: r.prompt, provider: r.provider, model: r.model }]));
}

export const printGuidanceSummary = (methodCode: string) => guidanceFor(methodCode).summary;
