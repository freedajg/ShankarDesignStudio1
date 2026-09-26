# Open Questions for Shankar

Nothing below blocks development: each has a configurable home and a clearly-labelled DEMO value. Answers change **data**, not architecture, unless noted.

| # | Question | Where it lives now | Current placeholder |
|---|---|---|---|
| 1 | Which products launch in V1 (exact styles, fabrics, GSM)? Does The T-Shirt Shop or Sweet Ginger Basics lead? | `products` | Crew tee, Oversized tee, Polo (demo) |
| 2 | Exact colours per product (names + hex, ideally from dyed swatches)? | `product_colours` | 8–10 common colours |
| 3 | Size run per product (XS? 3XL? kids?) and size charts? | `product_sizes` | S–XXL (+3XL on crew) |
| 4 | B2C prices per product; do larger sizes cost more? | `products.base_price_b2c_paise`, `product_variants.price_adjustment_paise` | see BUSINESS_RULES |
| 5 | B2B price breaks: quantities and discounts; per product or global? Per colour? | `bulk_price_tiers` | 25/50/100/250/500 → 5–25% |
| 6 | Which print methods are offered to customers, per product? Can the customer choose, or does Ginger Prints decide? *(architecture: `customer_selectable` flag already exists)* | `print_methods`, `product_print_methods` | DTF selectable; embroidery and vinyl on polo |
| 7 | Print-area dimensions per product/size (max print width/height; left chest size; sleeve?). Same area for S and XXL? | `print_areas` | full front 280×350 mm etc. |
| 8 | Print cost rules: by area size, by colours, by method, setup fees? | `print_prices`, `settings.pricing` | per placement by size class |
| 9 | Minimum order quantities for B2B (and per colour?) | `products.min_qty_b2b` | 20 |
| 10 | Shipping: flat, by weight, by pincode zone, free threshold, B2B freight? | `settings.shipping` | ₹79, free ≥ ₹1,999 |
| 11 | GST: rate(s) (apparel slab by value), prices inclusive or exclusive, GST invoice requirements for B2B (GSTIN validation, place of supply) | `settings.tax` | 5% exclusive |
| 12 | Razorpay account/keys, settlement, which methods (UPI, cards, netbanking); B2B pay by bank transfer/invoice? | env + `PaymentProvider` | dev provider |
| 13 | Inventory: tracked where today (Shopify? ERP? spreadsheet)? Should the studio decrement stock? | `product_variants.stock_qty` (null = untracked) | seeded demo stock |
| 14 | Existing store platform for thetshirtshop.in (Shopify?) and integration expectations | ARCHITECTURE §11 | standalone + links |
| 15 | Should paid orders sync into the existing store/ERP? Which system is the order of record? | `markPaid` hook point | no sync |
| 16 | Do customers need accounts in V1, or is guest checkout + emailed links enough? | auth service | guest; saved-design links |
| 17 | Production approval workflow: who approves designs, what happens on rejection (customer contact, refund, edit)? | order state machine | DESIGN_REVIEW → APPROVED by admin |
| 18 | Artwork requirements from the printers: min DPI, max file size, vector needs for vinyl, colour limits for embroidery | `settings.artwork`, print-method adapters | 150 DPI warn |
| 19 | Can customers choose the printing method? | `print_methods.customer_selectable` | yes, where offered |
| 20 | Does the team manually approve every design before printing? | `settings.workflow.requireDesignReview` | yes |
| 21 | Turnaround / lead-time promises shown to customers (B2C vs bulk)? | not shown yet | none shown |
| 22 | Returns/refund policy for custom goods; cancellation window? | CANCELLED transition (admin) | admin-only cancel |
| 23 | Brand to present: "Sweet Ginger Design Studio" for both storefronts, or white-labelled per storefront? | layout + env | Sweet Ginger Design Studio |
| 24 | Real garment photography for mockups (flat-lay front/back per style on white) | `product_mockups` | generated silhouettes |
| 25 | Is a B2B quote/approval step needed above some quantity (e.g. > 500 pcs) instead of instant online payment? | future `QUOTE_REQUESTED` status | pay online |

## Assumptions made to keep building
- A1 Currency is INR only; amounts stored in paise.
- A2 One print method per cart line (a polo with embroidered front and DTF back would be two methods → V2).
- A3 Print area size is the same across garment sizes (placement scales per size is a production concern; flagged in Q7).
- A4 Guest checkout is acceptable; order access is by private link sent by email.
- A5 Every paid order goes to design review first.
