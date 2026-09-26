# Business Rules

Two kinds of rules live here: **invariants** (enforced in code, not configurable) and **configurable rules** (values in the database/settings; current values are DEMO placeholders until Shankar confirms — see OPEN_QUESTIONS.md).

## Invariants (enforced in code)

| # | Rule | Where enforced |
|---|---|---|
| I1 | Changing colour, size, quantity, side or viewport never removes or moves design elements | studio store keeps elements independent of colour/size; E2E tests |
| I2 | Every order item references an immutable design version with ≥ 1 element; an order without artwork is not creatable | `order_items.design_version_id NOT NULL`; checkout service check |
| I3 | Design versions are immutable once created | service has no update path; editing creates version N+1 |
| I4 | Orders keep a pricing snapshot and product/colour/customer snapshots | checkout copies values; nothing reads live prices for existing orders |
| I5 | The server computes every price; client-sent prices are ignored | cart/checkout recompute via pricing engine |
| I6 | Payment amount must equal the order total in paise and currency INR, verified server-side | `markPaid` |
| I7 | A payment is applied at most once | unique provider ids + conditional status update |
| I8 | Every element must lie inside its print area (rotated bounding box, 0.5 mm tolerance) | editor clamps; server rejects on version create |
| I9 | Uploaded artwork must be a real PNG/JPEG within size/pixel limits | artwork service (content sniffing + full decode) |
| I10 | Order status changes only via allowed transitions by permitted roles, and every change is recorded (who, when, from, to) | order state machine + `order_status_history` |
| I11 | Customers can read an order only with its access token; staff by role | order service |
| I12 | B2B and B2C use the same studio and the same design model | single studio route with a `mode` |
| I13 | Inventory is decremented once, at payment; a tracked variant cannot go below zero | `markPaid` transaction + DB check |

## Pricing model (structure is fixed; numbers are configuration)

Per cart line (one design × one colour × one print method, many sizes):

```
garment(size)   = product.base_price[channel] + variant.price_adjustment
print           = Σ over decorated sides: print_prices[method][print_area.size_class]
extra placement = settings.pricing.additionalPlacementPaise × max(0, decoratedSides − 1)
unit(size)      = garment(size) + print + extra placement
tier            = highest bulk_price_tier for (channel, product|global) with min_qty ≤ line quantity
unit'(size)     = round(unit(size) × (1 − tier.discount_bps / 10000))
line total      = Σ sizes qty × unit'(size)
```
Order:
```
subtotal = Σ line totals
tax      = settings.tax.pricesIncludeTax ? 0 (included) : round(subtotal × settings.tax.rateBps / 10000)
shipping = settings.shipping (flat fee per order, free at/above threshold)
total    = subtotal + tax + shipping
```
Rounding: to the paise at the unit level (so `unit' × qty` is exact), half-up. All arithmetic in integer paise.

Channel rules: B2C lines require quantity ≥ 1; B2B lines require quantity ≥ `products.min_qty_b2b`. The tier used is shown to the customer with the quantity needed for the next tier.

## Configurable values (DEMO seed — not Shankar's prices)

| Setting | Demo value | Confirm |
|---|---|---|
| Base prices (crew / oversized / polo), B2C | ₹399 / ₹549 / ₹599 | Q4 |
| Base prices, B2B | ₹249 / ₹349 / ₹379 | Q5 |
| Size adjustment | +₹40 for XXL, +₹60 for 3XL | Q4 |
| Print prices per placement (DTF) | small ₹60, standard ₹120, large ₹180 | Q8 |
| Print prices (embroidery / vinyl) | small ₹150/₹80, standard ₹250/₹150 | Q8 |
| Extra placement surcharge | ₹0 (print price per side already applies) | Q8 |
| B2B tiers | 25+ 5%, 50+ 10%, 100+ 15%, 250+ 20%, 500+ 25% | Q5 |
| B2C tiers | 5+ 5%, 10+ 10% | Q5 |
| B2B minimum | 20 pcs | Q9 |
| GST | 5%, prices exclusive of tax | Q11 |
| Shipping | ₹79 flat, free at ₹1,999+ | Q10 |
| Print areas | full front 280×350 mm, left chest 90×90 mm, full back 300×380 mm (oversized larger) | Q7 |
| Min recommended DPI | 150 (warn), 100 (strong warning) | Q18 |
| Max upload | 25 MB, 60 megapixels | Q18 |
| Design review before production | on (every paid order goes to DESIGN_REVIEW) | Q20 |

Every seeded catalogue row has `is_demo = true`; the admin and the storefront show a "Demo pricing" banner while any active product is demo data.

## Order status workflow

```
NEW → PAYMENT_PENDING → PAID → DESIGN_REVIEW → APPROVED → IN_PRODUCTION → PRINTED → QUALITY_CHECK → SHIPPED → DELIVERED
                  ↘ (payment failure keeps PAYMENT_PENDING; retry allowed)
CANCELLED reachable from any state before SHIPPED (ADMIN only)
```
- `NEW → PAYMENT_PENDING → PAID` are system transitions (checkout and payment verification). `PAID → DESIGN_REVIEW` happens automatically when design review is enabled, otherwise `PAID → APPROVED`.
- ADMIN may perform any forward transition and CANCELLED. PRODUCTION may perform `APPROVED → IN_PRODUCTION → PRINTED → QUALITY_CHECK → SHIPPED`.
- Backward moves (e.g. QC fail → IN_PRODUCTION) are allowed for ADMIN with a mandatory note.
- `payment_status` (UNPAID/PENDING/PAID/FAILED/REFUNDED) is tracked separately from the production status.

## Artwork rules (V1)
- Accepted: PNG, JPEG (by content, not extension). SVG/PDF later, each needing its own sanitiser.
- Rejected: other types, > 25 MB, > 60 MP, undecodable files.
- Warnings (never blocking): effective DPI < 150 at placed size ("may appear soft"), < 100 ("will likely look blurry"); JPEG or fully-opaque PNG ("background will print as a solid rectangle"); image smaller than 500 px on the long edge.
- Originals are kept byte-for-byte; the processed copy is what gets printed; both downloadable by staff.
