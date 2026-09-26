import "server-only";
import { flatBackgroundPrompt } from "./gemini";
import { fromFetchError, ProviderError, type GenerateArtworkInput, type GeneratedImage, type ImageGenerationProvider } from "./types";

/**
 * OpenRouter (one key, many image models). Uses the Chat Completions API with
 * `modalities: ["image", "text"]`; images come back as data URLs in
 * `choices[0].message.images[].image_url.url`. One image per call, so
 * variations are parallel calls. Default model: Google's Gemini flash image
 * model, which has no transparency — the flat background is lifted afterwards.
 */
export class OpenRouterImageProvider implements ImageGenerationProvider {
  readonly name = "openrouter";
  readonly supportsTransparency = false;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly appUrl: string,
    private readonly baseUrl = "https://openrouter.ai/api/v1",
  ) {}

  async generateArtwork(input: GenerateArtworkInput): Promise<GeneratedImage[]> {
    const count = Math.min(Math.max(input.count, 1), 4);
    const results = await Promise.allSettled(Array.from({ length: count }, (_, i) => this.one(input, i)));
    const images = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (images.length) return images;
    const errors = results.map((r) => (r as PromiseRejectedResult).reason as ProviderError);
    throw errors.find((e) => e.kind === "REFUSED") ?? errors.find((e) => e.kind === "CONFIG") ?? errors.find((e) => e.kind === "CANCELLED" || e.kind === "TIMEOUT") ?? errors[0];
  }

  private async one(input: GenerateArtworkInput, index: number): Promise<GeneratedImage> {
    const prompt = flatBackgroundPrompt(input);
    const content: object[] = [{ type: "text", text: index ? `${prompt}\nVariation ${index + 1}: a distinctly different composition.` : prompt }];
    if (input.referenceImage) {
      content.push({ type: "image_url", image_url: { url: `data:${input.referenceImage.mime};base64,${input.referenceImage.data.toString("base64")}` } });
      content.push({ type: "text", text: "Create a new variation in the same style and subject as the attached artwork." });
    }
    let res: Response;
    let text: string;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          // OpenRouter app attribution headers
          "HTTP-Referer": this.appUrl,
          "X-Title": "Design Studio",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content }],
          modalities: ["image", "text"],
          image_config: { aspect_ratio: input.aspectRatio === "portrait" ? "3:4" : input.aspectRatio === "landscape" ? "4:3" : "1:1" },
          user: input.endUser,
        }),
        signal: input.signal,
      });
      text = await res.text();
    } catch (err) {
      throw fromFetchError(err, input.signal);
    }

    type Body = {
      error?: { code?: number | string; message?: string };
      choices?: { finish_reason?: string | null; native_finish_reason?: string | null; message?: { images?: { image_url?: { url?: string } }[] } }[];
    };
    let body: Body = {};
    try {
      body = JSON.parse(text);
    } catch {
      if (res.ok) throw new ProviderError("BAD_RESPONSE", "response was not JSON");
    }
    const msg = body.error?.message ?? text.slice(0, 300);
    if (!res.ok || body.error) {
      const status = res.ok ? Number(body.error?.code) || 500 : res.status;
      if (/moderation|flagged|safety|content policy|prohibited/i.test(msg)) throw new ProviderError("REFUSED", msg.slice(0, 300));
      if (status === 401) throw new ProviderError("CONFIG", "OpenRouter rejected the API key (401) — check OPENROUTER_API_KEY");
      if (status === 402) throw new ProviderError("CONFIG", "OpenRouter account has no credit (402) — add credits at openrouter.ai");
      if (status === 404 || /not a valid model|no endpoints|model.*not found/i.test(msg)) throw new ProviderError("CONFIG", `OpenRouter model "${this.model}" is not available — set OPENROUTER_IMAGE_MODEL (${msg.slice(0, 120)})`);
      if (status === 429) throw new ProviderError("RATE_LIMITED", msg.slice(0, 300));
      if (status >= 500) throw new ProviderError("UNAVAILABLE", `${status} ${msg.slice(0, 300)}`);
      throw new ProviderError("BAD_RESPONSE", `${status} ${msg.slice(0, 300)}`);
    }
    const choice = body.choices?.[0];
    const url = choice?.message?.images?.find((i) => i.image_url?.url)?.image_url?.url;
    const m = url?.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
    if (!m) {
      const reason = `${choice?.finish_reason ?? ""} ${choice?.native_finish_reason ?? ""}`;
      if (/content_filter|safety|prohibited|blocklist|image_safety/i.test(reason)) throw new ProviderError("REFUSED", `finish ${reason.trim()}`);
      throw new ProviderError("BAD_RESPONSE", `no image in response (finish ${reason.trim() || "none"}) — is "${this.model}" an image model?`);
    }
    return { data: Buffer.from(m[2], "base64"), mime: m[1], transparent: false };
  }
}
