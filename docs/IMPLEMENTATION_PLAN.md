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
| 1 Foundation | in progress |
| 2–11 | not started |

(Updated as work lands — see git history for detail.)
