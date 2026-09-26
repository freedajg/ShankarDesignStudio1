# Sweet Ginger Design Studio — Product Requirements

Status: living document · Owner: product/engineering · Source brief: "Shankar: a customizable T-shirt design studio" + master build prompt.

## 1. Problem

Sweet Ginger Fashions (Jaipur; founder/CEO Shankar Hemrajani) sells blanks wholesale (Sweet Ginger Basics), retails through The T-Shirt Shop, and prints/customizes through Ginger Prints (DTF, embroidery, vinyl). Every custom order today is a WhatsApp/email back-and-forth: artwork sent as attachments, placement explained with screenshots, sizes counted by hand, quotes calculated manually. Orders arrive incomplete, slowly, and in a form production cannot act on directly.

## 2. Goal

A self-service studio where a customer picks a garment, designs on it, sees it on the real shirt colour, chooses quantities, sees the price, and pays — and where the captured order is **complete enough for the print floor to manufacture without a follow-up conversation**.

Success is measured by:

| Metric | Target (to confirm with Shankar) |
|---|---|
| Custom orders completed without a WhatsApp/email exchange | majority of B2C orders |
| Orders reaching production with all artwork/placement data | 100% (hard rule) |
| Time from "I want custom tees" to paid order (B2C) | minutes, not days |
| Bulk quote turnaround (B2B) | instant for standard tiers |

## 3. Users

| User | Needs |
|---|---|
| **B2C customer** (The T-Shirt Shop) | 1–few shirts, phone-first, wants to see it on the shirt, pay online, no account |
| **B2B buyer** (Sweet Ginger Basics: corporates, events, resellers) | 20–5,000 pcs, size breakdown, bulk price, company/GST/PO details, logo placement |
| **Admin / sales** | See every order with its design, pricing, customer; move orders through the workflow |
| **Production** | Download print-ready files per placement and method; see size breakdown; update production status |

## 4. Scope

### V1 (this build)
1. Product picker — crew T-shirt, oversized T-shirt, polo; colours, sizes, price and bulk-price display. Database-driven so hoodies/sweatshirts/caps are data, not code.
2. Design canvas — text (font, size, colour, bold/italic where the font supports it, alignment) and PNG/JPG artwork; move, scale, rotate, duplicate, delete, layer order; front and back; a print area the design cannot leave.
3. Live preview — design rendered on the chosen shirt colour with garment shading so it reads as printed, not pasted.
4. Order — B2C quantity per size/colour, B2B size breakdown, live price with bulk tiers.
5. Cart and checkout — design version frozen into the cart and the order; price snapshot; guest checkout; Razorpay behind a provider interface (development provider when keys are absent).
6. Admin — dashboard, order list (search/filter/sort/paginate), order detail with front/back design, artwork and production file downloads, status workflow with history.
7. Production files — per-placement print artwork at physical size, design JSON, order summary; print-method adapters (DTF, embroidery, vinyl) that are honest about what each file is.
8. Persistence — local draft recovery, server autosave, explicit save with versions, reopen a saved design by link.

### V2 (after core commerce works)
- Customer accounts (saved designs list, order history, reorder, invoices, addresses).
- AI: background removal, text-to-design generation, lifestyle mockups — always as *additional* versions, never replacing the structured design.
- SVG/PDF artwork, admin CRUD for catalogue and pricing, B2B quote-approval workflow, store sync with the existing Shopify-style storefront.

### Out of scope
Rebuilding thetshirtshop.in or sweetginger.net. The studio is a standalone app those sites link to ("Customize" → studio, "Custom/Bulk order" → studio in bulk mode).

## 5. Core journey

```
Products → Studio(product, colour) → add text / upload art → place (move/scale/rotate) → front/back
        → pick sizes & quantities (single or bulk) → live price → Add to cart
        → Cart (design thumbnail, sizes, price) → Checkout (contact, address, company/GST/PO for B2B)
        → Pay (Razorpay / dev) → Confirmation (order number, private link)
        → Admin: DESIGN_REVIEW → APPROVED → IN_PRODUCTION → PRINTED → QC → SHIPPED → DELIVERED
```

## 6. Functional requirements (acceptance-level)

**Catalogue**
- F1 Products, colours, sizes, variants, print areas, print methods, prices and tiers come from the database.
- F2 Inactive products/colours/variants cannot be designed on or ordered; out-of-stock variants cannot be ordered.

**Studio**
- F3 Add/edit/delete/duplicate text; font from a curated library; size; colour; bold/italic when available; alignment.
- F4 Upload PNG/JPG (validated server-side: real image, type, size, dimensions); move/scale/rotate/duplicate/delete/reorder.
- F5 Each side (front/back) has its own elements and its own print area choice (e.g. full front vs left chest).
- F6 Elements cannot leave the print area: the editor keeps them inside, shows the safe area, and the server rejects designs that violate it.
- F7 Changing colour, size, quantity, side, print area, or viewport never discards elements.
- F8 Artwork quality warnings (e.g. low effective DPI at the chosen print size, JPG has no transparency) — warnings, never silent changes.
- F9 Keyboard-accessible controls for every canvas operation (select layer, nudge, rotate, scale, delete).

**Pricing**
- F10 Price is computed by one pricing engine from configuration: garment base (by channel) + variant adjustment + print cost per decorated placement + extra-placement charge, with quantity tiers per channel, tax and shipping from settings.
- F11 Price updates live in the studio; the server recomputes on add-to-cart and at checkout; the client amount is never trusted.

**Cart / order**
- F12 A cart item references an immutable design version and stores a price snapshot and a per-size breakdown.
- F13 An order cannot be created from an item without a design containing at least one element (not printable → not orderable).
- F14 Orders snapshot customer, address, product names, colours, SKUs, prices; later catalogue/pricing edits do not change them.
- F15 Guest checkout; B2B adds company name, optional GSTIN, optional PO reference.

**Payment**
- F16 Server-created payment order for the server-computed amount; server-side signature verification; idempotent handling of duplicate callbacks/webhooks.
- F17 Payment failure keeps the order (PAYMENT_PENDING) and the design; the customer can retry.

**Admin / production**
- F18 Staff-only area (ADMIN, PRODUCTION roles) with server-side authorization on every route/action.
- F19 Dashboard counts and revenue; order list with search/filter/sort/pagination.
- F20 Order detail shows customer, company, items, colour, size breakdown, front/back rendered previews, artwork, print method/area, pricing, payments, status history.
- F21 Downloads with meaningful names: `SG-10452_FRONT_DTF.png`, `SG-10452_DESIGN.json`, `SG-10452_ORDER.pdf`, original uploads.
- F22 Status changes follow an allowed-transition map, are role-checked, and are recorded (who, when, from, to, note).

## 7. Non-functional requirements
- **No data loss:** local draft on every change, server autosave, versioned saves, unsaved-changes guard.
- **Security:** RBAC, IDOR protection (unguessable order access tokens, ownership checks), upload validation and re-encoding, private storage, rate limiting on sensitive endpoints, no secrets in the browser, audit log.
- **Performance:** studio interactive on a mid-range Android phone; images downscaled for on-screen editing while print uses the processed full-resolution asset.
- **Accessibility:** WCAG-oriented; semantic forms; visible focus; canvas operations mirrored by accessible controls.
- **Mobile:** deliberate layout (bottom tool bar + sheets, sticky price bar), full order possible from a phone.

## 8. Research note
The build environment's network policy blocked direct access to thetshirtshop.in, sweetginger.net, dropstudio.io and customink.com. What is known comes from the brief and public search snippets: The T-Shirt Shop sells regular, oversized, polo and full-sleeve tees in cotton and has a "Customized" page; Sweet Ginger is a Jaipur wholesaler of polos and cotton tees (180–200 GSM is typical for Jaipur polos). Interaction patterns follow widely known design-lab conventions (product → art/text → placement → colour → price → cart); no code, assets, wording or visual identity were copied. **Shankar should review the flow against his current Customize process.**
