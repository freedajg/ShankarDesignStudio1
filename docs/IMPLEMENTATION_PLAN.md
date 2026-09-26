# Implementation Plan

Vertical slices; each milestone ends with: app runs → tests pass → UX reviewed → docs updated → summary. No milestone starts with known critical bugs in the previous one.

| # | Milestone | Deliverables | Exit criteria |
|---|---|---|---|
| 1 | Foundation | Next.js app in `design-studio/`, Tailwind tokens + UI kit, env validation, Drizzle schema + migrations (PGlite/postgres), seed with demo data, staff session auth + roles, `proxy.ts` optimistic guard, admin login page, Vitest set-up | `npm run dev` works with zero config; migrations apply; unit tests for auth/crypto/env; admin login works and unauthorised access is refused |
| 2 | Catalogue | Product listing and product pages from DB; colours, sizes, price and bulk-price display; generated garment mockups (mask + shade) per style/side | products render from seed; inactive items hidden |
| 3 | Design engine | Studio route; Fabric stage; shared text layout/draw; add/edit text; upload (validated, processed); move/scale/rotate/duplicate/delete/layers; front/back; print-area choice + clamp; accessible layers panel; mobile layout | B2C acceptance steps 1–16 manually and in E2E |
| 4 | Persistence | local draft, server autosave, explicit save → immutable versions, reopen by link, save-state indicator, unload guard | refresh recovery test; version immutability test |
| 5 | Pricing | domain pricing engine + tests; pricing API; live price panel; single/bulk modes; size breakdown steppers; tier display | unit tests for all rules; UI updates immediately |
| 6 | Cart | server cart; add-to-cart creates version + server price; cart page with thumbnails, per-size quantities, edit design, remove | design stays attached; client price ignored |
| 7 | Checkout & payment | checkout form (B2C/B2B fields), order creation with snapshots, payment provider interface, dev provider, Razorpay provider + webhook, confirmation page with private link, email provider | integration tests: order creation, verify, duplicate callback, failure, inventory conflict |
| 8 | Admin | dashboard, order list (search/filter/sort/page), order detail, status workflow + history, audit log | role tests; IDOR tests |
| 9 | Production | server renderer (previews + print PNGs), print-method adapters, JSON/PDF exports, downloads with meaningful filenames, artwork warnings in admin | print file dimensions = physical size × DPI; text matches preview |
| 10 | Hardening | E2E B2C + B2B acceptance flows, security review, rate limiting, error/empty/loading states, a11y + mobile pass, performance check | all tests green; checklist in TEST_PLAN.md |
| 11 | Optional AI | background removal, text-to-design, AI mockups — as additional asset versions | never replaces the structured design |

## Status

| Milestone | Status |
|---|---|
| 1 Foundation | ✅ app, tokens + UI kit, schema + migrations, demo seed, staff auth, proxy guard |
| 2 Catalogue | ✅ product grid, product pages with engine-computed bulk tables, bulk landing, generated mockups |
| 3 Design engine | ✅ Fabric view over the design store; text + PNG/JPG; move/scale/rotate constrained to print area; front/back; area switching; undo/redo; layers; keyboard; mobile sheets |
| 4 Persistence | ✅ local drafts, server autosave, immutable versions, reopen by link, refresh/offline recovery |
| 5 Pricing | ✅ single pricing engine (tiers, size adjustments, per-side print cost, tax, shipping) |
| 6 Cart | ✅ server-priced cart with size breakdown, stock + ownership checks, previews of the frozen design |
| 7 Checkout & payment | ✅ idempotent checkout, Razorpay + dev providers, signature/webhook verification, retry, emails |
| 8 Admin | ✅ dashboard, order list (search/filter/sort/page), order detail, role-aware status workflow, audit |
| 9 Production | ✅ 300 DPI physical-size print PNGs, DTF/vinyl/embroidery adapters, design JSON, PDF job sheet, artwork downloads |
| 10 Hardening | ✅ 58 unit/integration + 9 Playwright E2E tests (B2C + B2B acceptance, persistence, security, mobile) — see gaps below |
| 11 Optional AI | not started |

## Known gaps (honest list)

- **Razorpay** is implemented against its documented Orders API, checkout signature and webhook HMAC, but has **not been exercised against a live/test Razorpay account** (no keys in this environment). Run one sandbox payment before going live.
- **Supabase Storage driver** is implemented against the Storage REST API but untested against a live project. Create the four private buckets listed in ARCHITECTURE §10.
- **Admin catalogue/pricing editing** is not built yet: products, prices, tiers, print areas and settings are data (seed/SQL), not code — an admin CRUD screen is the next step.
- **Customer accounts** (saved-design list, order history, reorder button) are not built. The data model supports them: designs are versioned and reopenable by link on the same device; a reorder is "open design → add to cart".
- **B2B offline payment** (bank transfer / invoice) and a **quote workflow** above a quantity threshold are not built (OPEN_QUESTIONS #12, #25).
- **Content-Security-Policy** header not yet set (other security headers are).
- **Mockups** are generated silhouettes; replace with real flat-lay photography (mask + shade layers) per OPEN_QUESTIONS #24.
- E2E covers moving/rotating via the accessible controls; direct mouse/touch dragging on the canvas is exercised manually and by the constraint unit tests, not by an E2E gesture.
- `rate_limits` rows are never pruned (tiny table; add a periodic cleanup).
- With the embedded dev database, stop `npm run dev` before running `npm run db:*` commands (one process per PGlite directory).
