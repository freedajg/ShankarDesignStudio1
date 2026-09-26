# Database

PostgreSQL. Schema source of truth: `src/server/db/schema.ts` (Drizzle). SQL migrations are generated into `drizzle/` with `npm run db:generate` and applied by `npm run db:migrate` (the same files run on PGlite locally and Supabase in production).

Conventions: `uuid` primary keys (`gen_random_uuid()`), `created_at`/`updated_at timestamptz`, **money as integer paise** (`*_paise integer`, never floats), physical dimensions in **millimetres** (`numeric` → number), enums as Postgres enums, foreign keys everywhere with explicit `on delete` behaviour. Rows marked `is_demo = true` are development placeholders.

## Entity map

```
users ─┬─ user_roles            sessions
       └─ customers ─── companies
product_categories ── products ─┬─ product_colours ─┐
                                ├─ product_sizes ───┼─ product_variants (sku, stock, price adj.)
                                ├─ product_mockups (front/back mask+shade)
                                ├─ print_areas (side, code, mm size, mockup placement, size class)
                                └─ product_print_methods ── print_methods ── print_prices(size class)
bulk_price_tiers (channel, optional product, min qty, discount)      settings (typed JSON)
artwork_assets (original / processed, owner)
designs (draft, owner) ── design_versions (immutable JSON) ── design_version_assets ── artwork_assets
carts ── cart_items (→ design_version, price snapshot) ── cart_item_sizes (→ variant, qty)
orders ── order_items (→ design_version NOT NULL, snapshots) ── order_item_sizes
       ├─ payments (provider ids unique)
       ├─ order_status_history
       └─ production_files
audit_logs
```

## Tables

### Identity
| Table | Key columns | Notes |
|---|---|---|
| `users` | email (unique, lower-case), password_hash, name, disabled_at | staff now; customers later |
| `user_roles` | (user_id, role) PK | role enum `CUSTOMER`/`ADMIN`/`PRODUCTION` |
| `sessions` | id = sha256(token), user_id, expires_at | raw token only in the cookie |
| `customers` | email, name, phone, user_id (nullable, unique) | guest customers are deduplicated by email |
| `companies` | customer_id, name, gstin | B2B details; the order also snapshots them |

### Catalogue
| Table | Key columns | Notes |
|---|---|---|
| `product_categories` | slug, name, sort | T-Shirts, Polos, later Hoodies/Caps |
| `products` | slug, sku_prefix, category_id, name, description, fabric, gsm, base_price_b2c_paise, base_price_b2b_paise, min_qty_b2b, is_active, is_demo | |
| `product_colours` | product_id, name, hex, sort, is_active | unique (product, name) |
| `product_sizes` | product_id, code, sort | unique (product, code) |
| `product_variants` | product_id, colour_id, size_id, sku, price_adjustment_paise, stock_qty (null = not tracked), is_active | unique (colour, size); stock ≥ 0 check. Inventory lives here — a separate `inventory` table adds nothing until there are multiple warehouses. |
| `product_mockups` | product_id, side, mask_url, shade_url, width_px, height_px | swap the generated silhouettes for real photos without code changes |
| `print_areas` | product_id, side, code, name, width_mm, height_mm, mockup_x/y/width (fractions), size_class, is_default | a side may offer several areas (full front, left chest) |
| `print_methods` | code (DTF/EMBROIDERY/VINYL), name, is_active, customer_selectable | |
| `product_print_methods` | (product_id, print_method_id) | which methods a product supports |
| `print_prices` | print_method_id, size_class, price_paise | cost per decorated placement per piece |
| `bulk_price_tiers` | channel, product_id (null = all), min_qty, discount_bps | unique (channel, product, min_qty) |
| `settings` | key PK, value jsonb, updated_by | tax, shipping, placement surcharge, artwork thresholds, workflow flags — each key validated by a Zod schema in `src/domain/settings.ts` |

### Designs and artwork
| Table | Key columns | Notes |
|---|---|---|
| `artwork_assets` | kind (ORIGINAL/PROCESSED), parent_asset_id, owner_token_hash / user_id, bucket, storage_key, mime, bytes, width_px, height_px, has_alpha, sha256, original_filename | binary lives in storage |
| `designs` | owner_token_hash / user_id / customer_id, product_id, colour_id, name, draft_json, current_version_id | the mutable working copy; also the "saved design" (a separate `saved_designs` table would duplicate it) |
| `design_versions` | design_id, version, schema_version, design_json, product_id, colour_id | **immutable**; unique (design, version) |
| `design_version_assets` | (design_version_id, asset_id) | FK-enforced link so artwork used by an order can never be orphaned or deleted |

Elements are stored inside `design_json` (validated by Zod on write), not in a `design_elements` table: they are always read and written as a whole, never queried individually, and a version must be reproduced exactly.

### Commerce
| Table | Key columns | Notes |
|---|---|---|
| `carts` | token_hash (unique), channel, expires_at | anonymous carts |
| `cart_items` | cart_id, design_version_id, product_id, colour_id, print_method_id, unit/line price, price_snapshot | |
| `cart_item_sizes` | (cart_item_id, variant_id), quantity > 0 | a line may cover many sizes |
| `orders` | order_number (`SG-` + sequence from 10001), channel, status, payment_status, customer_id, contact & address snapshot, company/GSTIN/PO snapshot, subtotal/discount/tax/shipping/total paise, pricing_snapshot, access_token_hash, placed_at, paid_at | |
| `order_items` | order_id, design_version_id **NOT NULL**, product/colour/print method snapshot columns, quantity, unit_price_paise, line_total_paise, price_snapshot | |
| `order_item_sizes` | order_item_id, variant_id, size_code, sku, quantity | |
| `payments` | order_id, provider, provider_order_id (unique), provider_payment_id (unique, nullable), amount_paise, status, raw | uniqueness makes callbacks idempotent |
| `order_status_history` | order_id, from_status, to_status, changed_by (null = system), note | written by the only function allowed to change status |
| `production_files` | order_id, order_item_id, side, print_method_code, kind, storage_key, width_px, height_px, dpi | regenerable cache of rendered files |
| `audit_logs` | actor_user_id, action, entity_type, entity_id, data, ip | admin actions, logins, settings changes |

## Indexes (beyond PK/unique)
`products(is_active, sort)`, `product_variants(product_id)`, `print_areas(product_id)`, `designs(owner_token_hash)`, `design_versions(design_id)`, `cart_items(cart_id)`, `orders(status)`, `orders(created_at desc)`, `orders(customer_id)`, `orders(channel)`, `order_items(order_id)`, `payments(order_id)`, `order_status_history(order_id)`, `audit_logs(entity_type, entity_id)`.

## Row-level security
The app connects with a server-side database role; the browser never talks to Postgres or uses the Supabase anon key, so Supabase RLS is not the enforcement layer — service-level authorization is. RLS policies denying `anon`/`authenticated` on every table are included in the Supabase setup notes so a leaked anon key exposes nothing.
