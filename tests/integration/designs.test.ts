import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { createTestDb } from "../support/db";
import { doc, fixture, product, textEl, uploadLogo, useTempStorage } from "../support/fixtures";
import type { Db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { loadSettings } from "@/server/services/catalogue";
import { processUpload } from "@/server/services/artwork";
import { createDesign, createVersion, getOwnedDesign, getVersion, saveDraft } from "@/server/services/designs";
import { renderMockup, renderPrintFile } from "@/server/render/design";
import { AppError } from "@/server/errors";
import type { ProductConfig } from "@/domain/catalogue";

let db: Db;
let crew: ProductConfig;
const alice = { tokenHash: "a".repeat(64) };
const mallory = { tokenHash: "m".repeat(64) };

beforeAll(async () => {
  useTempStorage();
  db = await createTestDb();
  crew = await product(db);
});

const code = (p: Promise<unknown>) => p.then(() => "ok", (e: AppError) => e.code);

describe("artwork upload", () => {
  it("accepts PNG with transparency and JPEG without; keeps original + processed + preview", async () => {
    const png = await uploadLogo(db, alice.tokenHash);
    expect(png).toMatchObject({ widthPx: 1200, heightPx: 1200, hasAlpha: true, mime: "image/png" });
    const jpg = await uploadLogo(db, alice.tokenHash, "photo.jpg");
    expect(jpg.hasAlpha).toBe(false);
    const rows = await db.select().from(t.artworkAssets).where(eq(t.artworkAssets.parentAssetId, jpg.originalId));
    expect(rows).toHaveLength(1);
    const [orig] = await db.select().from(t.artworkAssets).where(eq(t.artworkAssets.id, jpg.originalId));
    expect(orig.mime).toBe("image/jpeg");
    expect(orig.kind).toBe("ORIGINAL");
  });

  it("rejects non-images, wrong formats, and oversized files — by content, not name", async () => {
    const rules = (await loadSettings(db)).artwork;
    const up = (data: Buffer, filename: string, r = rules) => code(processUpload(db, { data, filename, ownerTokenHash: alice.tokenHash, rules: r }));
    expect(await up(fixture("not-an-image.png"), "not-an-image.png")).toBe("VALIDATION");
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#f00" } }).gif().toBuffer();
    expect(await up(gif, "sneaky.png")).toBe("VALIDATION");
    expect(await up(fixture("logo.png"), "logo.png", { ...rules, maxUploadBytes: 1000 })).toBe("VALIDATION");
    expect(await up(fixture("logo.png"), "logo.png", { ...rules, maxPixels: 1000 })).toBe("VALIDATION");
    expect(await up(Buffer.alloc(0), "empty.png")).toBe("VALIDATION");
  });
});

describe("designs", () => {
  it("creates, autosaves and reloads a draft for its owner only", async () => {
    const d = doc(crew, { front: [textEl()] });
    const { id } = await createDesign(db, alice, { doc: d, name: "Team tee" });
    const d2 = { ...d, colourId: crew.colours.find((c) => c.name === "Navy")!.id };
    await saveDraft(db, alice, id, { doc: d2 });
    const loaded = await getOwnedDesign(db, alice, id);
    expect(loaded.doc.colourId).toBe(d2.colourId);
    expect(loaded.doc.surfaces.front.elements).toHaveLength(1); // colour change kept the design
    expect(await code(getOwnedDesign(db, mallory, id))).toBe("NOT_FOUND");
    expect(await code(saveDraft(db, mallory, id, { doc: d2 }))).toBe("NOT_FOUND");
  });

  it("refuses artwork the owner didn't upload", async () => {
    const theirs = await uploadLogo(db, mallory.tokenHash);
    const d = doc(crew, { front: [{ id: "img1", type: "image", assetId: theirs.id, width: 100, height: 100, x: 140, y: 100, rotation: 0 }] });
    expect(await code(createDesign(db, alice, { doc: d }))).toBe("VALIDATION");
  });

  it("versions are strictly validated and immutable", async () => {
    const logo = await uploadLogo(db, alice.tokenHash);
    const good = doc(crew, {
      front: [textEl({ text: "FRONT" }), { id: "img1", type: "image", assetId: logo.id, width: 120, height: 120, x: 140, y: 200, rotation: 15 }],
      back: [textEl({ text: "BACK", y: 60 })],
    });
    const { id } = await createDesign(db, alice, { doc: good });
    const v1 = await createVersion(db, alice, id, { doc: good });
    expect(v1.version).toBe(1);

    const outside = doc(crew, { front: [textEl({ x: 275 })] });
    const err = await createVersion(db, alice, id, { doc: outside }).catch((e: AppError) => e);
    expect((err as AppError).code).toBe("VALIDATION");
    expect(((err as AppError).details as { issues: { code: string }[] }).issues[0].code).toBe("OUTSIDE_PRINT_AREA");

    expect(await code(createVersion(db, alice, id, { doc: doc(crew) }))).toBe("VALIDATION"); // empty = not printable

    const edited = { ...good, surfaces: { ...good.surfaces, back: { ...good.surfaces.back, elements: [] } } };
    const v2 = await createVersion(db, alice, id, { doc: edited });
    expect(v2.version).toBe(2);
    const again = await getVersion(db, v1.versionId);
    expect(again!.doc.surfaces.back.elements).toHaveLength(1); // v1 unchanged by the v2 edit
    const links = await db.select().from(t.designVersionAssets).where(eq(t.designVersionAssets.designVersionId, v1.versionId));
    expect(links.map((l) => l.assetId)).toEqual([logo.id]);
  });
});

/** Width in mm of the non-transparent pixels in a print PNG. */
async function inkWidthMm(png: Buffer, dpi: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let min = info.width, max = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[(y * info.width + x) * 4 + 3] > 128) {
        if (x < min) min = x;
        if (x > max) max = x;
      }
  return ((max - min + 1) / dpi) * 25.4;
}

describe("deterministic rendering", () => {
  it("text keeps the same physical size at every resolution (preview ≈ print) and stays inside its laid-out box", async () => {
    const { layoutText } = await import("@/domain/render/text");
    const { serverMeasure } = await import("@/server/render/canvas");
    const el = textEl({ text: "HELLO JAIPUR", fontSize: 30, fill: "#000000" });
    const d = doc(crew, { front: [el] });
    const widths = [];
    for (const dpi of [40, 150, 300]) widths.push(await inkWidthMm((await renderPrintFile(db, { product: crew, doc: d, side: "front", dpi })).png, dpi));
    const [low, mid, high] = widths;
    expect(Math.abs(low - high) / high).toBeLessThan(0.015);
    expect(Math.abs(mid - high) / high).toBeLessThan(0.015);
    const layout = layoutText(el, serverMeasure());
    expect(high).toBeLessThanOrEqual(layout.hw * 2 + 0.5);
    expect(high).toBeGreaterThan(layout.hw * 2 * 0.85);
  });

  it("renders print files at physical size and identical bytes for the same design", async () => {
    const logo = await uploadLogo(db, alice.tokenHash);
    const d = doc(crew, { front: [textEl({ text: "SAME" }), { id: "img1", type: "image", assetId: logo.id, width: 100, height: 100, x: 140, y: 220, rotation: 0 }] });
    const a = await renderPrintFile(db, { product: crew, doc: d, side: "front", dpi: 150 });
    const b = await renderPrintFile(db, { product: crew, doc: d, side: "front", dpi: 150 });
    expect(a.widthPx).toBe(Math.round((280 / 25.4) * 150));
    expect(a.heightPx).toBe(Math.round((350 / 25.4) * 150));
    expect(a.png.equals(b.png)).toBe(true);
    const meta = await sharp(a.png).metadata();
    expect(meta).toMatchObject({ width: a.widthPx, height: a.heightPx, hasAlpha: true, density: 150 });
    const preview = await renderMockup(db, { product: crew, doc: d, side: "front", width: 400 });
    expect((await sharp(preview).metadata()).width).toBe(400);
  });
});
