import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { serverMeasure } from "@/server/render/canvas";
import { layoutText } from "@/domain/render/text";
import { designDocSchema, emptyDesign, type TextElement } from "@/domain/design/schema";
import { aabb, constrainToArea, isInsideArea, maxFitScale, rotatedHalfExtents } from "@/domain/design/geometry";
import { validateDesign } from "@/domain/design/validate";
import { getFont, resolveFace } from "@/domain/fonts";

const measure = serverMeasure();

const text = (over: Partial<TextElement> = {}): TextElement => ({
  id: "t1",
  type: "text",
  text: "HELLO",
  fontId: "montserrat",
  fontSize: 30,
  fill: "#112233",
  bold: false,
  italic: false,
  align: "center",
  lineHeight: 1.2,
  x: 140,
  y: 100,
  rotation: 0,
  ...over,
});

describe("fonts", () => {
  it("falls back when a family lacks a face", () => {
    expect(resolveFace(getFont("anton"), true, true)).toBe("400-normal");
    expect(resolveFace(getFont("oswald"), true, true)).toBe("700-normal");
    expect(resolveFace(getFont("montserrat"), true, true)).toBe("700-italic");
  });
  it("server resolves distinct weights of one family (same files as the browser)", () => {
    const regular = measure("HELLO WORLD", "400 100px sgd-montserrat").width;
    const bold = measure("HELLO WORLD", "700 100px sgd-montserrat").width;
    const fallback = measure("HELLO WORLD", "400 100px no-such-font").width;
    expect(bold).toBeGreaterThan(regular);
    expect(regular).not.toBeCloseTo(fallback, 0);
  });
});

describe("text layout", () => {
  it("scales linearly with font size", () => {
    const a = layoutText(text({ fontSize: 20 }), measure);
    const b = layoutText(text({ fontSize: 40 }), measure);
    expect(b.hw).toBeCloseTo(a.hw * 2, 3);
    expect(b.hh).toBeCloseTo(a.hh * 2, 3);
  });
  it("grows with lines and aligns lines", () => {
    const one = layoutText(text(), measure);
    const two = layoutText(text({ text: "HELLO\nHI", align: "left" }), measure);
    expect(two.hh).toBeGreaterThan(one.hh * 1.8);
    expect(two.lines[0].dx).toBeCloseTo(two.lines[1].dx, 6); // left aligned
    const right = layoutText(text({ text: "HELLO\nHI", align: "right" }), measure);
    expect(right.lines[1].dx).toBeGreaterThan(right.lines[0].dx);
  });
});

describe("geometry", () => {
  it("computes rotated extents", () => {
    const e = rotatedHalfExtents(10, 5, 90);
    expect(e.ex).toBeCloseTo(5);
    expect(e.ey).toBeCloseTo(10);
    const d = rotatedHalfExtents(10, 10, 45);
    expect(d.ex).toBeCloseTo(14.142, 2);
  });
  it("detects outside and constrains back in", () => {
    const area = { width: 100, height: 100 };
    const box = { x: 95, y: 50, hw: 10, hh: 10, rotation: 0 };
    expect(isInsideArea(box, area)).toBe(false);
    const c = constrainToArea(box, area);
    expect(c).toEqual({ x: 90, y: 50, scale: 1 });
    expect(isInsideArea({ ...box, x: c.x }, area)).toBe(true);
    // a rotated square becomes wider: must still fit after constraint
    const rot = { x: 50, y: 50, hw: 45, hh: 45, rotation: 45 };
    const s = maxFitScale(rot, area);
    expect(s).toBeLessThan(1);
    const r = constrainToArea(rot, area);
    expect(isInsideArea({ ...rot, hw: rot.hw * r.scale, hh: rot.hh * r.scale, x: r.x, y: r.y }, area)).toBe(true);
    expect(aabb(rot).left).toBeLessThan(0);
  });
});

describe("design schema + validation", () => {
  const productId = randomUUID();
  const colourId = randomUUID();
  const base = emptyDesign({ productId, colourId, frontArea: "FULL_FRONT", backArea: "FULL_BACK" });
  const areas = [
    { code: "FULL_FRONT", side: "front" as const, widthMm: 280, heightMm: 350, isActive: true },
    { code: "FULL_BACK", side: "back" as const, widthMm: 300, heightMm: 380, isActive: true },
  ];
  const ctx = { productId, colourIds: [colourId], printAreas: areas, measure };

  it("accepts a valid design and rejects malformed ones", () => {
    const doc = { ...base, surfaces: { ...base.surfaces, front: { printAreaCode: "FULL_FRONT", elements: [text()] } } };
    expect(designDocSchema.safeParse(doc).success).toBe(true);
    expect(designDocSchema.safeParse({ ...doc, schemaVersion: 2 }).success).toBe(false);
    const bad = (el: object) =>
      designDocSchema.safeParse({ ...doc, surfaces: { ...doc.surfaces, front: { printAreaCode: "FULL_FRONT", elements: [el] } } }).success;
    expect(bad(text({ fill: "red" }))).toBe(false);
    expect(bad(text({ text: "   " }))).toBe(false);
    expect(bad(text({ fontId: "comic-sans" as never }))).toBe(false);
    expect(bad(text({ x: Number.NaN }))).toBe(false);
    expect(bad({ ...text(), type: "image" })).toBe(false);
    // duplicate ids across sides
    const dup = { ...doc, surfaces: { front: doc.surfaces.front, back: { printAreaCode: "FULL_BACK", elements: [text()] } } };
    expect(designDocSchema.safeParse(dup).success).toBe(false);
  });

  it("flags elements outside the print area, wrong areas and colours", () => {
    const inside = { ...base, surfaces: { ...base.surfaces, front: { printAreaCode: "FULL_FRONT", elements: [text()] } } };
    expect(validateDesign(inside, ctx)).toEqual([]);
    const outside = { ...inside, surfaces: { ...inside.surfaces, front: { printAreaCode: "FULL_FRONT", elements: [text({ x: 270 })] } } };
    expect(validateDesign(outside, ctx).map((i) => i.code)).toEqual(["OUTSIDE_PRINT_AREA"]);
    const rotated = { ...inside, surfaces: { ...inside.surfaces, front: { printAreaCode: "FULL_FRONT", elements: [text({ fontSize: 60, text: "WIDE HEADLINE", rotation: 90 })] } } };
    expect(validateDesign(rotated, ctx).map((i) => i.code)).toContain("OUTSIDE_PRINT_AREA");
    const wrongArea = { ...inside, surfaces: { ...inside.surfaces, back: { printAreaCode: "LEFT_CHEST", elements: [] } } };
    expect(validateDesign(wrongArea, ctx).map((i) => i.code)).toEqual(["PRINT_AREA_INVALID"]);
    expect(validateDesign({ ...inside, colourId: randomUUID() }, ctx).map((i) => i.code)).toEqual(["COLOUR_UNAVAILABLE"]);
  });
});
