# AI Design Generation

Customers describe an idea in words; AI produces print-oriented artwork that lands on the existing canvas as an ordinary image element — movable, resizable, rotatable, layered, saved, priced, ordered and printed exactly like uploaded artwork.

## 1. What already existed (inspected before changing anything)

| Area | Implementation |
|---|---|
| App | Next.js 16 App Router + React 19 + TypeScript, Tailwind v4 tokens in `src/app/globals.css` |
| Canvas | Fabric.js 7 as a *view* over the design store (`src/components/studio/stage.tsx`) |
| Design state | Zustand store (`studio/store.ts`) holding the canonical `DesignDoc` (`src/domain/design/schema.ts`): per-side print area + ordered elements in millimetres; `image` elements reference an `assetId` |
| Artwork | `POST /api/artwork` → `processUpload()` (`server/services/artwork.ts`): content-sniffed PNG/JPEG, full decode, ORIGINAL kept byte-for-byte + PROCESSED PNG + WebP preview in private storage, `artwork_assets` rows owned by the browser's `sg_owner` cookie |
| Persistence | local draft + server autosave + immutable `design_versions` (with `design_version_assets` FK links) |
| Pricing / cart / orders | unchanged by this feature — an AI image is just an image element, so pricing, cart, order snapshots, print files and admin downloads work unmodified |

## 2. Provider research (September 2026)

Official docs sites were not reachable from the build environment, so models and parameters were verified against the **official SDK type definitions** published this month (`openai@7.23.0`, `@google/genai@2.24.0`) and search results from the providers' docs.

| | OpenAI GPT Image 2.5 | Google Gemini 3.1 Flash Image |
|---|---|---|
| Model IDs | `gpt-image-2.5-flare` (faster), `gpt-image-2.5-sunburst` (more detailed); dated snapshots `…-2026-09-08` | `gemini-3.1-flash-image` (also `gemini-3-pro-image`) |
| Endpoint | `POST /v1/images/generations`, `POST /v1/images/edits` (reference image) | `POST /v1beta/models/{model}:generateContent`, `responseModalities: ["IMAGE"]` |
| Transparent background | **Yes, native**: `background: "transparent"` + `output_format: "png"` | Not supported by the Gemini API |
| Size | arbitrary `WxH` (multiples of 16, aspect 1:3–3:1, ≤ 3840×2160; > 2560×1440 experimental) | `imageConfig.aspectRatio` (1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9), `imageSize` 1K/2K/4K |
| Variations | `n` = 1–10 per request | one image per request (parallel calls) |
| Output | base64 PNG/WebP/JPEG | base64 `inlineData` |
| Safety | provider moderation (`moderation: "auto"`), refusals returned as errors | `promptFeedback.blockReason` / finish reasons |

**Selected:** OpenAI `gpt-image-2.5-flare` as the **primary** provider — native transparency is the decisive requirement for apparel artwork (no lossy background removal), plus print-friendly custom sizes, multiple variations per call and image-conditioned "generate similar". **Fallback:** Gemini `gemini-3.1-flash-image`, used only if configured. Gemini is asked for a plain flat background (black on dark shirts, white on light) which `background.ts` lifts off conservatively — only when the border is one uniform colour and only pixels connected to it; if that isn't safe the image is kept as-is and the customer sees the standard "no transparent background" print warning. The provider's untouched output is always stored as the ORIGINAL. Model IDs are configuration (`OPENAI_IMAGE_MODEL`, `GEMINI_IMAGE_MODEL`), not code.

Pricing and rate limits are account-specific; check the provider console before launch. Generation is metered here by `AI_MAX_GENERATIONS_PER_SESSION` and `AI_VARIATIONS`.

## 3. Pipeline

```
customer prompt + style/orientation (+ optional refinement / reference image)
  → PromptInterpreter  (src/domain/ai/interpreter.ts — deterministic, testable)
      subject, style, mood words, colours, requested lettering, composition, apparel context
  → PromptBuilder      (src/domain/ai/prompt-builder.ts)
      print-artwork prompt: isolated artwork, no garment / model / mockup / watermark,
      contrast for the shirt colour, complexity for the print-area size,
      print-method guidance (configurable, src/domain/ai/print-guidance.ts),
      requested words kept OUT of the image by default (added as editable canvas text instead)
  → ImageGenerationProvider (primary → fallback)   src/server/ai/image-generation/
  → processing: same validated pipeline as uploads (ORIGINAL kept, PROCESSED PNG, preview),
      source = AI, quality warnings at the placed print size
  → ai_generations / ai_generation_images history rows
  → customer picks a variation → studio.addImage(asset)  (identical to an upload)
```

The interpreter is rule-based on purpose: it is instant, free, deterministic and unit-tested. The `PromptInterpreter` interface allows an LLM-based interpreter to be plugged in later.

Progress is streamed from the server as NDJSON stages (`interpreting → generating → processing → done`), so the status messages the customer sees are real. Cancelling aborts the request; the provider call receives the abort signal.

## 4. Data

- `ai_generations`: owner (session cookie hash), parent generation (for refine / similar), prompt, refinement, interpretation JSON, final prompt, provider, model, status, error code, product/colour/print-area/method context, timestamps.
- `ai_generation_images`: generation, index, processed `artwork_assets` id, selected-at.
- `artwork_assets.source`: `UPLOAD` | `AI`.
- Designs reference AI images through `assetId` exactly like uploads, so versions, carts, orders and production files keep the artwork permanently (never a temporary provider URL).

## 5. Limits, security, safety

- API keys are server-only env vars; all calls go through `/api/ai/*`; nothing provider-specific reaches the browser.
- Per-session cap (`AI_MAX_GENERATIONS_PER_SESSION`, default 10) per browser (owner cookie) over a rolling 24 hours, counted in the database (the slot is reserved before calling the provider, so parallel requests can't exceed it; provider failures don't count, refusals do). Plus rate limits: 6 per minute per browser, 40 per hour per IP.
- Safety refusals are never retried with the fallback provider.
- Prompt length limits; context (product, colour, area, method) is re-loaded from the database, never trusted from the client.
- Provider safety systems are respected, never bypassed; refusals show "This request can't be generated. Try describing a different design idea." Internal errors are logged, never shown.
- A `fixture` provider exists **only for automated tests** (refused in production unless `AI_ALLOW_FIXTURE=true`, which only the E2E harness sets).

## 6. Customer experience

- Design panel empty state: *Design your T-shirt — What would you like to create?* with **Add Text**, **Upload Artwork**, **✨ Generate with AI**; on phones the same card floats over the stage and an **AI** tab sits in the bottom bar.
- Generator (dialog on desktop, full screen on phones): prompt, six example ideas, 12 optional styles, *More options* (shape, draw words into the artwork), the product context it will design for, remaining quota.
- Real staged progress with Cancel; friendly errors with Try again; refusals explained.
- Results: variations previewed on the shirt colour, **Use this design** / **Generate similar**, *Want changes?* refinement, recent AI designs.
- Words in the prompt (e.g. *the words STAY WILD*) are left out of the image and added as editable text under the artwork (one undo step). Tick *Draw the words into the artwork* to get AI lettering instead.
- Placed AI artwork is a normal image element: move, resize, rotate, duplicate, delete, layer, front/back, pricing, cart, order, print files.
- Staff see *AI-generated* on order artwork (with the prompt on hover) and download the stored original and processed files.

## 7. Configuration

| Variable | Default | |
|---|---|---|
| `OPENAI_API_KEY` | — | enables OpenAI |
| `GEMINI_API_KEY` | — | enables Gemini |
| `AI_IMAGE_PROVIDER` | `auto` | `auto` (first with a key) · `openai` · `gemini` · `off` |
| `AI_FALLBACK_PROVIDER` | `auto` | `auto` (the other configured one) · `openai` · `gemini` · `none` |
| `OPENAI_IMAGE_MODEL` / `GEMINI_IMAGE_MODEL` | `gpt-image-2.5-flare` / `gemini-3.1-flash-image` | |
| `AI_IMAGE_QUALITY` | `medium` | OpenAI quality (cost vs detail) |
| `AI_VARIATIONS` | `3` | options per generation (1–4) |
| `AI_MAX_GENERATIONS_PER_SESSION` | `10` | per browser per 24 h; `0` disables AI |
| `AI_TIMEOUT_MS` | `170000` | provider timeout |

## 8. Not built (P2)

Upscaling ("Enhance for printing"), AI lifestyle mockups, LLM prompt interpreter, full background removal for busy AI backgrounds.
