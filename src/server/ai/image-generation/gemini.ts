import "server-only";
import { fromFetchError, fromStatus, ProviderError, type GenerateArtworkInput, type GeneratedImage, type ImageGenerationProvider } from "./types";

/**
 * Google Gemini image model via generateContent. One image per call (variations
 * are parallel calls) and no transparent backgrounds: we ask for a plain flat
 * background so the service can lift it off (see background.ts).
 */
export class GeminiImageProvider implements ImageGenerationProvider {
  readonly name = "gemini";
  readonly supportsTransparency = false;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta",
  ) {}

  async generateArtwork(input: GenerateArtworkInput): Promise<GeneratedImage[]> {
    const count = Math.min(Math.max(input.count, 1), 4);
    const results = await Promise.allSettled(Array.from({ length: count }, (_, i) => this.one(input, i)));
    const images = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (images.length) return images;
    // every call failed: surface the most meaningful reason (a refusal beats anything else)
    const errors = results.map((r) => (r as PromiseRejectedResult).reason as ProviderError);
    throw errors.find((e) => e.kind === "REFUSED") ?? errors.find((e) => e.kind === "CANCELLED" || e.kind === "TIMEOUT") ?? errors[0];
  }

  private async one(input: GenerateArtworkInput, index: number): Promise<GeneratedImage> {
    const prompt = input.prompt.replace(
      /Transparent background;[^\n]*/i,
      `Plain, completely flat solid ${bgFor(input.shirtColour.hex)} background with nothing else on it; only the artwork itself.`,
    );
    const parts: object[] = [{ text: index ? `${prompt}\nVariation ${index + 1}: a distinctly different composition.` : prompt }];
    if (input.referenceImage) {
      parts.unshift({ inlineData: { mimeType: input.referenceImage.mime, data: input.referenceImage.data.toString("base64") } });
      parts.push({ text: "Create a new variation in the same style and subject as the attached artwork." });
    }
    let res: Response;
    let text: string;
    try {
      res = await fetch(`${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: { aspectRatio: input.aspectRatio === "portrait" ? "3:4" : input.aspectRatio === "landscape" ? "4:3" : "1:1", imageSize: "2K" },
          },
        }),
        signal: input.signal,
      });
      text = await res.text();
    } catch (err) {
      throw fromFetchError(err, input.signal);
    }
    if (!res.ok) {
      if (res.status === 400 && /safety|blocked|prohibited/i.test(text)) throw new ProviderError("REFUSED", text.slice(0, 300));
      throw fromStatus(res.status, text);
    }
    type Part = { inlineData?: { mimeType?: string; data?: string } };
    let body: { promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string; content?: { parts?: Part[] } }[] };
    try {
      body = JSON.parse(text);
    } catch {
      throw new ProviderError("BAD_RESPONSE", "response was not JSON");
    }
    if (body.promptFeedback?.blockReason) throw new ProviderError("REFUSED", `blockReason ${body.promptFeedback.blockReason}`);
    const cand = body.candidates?.[0];
    const img = cand?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!img?.data) {
      if (cand?.finishReason && /SAFETY|PROHIBITED|IMAGE_SAFETY|BLOCKLIST|SPII|RECITATION/i.test(cand.finishReason)) {
        throw new ProviderError("REFUSED", `finishReason ${cand.finishReason}`);
      }
      throw new ProviderError("BAD_RESPONSE", `no image (finishReason ${cand?.finishReason ?? "none"})`);
    }
    return { data: Buffer.from(img.data, "base64"), mime: img.mimeType ?? "image/png", transparent: false };
  }
}

/** A background colour that contrasts with typical artwork for this shirt, so it separates cleanly. */
function bgFor(shirtHex: string) {
  const n = parseInt(shirtHex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 160 ? "white" : "black";
}
