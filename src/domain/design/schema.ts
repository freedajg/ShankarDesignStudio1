import { z } from "zod";
import { FONT_IDS } from "../fonts";

/**
 * The canonical, versioned design document — the production source of truth.
 *
 * Units: millimetres, relative to the top-left corner of the surface's chosen
 * print area. (x, y) is the element's origin (its centre); rotation in degrees
 * clockwise. Array order is layer order (first = bottom).
 *
 * Colour and garment size are deliberately NOT part of the elements, so
 * changing them can never alter or drop the artwork.
 */
export const DESIGN_SCHEMA_VERSION = 1 as const;

export const SIDES = ["front", "back"] as const;
export type Side = (typeof SIDES)[number];

export const MAX_ELEMENTS_PER_SURFACE = 30;
export const MAX_TEXT_LENGTH = 200;
export const MAX_TEXT_LINES = 8;

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "must be a #RRGGBB colour");
const coord = z.number().finite().min(-2000).max(2000);

const base = {
  id: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/),
  x: coord,
  y: coord,
  rotation: z.number().finite().min(-360).max(360),
};

export const textElementSchema = z.object({
  ...base,
  type: z.literal("text"),
  text: z
    .string()
    .max(MAX_TEXT_LENGTH)
    .refine((t) => t.trim().length > 0, "text cannot be empty")
    .refine((t) => t.split("\n").length <= MAX_TEXT_LINES, `at most ${MAX_TEXT_LINES} lines`),
  fontId: z.enum(FONT_IDS),
  /** em size in millimetres */
  fontSize: z.number().finite().min(2).max(400),
  fill: hex,
  bold: z.boolean(),
  italic: z.boolean(),
  align: z.enum(["left", "center", "right"]),
  lineHeight: z.number().finite().min(0.8).max(3),
});

export const imageElementSchema = z.object({
  ...base,
  type: z.literal("image"),
  assetId: z.string().uuid(),
  width: z.number().finite().positive().max(1500),
  height: z.number().finite().positive().max(1500),
});

export const elementSchema = z.discriminatedUnion("type", [textElementSchema, imageElementSchema]);

export const surfaceSchema = z.object({
  printAreaCode: z.string().min(1).max(40),
  elements: z.array(elementSchema).max(MAX_ELEMENTS_PER_SURFACE),
});

export const designDocSchema = z
  .object({
    schemaVersion: z.literal(DESIGN_SCHEMA_VERSION),
    productId: z.string().uuid(),
    colourId: z.string().uuid(),
    surfaces: z.object({ front: surfaceSchema, back: surfaceSchema }),
  })
  .superRefine((doc, ctx) => {
    const ids = new Set<string>();
    for (const side of SIDES) {
      for (const el of doc.surfaces[side].elements) {
        if (ids.has(el.id)) ctx.addIssue({ code: "custom", path: ["surfaces", side], message: `duplicate element id ${el.id}` });
        ids.add(el.id);
      }
    }
  });

export type TextElement = z.infer<typeof textElementSchema>;
export type ImageElement = z.infer<typeof imageElementSchema>;
export type DesignElement = z.infer<typeof elementSchema>;
export type Surface = z.infer<typeof surfaceSchema>;
export type DesignDoc = z.infer<typeof designDocSchema>;

export function emptyDesign(input: { productId: string; colourId: string; frontArea: string; backArea: string }): DesignDoc {
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    productId: input.productId,
    colourId: input.colourId,
    surfaces: {
      front: { printAreaCode: input.frontArea, elements: [] },
      back: { printAreaCode: input.backArea, elements: [] },
    },
  };
}

export function countElements(doc: DesignDoc) {
  return SIDES.reduce((n, s) => n + doc.surfaces[s].elements.length, 0);
}

export function decoratedSides(doc: DesignDoc): Side[] {
  return SIDES.filter((s) => doc.surfaces[s].elements.length > 0);
}

export function assetIds(doc: DesignDoc): string[] {
  const ids = new Set<string>();
  for (const s of SIDES) for (const el of doc.surfaces[s].elements) if (el.type === "image") ids.add(el.assetId);
  return [...ids];
}
