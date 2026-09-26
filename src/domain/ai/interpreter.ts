import { isLightColour } from "../colour";

/**
 * Prompt interpreter: turns a customer's free-text idea (plus the product they
 * are designing) into structured artwork requirements. Deterministic and
 * instant; an LLM-backed interpreter can implement the same interface later.
 */

export const AI_STYLES = [
  "Minimal",
  "Vintage",
  "Streetwear",
  "Cartoon",
  "Illustration",
  "Hand-drawn",
  "Luxury",
  "Retro",
  "Graffiti",
  "Typography",
  "Geometric",
  "Realistic illustration",
] as const;
export type AiStyle = (typeof AI_STYLES)[number];

export const AI_ORIENTATIONS = ["auto", "portrait", "square", "landscape"] as const;
export type AiOrientation = (typeof AI_ORIENTATIONS)[number];

export type ArtworkContext = {
  productName: string;
  shirtColourName: string;
  shirtColourHex: string;
  side: "front" | "back";
  printAreaName: string;
  printAreaWidthMm: number;
  printAreaHeightMm: number;
  printMethodCode: string;
};

export type ArtworkRequest = {
  prompt: string;
  style?: AiStyle | null;
  orientation?: AiOrientation;
  /** keep requested words inside the image (not editable) instead of as canvas text */
  lettering?: boolean;
  /** follow-up instruction on a previous result ("make it more aggressive…") */
  refinement?: string | null;
};

export type ArtworkRequirements = {
  subject: string;
  style: AiStyle | null;
  moods: string[];
  colours: string[];
  /** words the customer wants on the shirt */
  textRequests: string[];
  /** true: words are drawn into the artwork; false: added as editable canvas text */
  letteringInImage: boolean;
  orientation: Exclude<AiOrientation, "auto">;
  complexity: "simple" | "moderate" | "detailed";
  contrastOn: "dark" | "light";
  refinement: string | null;
  context: ArtworkContext;
};

export interface PromptInterpreter {
  interpret(req: ArtworkRequest, ctx: ArtworkContext, previous?: ArtworkRequirements | null): ArtworkRequirements;
}

const STYLE_KEYWORDS: [AiStyle, RegExp][] = [
  ["Streetwear", /\b(?:street ?wear|urban|hype)\b/i],
  ["Vintage", /\b(?:vintage|distressed|worn|antique|old[- ]school)\b/i],
  ["Retro", /\b(?:retro|70s|80s|90s|synthwave)\b/i],
  ["Minimal", /\b(?:minimal(?:ist)?|simple|clean)\b/i],
  ["Geometric", /\b(?:geometric|polygon(?:al)?|low[- ]poly)\b/i],
  ["Cartoon", /\b(?:cartoon|cute|kawaii|chibi)\b/i],
  ["Hand-drawn", /\b(?:hand[- ]?drawn|sketch(?:y)?|doodle|ink)\b/i],
  ["Graffiti", /\b(?:graffiti|spray[- ]?paint)\b/i],
  ["Luxury", /\b(?:luxury|premium|elegant|gold\s+foil)\b/i],
  ["Typography", /\b(?:typograph(?:y|ic)|lettering|word ?art)\b/i],
  ["Realistic illustration", /\b(?:realistic|photo[- ]?real(?:istic)?|detailed illustration)\b/i],
  ["Illustration", /\b(?:illustration|illustrated)\b/i],
];

const MOOD_WORDS = ["bold", "fierce", "calm", "playful", "powerful", "cute", "aggressive", "peaceful", "dramatic", "elegant", "fun", "dark", "bright", "energetic", "moody", "serene", "wild", "cool"];
const COLOUR_WORDS = ["red", "orange", "yellow", "gold", "green", "teal", "blue", "navy", "purple", "violet", "pink", "magenta", "brown", "cream", "beige", "black", "white", "grey", "gray", "silver", "maroon", "mustard", "turquoise", "neon", "pastel", "monochrome"];

/** Words the customer wants on the shirt: "…", “…”, 'the words X', 'saying X', 'text: X'. */
export function extractTextRequests(prompt: string): { texts: string[]; rest: string } {
  const texts: string[] = [];
  let rest = prompt;
  const take = (re: RegExp) => {
    rest = rest.replace(re, (_m, t: string) => {
      const clean = t.trim().replace(/[.,;!]+$/, "");
      if (clean && clean.length <= 60) texts.push(clean);
      return " ";
    });
  };
  take(/["“”]([^"“”]{1,80})["“”]/g);
  take(/\b(?:with|and|plus)?\s*(?:the\s+)?(?:words?|text|slogan|caption|tagline)\s*[:\-]?\s+([A-Z0-9][A-Z0-9 '&!?.-]{1,58}[A-Z0-9!?])(?=[\s,.;]|$)/g);
  take(/\b(?:saying|that says|reading)\s+([A-Z0-9][A-Z0-9 '&!?.-]{1,58}[A-Z0-9!?])(?=[\s,.;]|$)/g);
  rest = rest
    .replace(/^\s*(?:please\s+)?(?:create|make|design|generate|draw|give me)\s+(?:me\s+)?(?:an?\s+)?/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/[\s,]+(?:with|and)?\.?$/i, "")
    .trim();
  return { texts: [...new Set(texts)], rest };
}

function pickOrientation(o: AiOrientation | undefined, ctx: ArtworkContext): ArtworkRequirements["orientation"] {
  if (o && o !== "auto") return o;
  const r = ctx.printAreaWidthMm / ctx.printAreaHeightMm;
  return r < 0.9 ? "portrait" : r > 1.15 ? "landscape" : "square";
}

function complexityFor(ctx: ArtworkContext): ArtworkRequirements["complexity"] {
  const shortest = Math.min(ctx.printAreaWidthMm, ctx.printAreaHeightMm);
  if (ctx.printMethodCode === "EMBROIDERY" || shortest < 120) return "simple";
  if (ctx.printMethodCode === "VINYL") return "moderate";
  return "detailed";
}

export const ruleBasedInterpreter: PromptInterpreter = {
  interpret(req, ctx, previous) {
    const { texts, rest } = extractTextRequests(req.prompt);
    const lower = req.prompt.toLowerCase();
    const style = req.style ?? STYLE_KEYWORDS.find(([, re]) => re.test(req.prompt))?.[0] ?? previous?.style ?? null;
    const moods = MOOD_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(lower));
    const colours = COLOUR_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(lower));
    const refinement = req.refinement?.trim() || null;
    const refinementColours = refinement ? COLOUR_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(refinement.toLowerCase())) : [];
    return {
      subject: rest || previous?.subject || req.prompt.trim(),
      style,
      moods: [...new Set([...(previous?.moods ?? []), ...moods])],
      colours: refinementColours.length ? refinementColours : colours.length ? colours : previous?.colours ?? [],
      textRequests: texts.length ? texts : previous?.textRequests ?? [],
      letteringInImage: !!req.lettering,
      orientation: pickOrientation(req.orientation, ctx),
      complexity: complexityFor(ctx),
      contrastOn: isLightColour(ctx.shirtColourHex) ? "light" : "dark",
      refinement,
      context: ctx,
    };
  },
};
