import "server-only";

/**
 * Provider-neutral image generation contract. Everything above this layer
 * (service, API, UI) is independent of which AI model produced the artwork.
 */

export type ArtworkAspect = "portrait" | "square" | "landscape";

export type GenerateArtworkInput = {
  /** final, enhanced prompt (see src/domain/ai/prompt-builder.ts) */
  prompt: string;
  /** things the image must not contain; providers without a negative-prompt field fold these into the prompt */
  negativePrompt: string[];
  style: string | null;
  aspectRatio: ArtworkAspect;
  /** requested pixel size (multiples of 16), providers pick their nearest supported size */
  size: { width: number; height: number };
  /** number of variations wanted */
  count: number;
  /** "generate similar": the chosen artwork to base new variations on */
  referenceImage?: { data: Buffer; mime: string } | null;
  productContext: { productName: string; side: "front" | "back" };
  printArea: { name: string; widthMm: number; heightMm: number };
  shirtColour: { name: string; hex: string };
  printMethod: string;
  /** stable, anonymous end-user reference for provider abuse monitoring (a hash, never personal data) */
  endUser: string;
  signal: AbortSignal;
};

export type GeneratedImage = { data: Buffer; mime: string; transparent: boolean };

export interface ImageGenerationProvider {
  readonly name: string;
  readonly model: string;
  /** true if the provider returns real transparent backgrounds */
  readonly supportsTransparency: boolean;
  generateArtwork(input: GenerateArtworkInput): Promise<GeneratedImage[]>;
}

export type ProviderErrorKind =
  /** the provider's safety system declined the request — never retried elsewhere */
  | "REFUSED"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "TIMEOUT"
  | "CANCELLED"
  | "BAD_RESPONSE"
  | "CONFIG";

/** Internal failure; `detail` is for server logs only and never reaches the customer. */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    readonly detail: string,
  ) {
    super(`${kind}: ${detail}`);
    this.name = "ProviderError";
  }
}

/** Maps a failed fetch / HTTP status to a ProviderError. */
export function fromFetchError(err: unknown, signal: AbortSignal): ProviderError {
  if (err instanceof ProviderError) return err;
  if (signal.aborted) {
    const reason = signal.reason;
    return reason instanceof Error && reason.name === "TimeoutError" ? new ProviderError("TIMEOUT", "timed out") : new ProviderError("CANCELLED", "aborted");
  }
  return new ProviderError("UNAVAILABLE", err instanceof Error ? err.message : String(err));
}

export function fromStatus(status: number, body: string): ProviderError {
  if (status === 429) return new ProviderError("RATE_LIMITED", body.slice(0, 500));
  if (status === 401 || status === 403) return new ProviderError("CONFIG", `auth failed (${status})`);
  if (status >= 500) return new ProviderError("UNAVAILABLE", `${status} ${body.slice(0, 300)}`);
  return new ProviderError("BAD_RESPONSE", `${status} ${body.slice(0, 500)}`);
}
