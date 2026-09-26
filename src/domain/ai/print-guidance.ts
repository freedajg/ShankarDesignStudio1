/**
 * Artwork guidance per print method, fed into the image prompt. These are design
 * recommendations, not production guarantees — Ginger Prints' actual rules are
 * an open question (docs/OPEN_QUESTIONS.md #6, #18) and belong here once known.
 */
export type PrintGuidance = { summary: string; promptRules: string[] };

export const PRINT_GUIDANCE: Record<string, PrintGuidance> = {
  DTF: {
    summary: "Full colour, gradients and fine detail are fine.",
    promptRules: ["full-colour artwork; gradients and fine detail are acceptable", "crisp, clean edges"],
  },
  VINYL: {
    summary: "Best with a few solid colours and bold, clean shapes.",
    promptRules: ["flat vector-style artwork using 1 to 3 solid colours", "no gradients, no photographic texture, no tiny details", "bold shapes with clean, cuttable edges"],
  },
  EMBROIDERY: {
    summary: "Best with simple, bold shapes and few colours.",
    promptRules: ["simple bold emblem-style artwork using at most 6 flat colours", "no gradients, no fine lines or tiny details", "thick outlines and clearly separated colour areas"],
  },
};

export function guidanceFor(methodCode: string): PrintGuidance {
  return PRINT_GUIDANCE[methodCode] ?? PRINT_GUIDANCE.DTF;
}
