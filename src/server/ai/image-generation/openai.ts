import "server-only";
import { fromFetchError, fromStatus, ProviderError, type GenerateArtworkInput, type GeneratedImage, type ImageGenerationProvider } from "./types";

/**
 * OpenAI GPT Image (Images API). Native transparent backgrounds, arbitrary
 * WxH sizes (multiples of 16) and up to 10 variations per call.
 * Reference: POST /v1/images/generations and /v1/images/edits.
 */
export class OpenAIImageProvider implements ImageGenerationProvider {
  readonly name = "openai";
  readonly supportsTransparency = true;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly quality: string,
    private readonly baseUrl = "https://api.openai.com/v1",
  ) {}

  async generateArtwork(input: GenerateArtworkInput): Promise<GeneratedImage[]> {
    const common = {
      model: this.model,
      prompt: input.prompt,
      n: Math.min(Math.max(input.count, 1), 10),
      size: `${input.size.width}x${input.size.height}`,
      background: "transparent",
      output_format: "png",
      quality: this.quality,
      user: input.endUser,
    };
    let res: Response;
    try {
      if (input.referenceImage) {
        const form = new FormData();
        for (const [k, v] of Object.entries(common)) form.append(k, String(v));
        form.append("input_fidelity", "high");
        const ext = input.referenceImage.mime === "image/jpeg" ? "jpg" : "png";
        form.append("image", new Blob([new Uint8Array(input.referenceImage.data)], { type: input.referenceImage.mime }), `reference.${ext}`);
        res = await fetch(`${this.baseUrl}/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${this.apiKey}` }, body: form, signal: input.signal });
      } else {
        res = await fetch(`${this.baseUrl}/images/generations`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ...common, moderation: "auto" }),
          signal: input.signal,
        });
      }
    } catch (err) {
      throw fromFetchError(err, input.signal);
    }

    let text: string;
    try {
      text = await res.text();
    } catch (err) {
      throw fromFetchError(err, input.signal);
    }
    if (!res.ok) {
      if (res.status === 400 && isSafetyRefusal(text)) throw new ProviderError("REFUSED", text.slice(0, 300));
      throw fromStatus(res.status, text);
    }
    let body: { data?: { b64_json?: string }[] };
    try {
      body = JSON.parse(text);
    } catch {
      throw new ProviderError("BAD_RESPONSE", "response was not JSON");
    }
    const images = (body.data ?? []).filter((d) => d.b64_json).map((d) => ({ data: Buffer.from(d.b64_json!, "base64"), mime: "image/png", transparent: true }));
    if (!images.length) throw new ProviderError("BAD_RESPONSE", "no images in response");
    return images;
  }
}

function isSafetyRefusal(body: string) {
  try {
    const err = (JSON.parse(body) as { error?: { code?: string; type?: string; message?: string } }).error;
    const s = `${err?.code ?? ""} ${err?.type ?? ""} ${err?.message ?? ""}`;
    return /moderation|content[_ ]policy|safety|rejected by our safety/i.test(s);
  } catch {
    return false;
  }
}
