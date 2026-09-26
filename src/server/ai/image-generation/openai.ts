import "server-only";
import { fromFetchError, fromStatus, ProviderError, type GenerateArtworkInput, type GeneratedImage, type ImageGenerationProvider } from "./types";

/**
 * OpenAI GPT Image (Images API). Native transparent backgrounds, up to 10
 * variations per call. Reference: POST /v1/images/generations and /v1/images/edits.
 *
 * New image models are often gated per account (organisation verification or
 * staged rollout). If the configured model isn't available to this API key,
 * the next model in MODEL_FALLBACKS is tried automatically, so a fresh key
 * works without extra configuration.
 */
const MODEL_FALLBACKS = ["gpt-image-1.5", "gpt-image-1"];

/** Models that accept arbitrary WxH sizes; older ones only take the standard three. */
const FLEXIBLE_SIZE = /^gpt-image-2/;

export class OpenAIImageProvider implements ImageGenerationProvider {
  readonly name = "openai";
  readonly supportsTransparency = true;
  private lastModel: string;

  constructor(
    private readonly apiKey: string,
    private readonly preferredModel: string,
    private readonly quality: string,
    private readonly baseUrl = "https://api.openai.com/v1",
  ) {
    this.lastModel = preferredModel;
  }

  /** the model that produced the most recent result */
  get model() {
    return this.lastModel;
  }

  async generateArtwork(input: GenerateArtworkInput): Promise<GeneratedImage[]> {
    const models = [this.preferredModel, ...MODEL_FALLBACKS.filter((m) => m !== this.preferredModel)];
    let lastError: ProviderError | null = null;
    for (const model of models) {
      try {
        const images = await this.call(model, input);
        this.lastModel = model;
        return images;
      } catch (err) {
        if (!(err instanceof ModelUnavailable)) throw err;
        console.warn(`[ai] openai model ${model} not available to this key (${err.detail}); trying the next model`);
        lastError = new ProviderError("CONFIG", `no access to image models ${models.join(", ")} (last: ${err.detail})`);
      }
    }
    throw lastError ?? new ProviderError("CONFIG", "no image model available");
  }

  private async call(model: string, input: GenerateArtworkInput): Promise<GeneratedImage[]> {
    const common = {
      model,
      prompt: input.prompt,
      n: Math.min(Math.max(input.count, 1), 10),
      size: FLEXIBLE_SIZE.test(model) ? `${input.size.width}x${input.size.height}` : standardSize(input.aspectRatio),
      background: "transparent",
      output_format: "png",
      quality: this.quality,
      user: input.endUser,
    };
    let res: Response;
    let text: string;
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
      text = await res.text();
    } catch (err) {
      throw fromFetchError(err, input.signal);
    }

    if (!res.ok) {
      const err = parseError(text);
      const said = `${err.code} ${err.type} ${err.message}`;
      if (res.status === 400 && /moderation|content[_ ]policy|safety/i.test(said)) throw new ProviderError("REFUSED", err.message.slice(0, 300));
      if (res.status === 401) throw new ProviderError("CONFIG", "OpenAI rejected the API key (401) — check OPENAI_API_KEY");
      if (/insufficient_quota|billing/i.test(said)) throw new ProviderError("CONFIG", `OpenAI account has no available credit (${err.code || res.status}) — add billing/credit at platform.openai.com`);
      if (res.status === 403 || res.status === 404 || /model_not_found|does not exist|verif|not have access|invalid model|unsupported.*model/i.test(said)) {
        throw new ModelUnavailable(`${res.status} ${err.message.slice(0, 160)}`);
      }
      throw fromStatus(res.status, err.message || text);
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

class ModelUnavailable extends Error {
  constructor(readonly detail: string) {
    super(detail);
  }
}

function standardSize(aspect: GenerateArtworkInput["aspectRatio"]) {
  return aspect === "portrait" ? "1024x1536" : aspect === "landscape" ? "1536x1024" : "1024x1024";
}

function parseError(body: string) {
  try {
    const e = (JSON.parse(body) as { error?: { code?: string | null; type?: string | null; message?: string | null } }).error;
    return { code: e?.code ?? "", type: e?.type ?? "", message: e?.message ?? "" };
  } catch {
    return { code: "", type: "", message: body.slice(0, 300) };
  }
}
