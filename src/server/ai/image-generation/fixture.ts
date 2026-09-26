import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { ProviderError, type GenerateArtworkInput, type GeneratedImage, type ImageGenerationProvider } from "./types";

/**
 * AUTOMATED-TEST PROVIDER. Draws deterministic abstract artwork locally so the
 * end-to-end journey can be tested without network access or API cost. It is
 * refused in production unless AI_ALLOW_FIXTURE=true (see registry.ts), and the
 * UI never presents its output as real AI.
 *
 * Test hooks: a prompt containing FIXTURE_REFUSE simulates a safety refusal,
 * FIXTURE_FAIL a provider outage.
 */
export class FixtureImageProvider implements ImageGenerationProvider {
  readonly name = "fixture";
  readonly model = "fixture-artwork-v1";
  readonly supportsTransparency = true;

  constructor(private readonly delayMs = 0) {}

  async generateArtwork(input: GenerateArtworkInput): Promise<GeneratedImage[]> {
    if (this.delayMs) await wait(this.delayMs, input.signal);
    if (input.signal.aborted) throw new ProviderError("CANCELLED", "aborted");
    if (input.prompt.includes("FIXTURE_REFUSE")) throw new ProviderError("REFUSED", "fixture refusal");
    if (input.prompt.includes("FIXTURE_FAIL")) throw new ProviderError("UNAVAILABLE", "fixture outage");
    const count = Math.min(Math.max(input.count, 1), 10);
    return Promise.all(
      Array.from({ length: count }, async (_, i) => ({
        data: await sharp(Buffer.from(svg(input, i))).png().toBuffer(),
        mime: "image/png",
        transparent: true,
      })),
    );
  }
}

function svg(input: GenerateArtworkInput, variant: number) {
  const { width: w, height: h } = input.size;
  const seed = createHash("sha256").update(`${input.prompt}|${variant}|${input.referenceImage ? "ref" : ""}`).digest();
  const palette = ["#F97360", "#D9A441", "#2DD4BF", "#60A5FA", "#F472B6", "#A3E635", "#FDE68A", "#C4B5FD"];
  const c = (k: number) => palette[seed[k] % palette.length];
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.36;
  const spikes = 5 + (seed[3] % 6);
  const star = Array.from({ length: spikes * 2 }, (_, k) => {
    const a = (Math.PI * k) / spikes - Math.PI / 2;
    const rr = k % 2 ? r * 0.45 : r;
    return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
  }).join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <circle cx="${cx}" cy="${cy}" r="${r * 1.05}" fill="${c(0)}"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.8}" fill="none" stroke="${c(1)}" stroke-width="${r * 0.08}"/>
    <polygon points="${star}" fill="${c(2)}"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.18}" fill="${c(4)}"/>
  </svg>`;
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new ProviderError("CANCELLED", "aborted"));
    });
  });
}
