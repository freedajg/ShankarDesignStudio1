# Test Plan

Commands: `npm test` (Vitest unit + integration), `npm run test:e2e` (Playwright against a production build with a fresh PGlite DB and the dev payment provider).

## Unit (pure domain, `tests/unit`)
- Money: paise arithmetic, rounding half-up, formatting.
- Pricing: base by channel, size adjustment, print cost per side, extra placement, tier selection (boundaries: min−1, min, above), per-size units, tax inclusive/exclusive, shipping threshold, B2B minimum violation, zero/negative quantities rejected.
- Quantities: size breakdown totals, empty breakdown, 5,000-piece orders.
- Design schema: valid/invalid documents, unknown fonts, bad colours, oversized strings, schema version.
- Geometry: rotated bounding boxes, inside/outside print area, clamping.
- Text layout: line splitting, alignment, width/height from measurements.
- Order state machine: allowed/forbidden transitions per role, notes required for backward moves.
- Artwork rules: DPI calculation, warnings.
- Auth crypto: password hash/verify, token hashing, constant-time compare.

## Integration (services on in-memory PGlite, `tests/integration`)
- Migrations apply on a fresh database; seed is idempotent.
- Catalogue queries return only active items.
- Design: create draft, autosave, create version, versions immutable, ownership enforced, invalid design rejected server-side (outside print area).
- Artwork: valid PNG/JPEG accepted; renamed text file, corrupt image, oversized image rejected; original + processed stored.
- Cart: add item re-prices server-side (client price ignored), size breakdown persisted, channel conflict.
- Checkout: order with snapshots; order without design refused; B2B requires company name and minimum quantity.
- Payment: verify good signature → PAID; bad signature → rejected; duplicate verify/webhook → single application; amount mismatch → rejected; failure keeps design and order; inventory conflict → flagged.
- Orders: customer with wrong/no token cannot read another order; staff role required for admin services; status transitions recorded with actor.

## E2E (Playwright, `e2e/`)
1. **B2C acceptance** (BUSINESS brief §53): product → black → text (font, colour, move, resize) → PNG upload (move, rotate) → back side different artwork → front → change colour → both sides intact → size & quantity → price updates → cart → design attached → checkout → dev payment success → admin sees order, exact design, downloads artwork, changes status.
2. **B2B acceptance** (§54): polo → colour → logo + company name → front area → back design → size breakdown → total updates → tier activates → company details → order → admin sees breakdown, artwork, print config → downloads → moves to production.
3. Colour change / size change / front-back persistence; refresh recovery.
4. Invalid artwork shows an error; low-res artwork shows a warning.
5. Unauthorised admin access redirects to login; admin API returns 401/403.
6. Order page without token → not found.
7. Failed payment → order pending, retry possible, design intact.

## Current results
- `npm test`: 58 passing (unit + integration on in-memory Postgres, real image processing and rendering).
- `npm run test:e2e`: 9 passing (desktop Chromium + Pixel 7) against a production build.

## Production-readiness checklist

| Area | Item | State |
|---|---|---|
| Customer | product/colour/size selection, text, upload, move/resize/rotate/delete, front/back, print area | ✅ E2E |
| Customer | design persists across colour/size/quantity/side/refresh | ✅ E2E |
| Customer | live price, B2C, B2B size breakdown + tiers, cart, checkout | ✅ E2E |
| Backend | DB constraints, server-side pricing, payment verification (dev), idempotency, inventory | ✅ integration |
| Backend | authorization (staff roles, owner cookies, order tokens), upload validation, private storage, audit | ✅ integration + E2E |
| Backend | Razorpay live sandbox, Supabase storage live | ⚠️ not yet exercised (no credentials) |
| Admin | order list, detail, design preview, downloads, production files, status + history | ✅ E2E |
| Quality | mobile flow, error/empty/loading states, keyboard-operable controls | ✅ E2E / manual |
| Quality | CSP header, formal accessibility audit (screen reader pass), load test | ⚠️ pending |
