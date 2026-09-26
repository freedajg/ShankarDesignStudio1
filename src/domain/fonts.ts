/**
 * Curated design-font library for customer artwork. All fonts are SIL Open Font
 * Licence families (via fontsource), self-hosted from /public/fonts/design so the
 * browser editor and the server print renderer load the *same files* and measure
 * text identically.
 *
 * `family` is a private CSS family name so customer fonts never collide with UI fonts.
 */

export type FontFace = "400-normal" | "700-normal" | "400-italic" | "700-italic";

export type DesignFont = {
  id: string;
  label: string;
  family: string;
  category: "Sans" | "Serif" | "Display" | "Script" | "Handwritten";
  faces: FontFace[];
};

export const DESIGN_FONTS: DesignFont[] = [
  { id: "inter", label: "Inter", family: "sgd-inter", category: "Sans", faces: ["400-normal", "700-normal", "400-italic", "700-italic"] },
  { id: "montserrat", label: "Montserrat", family: "sgd-montserrat", category: "Sans", faces: ["400-normal", "700-normal", "400-italic", "700-italic"] },
  { id: "oswald", label: "Oswald", family: "sgd-oswald", category: "Sans", faces: ["400-normal", "700-normal"] },
  { id: "anton", label: "Anton", family: "sgd-anton", category: "Display", faces: ["400-normal"] },
  { id: "bebas-neue", label: "Bebas Neue", family: "sgd-bebas-neue", category: "Display", faces: ["400-normal"] },
  { id: "playfair-display", label: "Playfair Display", family: "sgd-playfair-display", category: "Serif", faces: ["400-normal", "700-normal", "400-italic", "700-italic"] },
  { id: "roboto-slab", label: "Roboto Slab", family: "sgd-roboto-slab", category: "Serif", faces: ["400-normal", "700-normal"] },
  { id: "pacifico", label: "Pacifico", family: "sgd-pacifico", category: "Script", faces: ["400-normal"] },
  { id: "lobster", label: "Lobster", family: "sgd-lobster", category: "Script", faces: ["400-normal"] },
  { id: "permanent-marker", label: "Permanent Marker", family: "sgd-permanent-marker", category: "Handwritten", faces: ["400-normal"] },
];

export const DEFAULT_FONT_ID = "montserrat";

export const FONT_IDS = DESIGN_FONTS.map((f) => f.id) as [string, ...string[]];

export function getFont(id: string): DesignFont {
  return DESIGN_FONTS.find((f) => f.id === id) ?? DESIGN_FONTS.find((f) => f.id === DEFAULT_FONT_ID)!;
}

/** Face actually used for a request — falls back when the family lacks bold/italic. */
export function resolveFace(font: DesignFont, bold: boolean, italic: boolean): FontFace {
  const want = `${bold ? 700 : 400}-${italic ? "italic" : "normal"}` as FontFace;
  if (font.faces.includes(want)) return want;
  const noItalic = `${bold ? 700 : 400}-normal` as FontFace;
  if (font.faces.includes(noItalic)) return noItalic;
  return "400-normal";
}

export const fontFileName = (fontId: string, face: FontFace) => `${fontId}-${face}.woff2`;
export const FONT_PUBLIC_DIR = "/fonts/design";

/** CSS font shorthand for canvas: e.g. `italic 700 120px sgd-montserrat` */
export function cssFont(font: DesignFont, face: FontFace, sizePx: number) {
  const [weight, style] = face.split("-");
  return `${style === "italic" ? "italic " : ""}${weight} ${sizePx}px ${font.family}`;
}
