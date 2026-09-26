import { describe, expect, it } from "vitest";
import { extractTextRequests, ruleBasedInterpreter, type ArtworkContext } from "@/domain/ai/interpreter";
import { buildImagePrompt, requestedPixelSize } from "@/domain/ai/prompt-builder";

const ctx = (over: Partial<ArtworkContext> = {}): ArtworkContext => ({
  productName: "Classic Crew T-Shirt",
  shirtColourName: "Black",
  shirtColourHex: "#111111",
  side: "front",
  printAreaName: "Full front",
  printAreaWidthMm: 290,
  printAreaHeightMm: 360,
  printMethodCode: "DTF",
  ...over,
});

const EXAMPLE = "Create a bold vintage mountain design with a rising sun, pine trees and the words ADVENTURE AWAITS.";

describe("AI prompt interpreter", () => {
  it("separates requested words from the artwork subject", () => {
    const { texts, rest } = extractTextRequests(EXAMPLE);
    expect(texts).toEqual(["ADVENTURE AWAITS"]);
    expect(rest).not.toContain("ADVENTURE");
    expect(rest.toLowerCase()).toContain("mountain");
    expect(rest).not.toMatch(/^create/i);
  });

  it("handles quoted text and 'saying' phrases", () => {
    expect(extractTextRequests('a cat astronaut with "SPACE CADET"').texts).toEqual(["SPACE CADET"]);
    expect(extractTextRequests("a retro motorcycle saying RIDE FREE").texts).toEqual(["RIDE FREE"]);
    expect(extractTextRequests("a lion in geometric style").texts).toEqual([]);
  });

  it("detects style, mood and colours; does not misfire on substrings", () => {
    const r = ruleBasedInterpreter.interpret({ prompt: "fierce streetwear tiger in red and gold" }, ctx());
    expect(r.style).toBe("Streetwear");
    expect(r.moods).toContain("fierce");
    expect(r.colours).toEqual(expect.arrayContaining(["red", "gold"]));
    // "pink" must not match the "ink" hand-drawn keyword
    expect(ruleBasedInterpreter.interpret({ prompt: "a pink flower" }, ctx()).style).toBeNull();
    // explicit style wins
    expect(ruleBasedInterpreter.interpret({ prompt: "streetwear tiger", style: "Cartoon" }, ctx()).style).toBe("Cartoon");
  });

  it("uses shirt colour for contrast", () => {
    expect(ruleBasedInterpreter.interpret({ prompt: "tiger" }, ctx()).contrastOn).toBe("dark");
    expect(ruleBasedInterpreter.interpret({ prompt: "tiger" }, ctx({ shirtColourName: "White", shirtColourHex: "#FFFFFF" })).contrastOn).toBe("light");
  });

  it("keeps small areas and embroidery simple, and picks orientation from the print area", () => {
    const chest = ruleBasedInterpreter.interpret({ prompt: "lion" }, ctx({ printAreaName: "Left chest", printAreaWidthMm: 90, printAreaHeightMm: 90 }));
    expect(chest.complexity).toBe("simple");
    expect(chest.orientation).toBe("square");
    expect(ruleBasedInterpreter.interpret({ prompt: "lion" }, ctx({ printMethodCode: "EMBROIDERY" })).complexity).toBe("simple");
    const full = ruleBasedInterpreter.interpret({ prompt: "lion" }, ctx());
    expect(full.complexity).toBe("detailed");
    expect(full.orientation).toBe("portrait");
    expect(ruleBasedInterpreter.interpret({ prompt: "lion", orientation: "landscape" }, ctx()).orientation).toBe("landscape");
  });

  it("carries the previous interpretation into a refinement", () => {
    const first = ruleBasedInterpreter.interpret({ prompt: "vintage mountain with a rising sun in orange and the words ADVENTURE AWAITS" }, ctx());
    const next = ruleBasedInterpreter.interpret({ prompt: "vintage mountain with a rising sun in orange and the words ADVENTURE AWAITS", refinement: "use blue and purple instead" }, ctx(), first);
    expect(next.style).toBe("Vintage");
    expect(next.colours).toEqual(["blue", "purple"]);
    expect(next.textRequests).toEqual(["ADVENTURE AWAITS"]);
    expect(next.refinement).toBe("use blue and purple instead");
  });
});

describe("AI prompt builder", () => {
  it("asks for isolated artwork, never a garment or mockup", () => {
    const { prompt, negative } = buildImagePrompt(ruleBasedInterpreter.interpret({ prompt: EXAMPLE }, ctx()));
    expect(prompt).toMatch(/transparent background/i);
    expect(prompt).toMatch(/dark\) shirt/);
    expect(negative.join(" ")).toMatch(/no t-shirt/);
    expect(negative.join(" ")).toMatch(/no mockup/);
    expect(negative.join(" ")).toMatch(/no person/);
    // words go on the canvas as editable text by default
    expect(prompt).toMatch(/Do not include any text/);
    expect(prompt).not.toContain("ADVENTURE AWAITS");
  });

  it("draws lettering into the image only when asked", () => {
    const { prompt } = buildImagePrompt(ruleBasedInterpreter.interpret({ prompt: EXAMPLE, lettering: true }, ctx()));
    expect(prompt).toContain('"ADVENTURE AWAITS"');
    expect(prompt).not.toMatch(/Do not include any text/);
  });

  it("applies print-method constraints", () => {
    const { prompt } = buildImagePrompt(ruleBasedInterpreter.interpret({ prompt: "lion" }, ctx({ printMethodCode: "VINYL" })));
    expect(prompt).toMatch(/no gradients/);
  });

  it("requests a provider-valid pixel size matching the print area", () => {
    for (const area of [ctx(), ctx({ printAreaWidthMm: 90, printAreaHeightMm: 90 }), ctx({ printAreaWidthMm: 300, printAreaHeightMm: 120 })]) {
      const size = requestedPixelSize(ruleBasedInterpreter.interpret({ prompt: "lion" }, area));
      expect(size.width % 16).toBe(0);
      expect(size.height % 16).toBe(0);
      expect(size.width * size.height).toBeLessThanOrEqual(3_686_400 + 16 * 4000);
      expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(1024);
    }
    const full = requestedPixelSize(ruleBasedInterpreter.interpret({ prompt: "lion" }, ctx()));
    expect(full.height).toBeGreaterThan(full.width);
  });
});
