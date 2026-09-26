import "server-only";
import { env } from "@/server/env";
import { FixtureImageProvider } from "./fixture";
import { GeminiImageProvider } from "./gemini";
import { OpenAIImageProvider } from "./openai";
import { OpenRouterImageProvider } from "./openrouter";
import type { ImageGenerationProvider } from "./types";

export * from "./types";

/**
 * Builds the provider chain from server environment variables. API keys are
 * read here and nowhere else; they never leave the server.
 *
 *   AI_IMAGE_PROVIDER     auto | openai | gemini | openrouter | fixture | off   (auto: the first one with a key)
 *   AI_FALLBACK_PROVIDER  auto | openai | gemini | openrouter | none            (auto: the next configured one)
 */
export function imageProviders(): ImageGenerationProvider[] {
  const e = env();
  const make = (name: string): ImageGenerationProvider | null => {
    switch (name) {
      case "openai":
        return e.OPENAI_API_KEY ? new OpenAIImageProvider(e.OPENAI_API_KEY, e.OPENAI_IMAGE_MODEL, e.AI_IMAGE_QUALITY) : null;
      case "gemini":
        return e.GEMINI_API_KEY ? new GeminiImageProvider(e.GEMINI_API_KEY, e.GEMINI_IMAGE_MODEL) : null;
      case "openrouter":
        return e.OPENROUTER_API_KEY ? new OpenRouterImageProvider(e.OPENROUTER_API_KEY, e.OPENROUTER_IMAGE_MODEL, e.APP_URL) : null;
      case "fixture":
        // never silently used by a real deployment
        return e.NODE_ENV !== "production" || e.AI_ALLOW_FIXTURE ? new FixtureImageProvider(e.AI_FIXTURE_DELAY_MS) : null;
      default:
        return null;
    }
  };

  if (e.AI_IMAGE_PROVIDER === "off") return [];
  const REAL = ["openai", "gemini", "openrouter"];
  const primaryName = e.AI_IMAGE_PROVIDER === "auto" ? (REAL.find((n) => make(n)) ?? null) : e.AI_IMAGE_PROVIDER;
  const primary = primaryName ? make(primaryName) : null;
  if (!primary) return [];

  const fallbackName =
    e.AI_FALLBACK_PROVIDER === "auto" ? (REAL.find((n) => n !== primary.name && make(n)) ?? null) : e.AI_FALLBACK_PROVIDER === "none" ? null : e.AI_FALLBACK_PROVIDER;
  const fallback = fallbackName && fallbackName !== primary.name ? make(fallbackName) : null;
  return fallback ? [primary, fallback] : [primary];
}

export function aiEnabled() {
  return imageProviders().length > 0;
}
