import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { createTestDb } from "../support/db";
import { product, useTempStorage } from "../support/fixtures";
import type { Db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { resetEnvCache } from "@/server/env";
import { AppError } from "@/server/errors";
import { FixtureImageProvider } from "@/server/ai/image-generation/fixture";
import { OpenAIImageProvider } from "@/server/ai/image-generation/openai";
import { GeminiImageProvider } from "@/server/ai/image-generation/gemini";
import { removeFlatBackground } from "@/server/ai/image-generation/background";
import { ProviderError, type GenerateArtworkInput, type ImageGenerationProvider } from "@/server/ai/image-generation/types";
import {
  AI_MESSAGES,
  GenerationFailed,
  listGenerations,
  markSelected,
  prepareGeneration,
  runGeneration,
  type GenerationInput,
} from "@/server/services/ai-generation";
import type { ProductConfig } from "@/domain/catalogue";

let db: Db;
let crew: ProductConfig;
const bob = "b".repeat(64);
const signal = () => new AbortController().signal;

beforeAll(async () => {
  process.env.AI_MAX_GENERATIONS_PER_SESSION = "4";
  process.env.AI_VARIATIONS = "2";
  resetEnvCache();
  useTempStorage();
  db = await createTestDb();
  crew = await product(db);
});

const input = (over: Partial<GenerationInput> = {}): GenerationInput => ({
  prompt: "A fierce streetwear tiger with the words STAY WILD",
  orientation: "auto",
  lettering: false,
  productId: crew.id,
  colourId: crew.colours.find((c) => c.name === "Black")!.id,
  side: "front",
  printAreaCode: crew.printAreas.find((a) => a.side === "front" && a.isDefault)!.code,
  printMethodCode: "DTF",
  ...over,
});

class FailingProvider implements ImageGenerationProvider {
  readonly name = "broken";
  readonly model = "x";
  readonly supportsTransparency = true;
  calls = 0;
  constructor(private readonly kind: ProviderError["kind"]) {}
  async generateArtwork(): Promise<never> {
    this.calls++;
    throw new ProviderError(this.kind, "secret internal detail sk-123");
  }
}

let ownerSeq = 0;
const freshOwner = () => `${(++ownerSeq).toString(16).padStart(4, "0")}`.padEnd(64, "c");

describe("AI generation service", () => {
  it("generates variations, stores them as AI artwork and records history", async () => {
    const owner = freshOwner();
    const stages: string[] = [];
    const prep = await prepareGeneration(db, { ownerTokenHash: owner, ip: "1.1.1.1", input: input(), providers: [new FixtureImageProvider()] });
    expect(prep.prompt).toMatch(/dark\) shirt/);
    expect(prep.prompt).not.toContain("STAY WILD");
    const gen = await runGeneration(db, prep, { signal: signal(), onStage: (s) => stages.push(s), providers: [new FixtureImageProvider()] });

    expect(stages).toEqual(["generating", "processing"]);
    expect(gen.images).toHaveLength(2);
    expect(gen.textRequests).toEqual(["STAY WILD"]);
    for (const img of gen.images) {
      expect(img.asset.hasAlpha).toBe(true);
      expect(img.asset.previewUrl).toMatch(/^\/api\/artwork\//);
      const [row] = await db.select().from(t.artworkAssets).where(eq(t.artworkAssets.id, img.asset.id));
      expect(row).toMatchObject({ source: "AI", kind: "PROCESSED", ownerTokenHash: owner });
      // the provider's original output is kept too
      const [orig] = await db.select().from(t.artworkAssets).where(eq(t.artworkAssets.id, row.parentAssetId!));
      expect(orig).toMatchObject({ source: "AI", kind: "ORIGINAL" });
    }
    const [g] = await db.select().from(t.aiGenerations).where(eq(t.aiGenerations.id, gen.id));
    expect(g).toMatchObject({ status: "SUCCEEDED", provider: "fixture", model: "fixture-artwork-v1", printMethodCode: "DTF" });
    expect(g.finalPrompt).toMatch(/Transparent background/);

    const history = await listGenerations(db, owner);
    expect(history.map((h) => h.id)).toEqual([gen.id]);
    expect(await listGenerations(db, bob)).toEqual([]);

    await markSelected(db, owner, gen.images[0].id, null);
    expect((await listGenerations(db, owner))[0].images[0].selected).toBe(true);
    await expect(markSelected(db, bob, gen.images[0].id, null)).rejects.toBeInstanceOf(AppError);
  });

  it("falls back to the next provider when the primary is unavailable", async () => {
    const broken = new FailingProvider("UNAVAILABLE");
    const providers = [broken, new FixtureImageProvider()];
    const prep = await prepareGeneration(db, { ownerTokenHash: freshOwner(), ip: null, input: input(), providers });
    const gen = await runGeneration(db, prep, { signal: signal(), providers });
    expect(broken.calls).toBe(1);
    expect(gen.images.length).toBeGreaterThan(0);
  });

  it("never retries a safety refusal elsewhere, and shows the friendly message", async () => {
    const refusing = new FailingProvider("REFUSED");
    const backup = new FailingProvider("UNAVAILABLE");
    const providers = [refusing, backup];
    const prep = await prepareGeneration(db, { ownerTokenHash: freshOwner(), ip: null, input: input(), providers });
    const err = await runGeneration(db, prep, { signal: signal(), providers }).catch((e) => e);
    expect(err).toBeInstanceOf(GenerationFailed);
    expect(err.message).toBe(AI_MESSAGES.refused);
    expect(backup.calls).toBe(0);
    const [g] = await db.select().from(t.aiGenerations).where(eq(t.aiGenerations.id, prep.id));
    expect(g.status).toBe("REFUSED");
  });

  it("hides internal provider errors", async () => {
    const providers = [new FailingProvider("BAD_RESPONSE")];
    const prep = await prepareGeneration(db, { ownerTokenHash: freshOwner(), ip: null, input: input(), providers });
    const err = await runGeneration(db, prep, { signal: signal(), providers }).catch((e) => e);
    expect(err.message).toBe(AI_MESSAGES.failed);
    expect(JSON.stringify(err)).not.toContain("sk-123");
  });

  it("enforces the per-session generation limit (failures don't count)", async () => {
    const owner = freshOwner();
    const failing = [new FailingProvider("UNAVAILABLE")];
    const prepFail = await prepareGeneration(db, { ownerTokenHash: owner, ip: null, input: input(), providers: failing });
    await runGeneration(db, prepFail, { signal: signal(), providers: failing }).catch(() => null);
    for (let i = 0; i < 4; i++) await prepareGeneration(db, { ownerTokenHash: owner, ip: null, input: input(), providers: [new FixtureImageProvider()] });
    const err = await prepareGeneration(db, { ownerTokenHash: owner, ip: null, input: input(), providers: [new FixtureImageProvider()] }).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("RATE_LIMITED");
  });

  it("rejects product context that doesn't exist, and other owners' parents / references", async () => {
    const p = [new FixtureImageProvider()];
    const bad = await prepareGeneration(db, { ownerTokenHash: freshOwner(), ip: null, input: input({ printAreaCode: "NOPE" }), providers: p }).catch((e) => e);
    expect(bad.code).toBe("VALIDATION");

    const owner = freshOwner();
    const prep = await prepareGeneration(db, { ownerTokenHash: owner, ip: null, input: input(), providers: p });
    const gen = await runGeneration(db, prep, { signal: signal(), providers: p });
    const thief = freshOwner();
    expect((await prepareGeneration(db, { ownerTokenHash: thief, ip: null, input: input({ parentGenerationId: gen.id }), providers: p }).catch((e) => e)).code).toBe("NOT_FOUND");
    expect((await prepareGeneration(db, { ownerTokenHash: thief, ip: null, input: input({ referenceAssetId: gen.images[0].asset.id }), providers: p }).catch((e) => e)).code).toBe("NOT_FOUND");

    // the owner can refine and generate similar
    const refine = await prepareGeneration(db, { ownerTokenHash: owner, ip: null, input: input({ parentGenerationId: gen.id, refinement: "make it blue" }), providers: p });
    expect(refine.prompt).toMatch(/Revision request: make it blue/);
    expect(refine.requirements.colours).toEqual(["blue"]);
    const similar = await prepareGeneration(db, { ownerTokenHash: owner, ip: null, input: input({ parentGenerationId: gen.id, referenceAssetId: gen.images[0].asset.id }), providers: p });
    expect(similar.reference?.data.length).toBeGreaterThan(0);
  });

  it("cancels cleanly", async () => {
    const p = [new FixtureImageProvider(5_000)];
    const prep = await prepareGeneration(db, { ownerTokenHash: freshOwner(), ip: null, input: input(), providers: p });
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 50);
    const err = await runGeneration(db, prep, { signal: ctrl.signal, providers: p }).catch((e) => e);
    expect(err.reason).toBe("CANCELLED");
    const [g] = await db.select().from(t.aiGenerations).where(eq(t.aiGenerations.id, prep.id));
    expect(g.status).toBe("CANCELLED");
  });
});

const baseInput = (over: Partial<GenerateArtworkInput> = {}): GenerateArtworkInput => ({
  prompt: "art",
  negativePrompt: [],
  style: null,
  aspectRatio: "portrait",
  size: { width: 1024, height: 1280 },
  count: 2,
  productContext: { productName: "Tee", side: "front" },
  printArea: { name: "Full front", widthMm: 290, heightMm: 360 },
  shirtColour: { name: "Black", hex: "#111111" },
  printMethod: "DTF",
  endUser: "u",
  signal: new AbortController().signal,
  ...over,
});

describe("provider adapters", () => {
  afterEach(() => vi.unstubAllGlobals());
  const png = () => sharp({ create: { width: 8, height: 8, channels: 4, background: "#ff000000" } }).png().toBuffer();

  it("OpenAI: requests transparent PNG artwork at the print size", async () => {
    const b64 = (await png()).toString("base64");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: b64 }, { b64_json: b64 }] })));
    vi.stubGlobal("fetch", fetchMock);
    const out = await new OpenAIImageProvider("sk-test", "gpt-image-2.5-flare", "medium").generateArtwork(baseInput());
    expect(out).toHaveLength(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: "gpt-image-2.5-flare", n: 2, size: "1024x1280", background: "transparent", output_format: "png", moderation: "auto" });
  });

  it("OpenAI: moderation rejections become refusals", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "moderation_blocked", message: "Your request was rejected by our safety system" } }), { status: 400 })));
    const err = await new OpenAIImageProvider("k", "m", "medium").generateArtwork(baseInput()).catch((e) => e);
    expect(err.kind).toBe("REFUSED");
  });

  it("OpenAI: falls back to an older image model when the key can't use the newest one", async () => {
    const b64 = (await png()).toString("base64");
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (body.model === "gpt-image-2.5-flare") return new Response(JSON.stringify({ error: { message: "Your organization must be verified to use the model", code: null } }), { status: 403 });
      return new Response(JSON.stringify({ data: [{ b64_json: b64 }] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAIImageProvider("k", "gpt-image-2.5-flare", "medium");
    const out = await provider.generateArtwork(baseInput());
    expect(out).toHaveLength(1);
    expect(provider.model).toBe("gpt-image-1.5");
    const second = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(second.size).toBe("1024x1536"); // older models only take standard sizes
  });

  it("OpenAI: explains a wrong key or an account without credit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Incorrect API key provided" } }), { status: 401 })));
    const bad = await new OpenAIImageProvider("k", "m", "medium").generateArtwork(baseInput()).catch((e) => e);
    expect(bad).toMatchObject({ kind: "CONFIG" });
    expect(bad.detail).toMatch(/OPENAI_API_KEY/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "insufficient_quota", message: "You exceeded your current quota" } }), { status: 429 })));
    const broke = await new OpenAIImageProvider("k", "m", "medium").generateArtwork(baseInput()).catch((e) => e);
    expect(broke.detail).toMatch(/no available credit/);
  });

  it("Gemini: parses inline images and maps blocked prompts to refusals", async () => {
    const b64 = (await png()).toString("base64");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: b64 } }] } }] }))));
    const out = await new GeminiImageProvider("k", "gemini-3.1-flash-image").generateArtwork(baseInput());
    expect(out).toHaveLength(2);
    expect(out[0].transparent).toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }))));
    const err = await new GeminiImageProvider("k", "m").generateArtwork(baseInput()).catch((e) => e);
    expect(err.kind).toBe("REFUSED");
  });

  it("lifts a flat background but keeps the artwork", async () => {
    const img = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#000"/><circle cx="100" cy="100" r="60" fill="#F97360"/><circle cx="100" cy="100" r="20" fill="#000"/></svg>`))
      .png()
      .toBuffer();
    const out = await removeFlatBackground(img);
    expect(out).not.toBeNull();
    const { data, info } = await sharp(out!).raw().toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    expect(alpha(2, 2)).toBe(0); // background gone
    expect(alpha(100, 60)).toBe(255); // artwork kept
    expect(alpha(100, 100)).toBe(255); // enclosed black detail kept
    // busy images are left alone
    const noisy = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 60 } } }).png().toBuffer();
    expect(await removeFlatBackground(noisy)).toBeNull();
  });
});
