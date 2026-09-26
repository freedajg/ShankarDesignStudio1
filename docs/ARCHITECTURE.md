# Architecture

## 1. Placement in the repository

This repository already contains **VoiceLab** (an unrelated Vite + Netlify app at the repo root). Per the "do not overwrite an existing project" rule, the Design Studio is a **self-contained application in `design-studio/`** with its own `package.json`, lockfile, docs and tests. Nothing at the repo root is modified. The folder can be moved to its own repository later (`git subtree split --prefix design-studio`) without code changes.

## 2. Stack

| Concern | Choice | Why |
|---|---|---|
| App framework | **Next.js 16 (App Router) + React 19 + TypeScript** | Server components for catalogue/admin, route handlers for APIs, one deployable unit (Vercel). |
| Styling / UI | **Tailwind CSS v4** + shadcn-style components on **Radix primitives** | Accessible dialogs, sheets, selects, tooltips without a heavy UI kit. Components live in `src/components/ui` and are owned code. |
| Design editor | **Fabric.js 7** | Mature object model (selection, transform handles, touch), serialisation-agnostic. Used as the *view*; the design JSON is the source of truth. |
| Validation | **Zod 4** | One schema per boundary (design JSON, API bodies, settings), shared client/server. |
| Database | **PostgreSQL** via **Drizzle ORM** — **Supabase Postgres** in production, **PGlite** (Postgres compiled to WASM) for local dev & tests | Same SQL migrations everywhere. PGlite makes the app runnable with `npm run dev` and no Docker (this build environment has none), and makes integration tests run against real Postgres semantics instead of mocks. |
| Auth | Built-in **session auth** (scrypt password hashes, random session tokens stored hashed, httpOnly cookies) + **role table** | See §6. Behind an `auth` service so Supabase Auth can replace it. |
| File storage | `StorageService` interface — **Supabase Storage** (prod, private buckets, signed URLs) / **local disk** (dev) | Binary files never in Postgres. |
| Image processing | **sharp** | Header-independent format detection, decode validation, EXIF-orientation, metadata strip, re-encode, thumbnails. |
| Production rendering | **@napi-rs/canvas** (Skia) | Renders print files from the design JSON server-side. Uses the *same* `.woff2` font files and the *same* drawing code as the browser. |
| Payments | `PaymentProvider` interface — **Razorpay** (prod) / **Development provider** (explicitly labelled; refused in production) | India-first; swappable. |
| Email | `EmailProvider` — **Resend** (prod) / **console logger** (dev) | |
| PDF | **pdf-lib** | Order summary / job sheet PDF. |
| Tests | **Vitest** (unit + integration on PGlite), **Playwright** (E2E) | |
| Hosting | **Vercel** + Supabase | Standalone app linked from both storefronts. |

Technical spike results (2026-09-26): `@napi-rs/canvas` registers the fontsource `.woff2` files and rasterises SVG; PGlite 0.5.8 runs PostgreSQL 18 through `drizzle-orm/pglite`.

## 3. Layers

```
src/app/…                 UI: pages, layouts, route handlers (thin: parse → call service → respond)
src/components/…          Presentational + client components (studio, admin, ui kit)
src/server/services/…     Application services: catalogue, designs, artwork, cart, checkout, orders,
                          payments, production, auth, audit. Own transactions and authorization.
src/domain/…              Pure business logic, no I/O: design schema & geometry, text layout,
                          pricing engine, order state machine, money, artwork rules.
                          Shared by browser and server; 100% unit-testable.
src/server/db/…           Drizzle schema, client factory (PGlite | postgres-js), migrations, seed.
src/server/adapters/…     Storage, payment, email, print-method adapters.
```

Rules: components never compute prices or decide authorization; route handlers never contain business rules; domain code never imports server or React code.

## 4. The design model (the heart)

The canonical design is a versioned JSON document (`src/domain/design/schema.ts`):

```jsonc
{
  "schemaVersion": 1,
  "productId": "…", "colourId": "…",
  "surfaces": {
    "front": { "printAreaCode": "FULL_FRONT", "elements": [ /* bottom → top */ ] },
    "back":  { "printAreaCode": "FULL_BACK",  "elements": [] }
  }
}
```

- **Units are millimetres relative to the chosen print area's top-left corner.** Positions are element centres; rotation in degrees. Physical units make the design viewport-independent *and* directly printable: `px = mm × dpi / 25.4`.
- Text elements: `text, fontId, fontSize (mm em-size), fill, bold, italic, align, lineHeight, letterSpacing`. On-canvas scaling is folded back into `fontSize` so a text element has no hidden scale.
- Image elements: `assetId, width, height (mm)`, aspect locked to the asset.
- Array order = layer order.
- Colour and size are **not** part of the elements, so switching them cannot touch the design. The studio's colour/size/quantity state lives beside the design, never inside Fabric.

**One drawing implementation.** `src/domain/render/` holds `layoutText()` and `drawElement(ctx, element, …)` written against the standard Canvas 2D API. In the browser, a small custom Fabric object calls this code in its `_render`; on the server, the production renderer calls the same code on a Skia canvas. Text measured and drawn by the same function with the same font files is what makes the print file match the preview.

**Editor ↔ model sync.** Fabric fires `object:modified`; the studio converts the object's transform back to mm and updates the store. Panel edits update the store; a reconciler updates Fabric objects by element id. Fabric is never serialised as the source of truth.

**Print-area enforcement.** Geometry helpers compute each element's rotated bounding box. The editor clamps moves/scales into the area (and shows the dashed safe area). The server re-validates every design before a version is created, measuring text on the server with the same fonts.

## 5. Persistence and "never lose a design"

| Layer | When | What |
|---|---|---|
| `localStorage` draft | every change (debounced 300 ms) | full studio state keyed by design id; recovered on reload |
| Server draft (`designs.draft_json`) | autosave 2 s after last change, and on tab hide | mutable working copy, owned by a design-owner cookie or user |
| `design_versions` | explicit Save, Add to cart | immutable snapshot; cart items and orders point here |

Editing a saved design creates version N+1; version N (possibly in an order) never changes. A `beforeunload` guard warns while a save is pending/failed. The save state is always visible ("Saved", "Saving…", "Not saved — Retry").

## 6. Authentication and authorization

- **Customers** do not need accounts (guest checkout). Ownership of anonymous work is proven by random, httpOnly cookies whose hashes are stored: `sg_owner` (designs & uploads), `sg_cart` (cart). Orders get a 32-byte access token; the confirmation link carries it and only its hash is stored. Order lookups require the token (or staff role) → no IDOR by order number.
- **Staff** log in with email + password (scrypt, per-user salt, constant-time compare). Sessions: 32-byte random token in an httpOnly, `SameSite=Lax`, `Secure` (in prod) cookie; only SHA-256 of the token stored; 7-day expiry.
- **Roles**: `CUSTOMER`, `ADMIN`, `PRODUCTION` (enum; `SALES`, `DESIGNER`, `SUPER_ADMIN` can be added). `requireRole()` is called inside every admin page, route handler and server action — `proxy.ts` only does an optimistic redirect.
- Why not Supabase Auth for V1: staff are a handful of accounts and customers are guests, so the only auth needed is staff login; a built-in implementation keeps local dev and tests self-contained. The `auth` service is the seam if Supabase Auth (magic links for customers) is added with accounts in V2.
- **CSRF**: state-changing requests are JSON `POST`/`PATCH` from same-origin fetches; route handlers verify the `Origin` header matches the host.

## 7. Payments

```
POST /api/checkout            server validates cart, re-prices, creates order (PAYMENT_PENDING) + payment
                              via provider.createOrder(amount computed server-side)
client opens provider UI      Razorpay Checkout.js | dev payment screen
POST /api/payments/verify     provider.verify(signature) → markPaid() (idempotent)
POST /api/payments/webhook    Razorpay webhook (HMAC over raw body) → markPaid() (idempotent)
```

`markPaid` runs in a transaction: locks the payment row, no-ops if already PAID, checks amount/currency equals the order total, decrements tracked inventory (fails the order into manual review on conflict), sets order PAID → DESIGN_REVIEW, records history, sends confirmation. Unique `provider_payment_id` makes duplicate callbacks harmless.

The **development provider** signs with a server-only secret, is labelled "Development payment — no money moves" in the UI, and is refused when `NODE_ENV=production` unless `ALLOW_DEV_PAYMENTS=true` is set explicitly.

## 8. Artwork pipeline

Upload → size limit → sharp detects the real format from content (PNG/JPEG only in V1; the allow-list lives in `domain/artwork/rules.ts` so SVG/PDF can be added with their own sanitiser) → decode fully (rejects corrupt/bomb files via pixel limit) → store **original** as-is in `artwork-originals` → **processed** copy (auto-oriented, metadata stripped, PNG) in `artwork-processed` → preview-size WebP for the editor → metadata row (dimensions, alpha present/used, sha256). Quality checks produce warnings: effective DPI at placed size, JPG/no-alpha background, very small source. Nothing is changed silently.

## 9. Production files

`PrintMethodAdapter` (`src/server/adapters/print-methods/`) per method:

| Method | Output in V1 | Honest limitation shown to staff |
|---|---|---|
| DTF | transparent PNG at physical print size, 300 DPI, per placement | none beyond artwork-quality warnings |
| Vinyl | same PNG + colour count estimate | cutting needs vector artwork; file is a reference unless art is solid-colour |
| Embroidery | placement reference PNG + physical dimensions | must be digitised (DST/PES) by a digitiser; stitch file is not generated |

Plus: `SG-xxxxx_DESIGN.json` (the exact design version), `SG-xxxxx_ORDER.pdf` (job sheet: sizes, placements, dimensions, previews), originals. Files are generated on demand, stored in `production-files`, and regenerated deterministically from the JSON.

## 10. Storage buckets

`artwork-originals`, `artwork-processed`, `design-previews`, `production-files` — all private. Browser access goes through route handlers that check ownership/role and then stream (dev) or redirect to a short-lived signed URL (Supabase).

## 11. Integration with existing sites

The studio is standalone. Entry points are plain links:
- The T-Shirt Shop "Customize" → `https://studio…/studio/crew-tshirt`
- Sweet Ginger Basics "Custom/Bulk order" → `…/studio/polo?mode=bulk`

Order sync to the existing store is an open question (see OPEN_QUESTIONS.md); an outbound "order paid" hook point exists in `markPaid`.

## 12. Environments

| Var | Dev | Prod |
|---|---|---|
| `DATABASE_URL` | unset → PGlite at `.data/pglite` | Supabase pooled connection string |
| `STORAGE_DRIVER` | `local` (`.data/storage`) | `supabase` + `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server only) |
| `PAYMENT_PROVIDER` | `dev` | `razorpay` + `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| `EMAIL_PROVIDER` | `console` | `resend` + `RESEND_API_KEY` |

`src/server/env.ts` validates env at startup with clear messages; production refuses dev drivers unless explicitly allowed.
