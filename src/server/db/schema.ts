import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * Conventions (see docs/DATABASE.md):
 * - money is integer paise; physical sizes are millimetres
 * - is_demo marks development placeholder data that Shankar has not confirmed
 */

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const mm = (name: string) => numeric(name, { precision: 8, scale: 2, mode: "number" });

// ---------------------------------------------------------------- enums

export const userRole = pgEnum("user_role", ["CUSTOMER", "ADMIN", "PRODUCTION"]);
export const channel = pgEnum("channel", ["B2C", "B2B"]);
export const side = pgEnum("print_side", ["front", "back"]);
export const sizeClass = pgEnum("print_size_class", ["SMALL", "STANDARD", "LARGE"]);
export const assetKind = pgEnum("asset_kind", ["ORIGINAL", "PROCESSED"]);
export const assetSource = pgEnum("asset_source", ["UPLOAD", "AI"]);
export const aiGenerationStatus = pgEnum("ai_generation_status", ["PENDING", "SUCCEEDED", "FAILED", "REFUSED", "CANCELLED"]);
export const orderStatus = pgEnum("order_status", [
  "NEW",
  "PAYMENT_PENDING",
  "PAID",
  "DESIGN_REVIEW",
  "APPROVED",
  "IN_PRODUCTION",
  "PRINTED",
  "QUALITY_CHECK",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
]);
export const paymentStatus = pgEnum("payment_status", ["UNPAID", "PENDING", "PAID", "FAILED", "REFUNDED"]);
export const paymentAttemptStatus = pgEnum("payment_attempt_status", ["CREATED", "PAID", "FAILED"]);

export const orderNumberSeq = pgSequence("order_number_seq", { startWith: 10001 });

// ---------------------------------------------------------------- identity

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: userRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256(token), hex
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    userId: uuid("user_id")
      .unique()
      .references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    phone: text("phone"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);

export const companies = pgTable(
  "companies",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    gstin: text("gstin"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("companies_customer_name_uq").on(t.customerId, t.name)],
);

// ---------------------------------------------------------------- catalogue

export const productCategories = pgTable("product_categories", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
});

export const products = pgTable(
  "products",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    skuPrefix: text("sku_prefix").notNull().unique(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => productCategories.id),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    fabric: text("fabric"),
    gsm: integer("gsm"),
    basePriceB2cPaise: integer("base_price_b2c_paise").notNull(),
    basePriceB2bPaise: integer("base_price_b2b_paise").notNull(),
    minQtyB2b: integer("min_qty_b2b").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    isDemo: boolean("is_demo").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("products_active_sort_idx").on(t.isActive, t.sort),
    check("products_prices_nonneg", sql`${t.basePriceB2cPaise} >= 0 and ${t.basePriceB2bPaise} >= 0`),
    check("products_min_qty_pos", sql`${t.minQtyB2b} >= 1`),
  ],
);

export const productColours = pgTable(
  "product_colours",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hex: text("hex").notNull(),
    sort: integer("sort").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    uniqueIndex("product_colours_product_name_uq").on(t.productId, t.name),
    check("product_colours_hex", sql`${t.hex} ~ '^#[0-9A-Fa-f]{6}$'`),
  ],
);

export const productSizes = pgTable(
  "product_sizes",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [uniqueIndex("product_sizes_product_code_uq").on(t.productId, t.code)],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    colourId: uuid("colour_id")
      .notNull()
      .references(() => productColours.id, { onDelete: "cascade" }),
    sizeId: uuid("size_id")
      .notNull()
      .references(() => productSizes.id, { onDelete: "cascade" }),
    sku: text("sku").notNull().unique(),
    priceAdjustmentPaise: integer("price_adjustment_paise").notNull().default(0),
    /** null = stock not tracked for this variant */
    stockQty: integer("stock_qty"),
    isActive: boolean("is_active").notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("product_variants_colour_size_uq").on(t.colourId, t.sizeId),
    index("product_variants_product_idx").on(t.productId),
    check("product_variants_stock_nonneg", sql`${t.stockQty} is null or ${t.stockQty} >= 0`),
  ],
);

export const productMockups = pgTable(
  "product_mockups",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    side: side("side").notNull(),
    /** white-on-transparent garment silhouette; recoloured at render time */
    maskUrl: text("mask_url").notNull(),
    /** greyscale shading multiplied over the colour (folds, seams, fabric) */
    shadeUrl: text("shade_url").notNull(),
    /** light layer screened over the colour so folds read on dark garments */
    highlightUrl: text("highlight_url").notNull(),
    widthPx: integer("width_px").notNull(),
    heightPx: integer("height_px").notNull(),
  },
  (t) => [uniqueIndex("product_mockups_product_side_uq").on(t.productId, t.side)],
);

export const printMethods = pgTable("print_methods", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  customerSelectable: boolean("customer_selectable").notNull().default(true),
  sort: integer("sort").notNull().default(0),
});

export const productPrintMethods = pgTable(
  "product_print_methods",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    printMethodId: uuid("print_method_id")
      .notNull()
      .references(() => printMethods.id, { onDelete: "cascade" }),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.productId, t.printMethodId] })],
);

export const printAreas = pgTable(
  "print_areas",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    side: side("side").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    widthMm: mm("width_mm").notNull(),
    heightMm: mm("height_mm").notNull(),
    /** placement on the mockup image, as fractions of the mockup width/height */
    mockupX: numeric("mockup_x", { precision: 6, scale: 5, mode: "number" }).notNull(),
    mockupY: numeric("mockup_y", { precision: 6, scale: 5, mode: "number" }).notNull(),
    mockupWidth: numeric("mockup_width", { precision: 6, scale: 5, mode: "number" }).notNull(),
    sizeClass: sizeClass("size_class").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [
    uniqueIndex("print_areas_product_code_uq").on(t.productId, t.code),
    index("print_areas_product_idx").on(t.productId),
    check("print_areas_dims_pos", sql`${t.widthMm} > 0 and ${t.heightMm} > 0`),
  ],
);

export const printPrices = pgTable(
  "print_prices",
  {
    id: id(),
    printMethodId: uuid("print_method_id")
      .notNull()
      .references(() => printMethods.id, { onDelete: "cascade" }),
    sizeClass: sizeClass("size_class").notNull(),
    pricePaise: integer("price_paise").notNull(),
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (t) => [
    uniqueIndex("print_prices_method_class_uq").on(t.printMethodId, t.sizeClass),
    check("print_prices_nonneg", sql`${t.pricePaise} >= 0`),
  ],
);

export const bulkPriceTiers = pgTable(
  "bulk_price_tiers",
  {
    id: id(),
    channel: channel("channel").notNull(),
    /** null = applies to every product without its own tiers */
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    minQty: integer("min_qty").notNull(),
    discountBps: integer("discount_bps").notNull(),
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (t) => [
    unique("bulk_price_tiers_uq").on(t.channel, t.productId, t.minQty).nullsNotDistinct(),
    check("bulk_price_tiers_valid", sql`${t.minQty} >= 1 and ${t.discountBps} between 0 and 9000`),
  ],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------- designs & artwork

export const artworkAssets = pgTable(
  "artwork_assets",
  {
    id: id(),
    kind: assetKind("kind").notNull(),
    parentAssetId: uuid("parent_asset_id"),
    ownerTokenHash: text("owner_token_hash"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    bucket: text("bucket").notNull(),
    storageKey: text("storage_key").notNull(),
    /** small editor preview (webp) in the same bucket; null if not generated */
    previewKey: text("preview_key"),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    widthPx: integer("width_px").notNull(),
    heightPx: integer("height_px").notNull(),
    hasAlpha: boolean("has_alpha").notNull(),
    sha256: text("sha256").notNull(),
    originalFilename: text("original_filename"),
    /** UPLOAD = customer's file; AI = generated by the AI design generator */
    source: assetSource("source").notNull().default("UPLOAD"),
    createdAt: createdAt(),
  },
  (t) => [
    index("artwork_assets_owner_idx").on(t.ownerTokenHash),
    uniqueIndex("artwork_assets_bucket_key_uq").on(t.bucket, t.storageKey),
  ],
);

/**
 * One AI generation request (a prompt → N variations). Refinements and
 * "generate similar" point at their parent. Owned by the anonymous owner cookie.
 */
export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: id(),
    ownerTokenHash: text("owner_token_hash").notNull(),
    parentGenerationId: uuid("parent_generation_id"),
    /** asset the customer asked to base a "similar" generation on */
    referenceAssetId: uuid("reference_asset_id").references(() => artworkAssets.id, { onDelete: "set null" }),
    prompt: text("prompt").notNull(),
    refinement: text("refinement"),
    style: text("style"),
    orientation: text("orientation"),
    lettering: boolean("lettering").notNull().default(false),
    /** structured requirements produced by the interpreter */
    interpretation: jsonb("interpretation").notNull(),
    finalPrompt: text("final_prompt").notNull(),
    provider: text("provider"),
    model: text("model"),
    status: aiGenerationStatus("status").notNull().default("PENDING"),
    /** internal failure code (never shown verbatim to customers) */
    errorCode: text("error_code"),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    colourId: uuid("colour_id").references(() => productColours.id, { onDelete: "set null" }),
    printAreaCode: text("print_area_code"),
    printMethodCode: text("print_method_code"),
    durationMs: integer("duration_ms"),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("ai_generations_owner_idx").on(t.ownerTokenHash, t.createdAt)],
);

export const aiGenerationImages = pgTable(
  "ai_generation_images",
  {
    id: id(),
    generationId: uuid("generation_id")
      .notNull()
      .references(() => aiGenerations.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    /** PROCESSED artwork asset (the ORIGINAL provider output is its parent) */
    assetId: uuid("asset_id")
      .notNull()
      .references(() => artworkAssets.id, { onDelete: "cascade" }),
    selectedAt: timestamp("selected_at", { withTimezone: true }),
    designId: uuid("design_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ai_generation_images_pos_uq").on(t.generationId, t.position), index("ai_generation_images_asset_idx").on(t.assetId)],
);

export const designs = pgTable(
  "designs",
  {
    id: id(),
    ownerTokenHash: text("owner_token_hash"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    colourId: uuid("colour_id")
      .notNull()
      .references(() => productColours.id),
    name: text("name").notNull().default("Untitled design"),
    draftJson: jsonb("draft_json").notNull(),
    draftRevision: integer("draft_revision").notNull().default(0),
    currentVersionId: uuid("current_version_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("designs_owner_idx").on(t.ownerTokenHash), index("designs_user_idx").on(t.userId)],
);

export const designVersions = pgTable(
  "design_versions",
  {
    id: id(),
    designId: uuid("design_id")
      .notNull()
      .references(() => designs.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    designJson: jsonb("design_json").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    colourId: uuid("colour_id")
      .notNull()
      .references(() => productColours.id),
    elementCount: integer("element_count").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("design_versions_design_version_uq").on(t.designId, t.version)],
);

export const designVersionAssets = pgTable(
  "design_version_assets",
  {
    designVersionId: uuid("design_version_id")
      .notNull()
      .references(() => designVersions.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => artworkAssets.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.designVersionId, t.assetId] })],
);

// ---------------------------------------------------------------- cart

export const carts = pgTable("carts", {
  id: id(),
  tokenHash: text("token_hash").notNull().unique(),
  channel: channel("channel").notNull().default("B2C"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const cartItems = pgTable(
  "cart_items",
  {
    id: id(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    designId: uuid("design_id")
      .notNull()
      .references(() => designs.id),
    designVersionId: uuid("design_version_id")
      .notNull()
      .references(() => designVersions.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    colourId: uuid("colour_id")
      .notNull()
      .references(() => productColours.id),
    printMethodId: uuid("print_method_id")
      .notNull()
      .references(() => printMethods.id),
    quantity: integer("quantity").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
    lineTotalPaise: integer("line_total_paise").notNull(),
    priceSnapshot: jsonb("price_snapshot").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("cart_items_cart_idx").on(t.cartId), check("cart_items_qty_pos", sql`${t.quantity} > 0`)],
);

export const cartItemSizes = pgTable(
  "cart_item_sizes",
  {
    cartItemId: uuid("cart_item_id")
      .notNull()
      .references(() => cartItems.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.cartItemId, t.variantId] }),
    check("cart_item_sizes_qty_pos", sql`${t.quantity} > 0`),
  ],
);

// ---------------------------------------------------------------- orders

export const orders = pgTable(
  "orders",
  {
    id: id(),
    orderNumber: text("order_number").notNull().unique(),
    channel: channel("channel").notNull(),
    status: orderStatus("status").notNull().default("NEW"),
    paymentStatus: paymentStatus("payment_status").notNull().default("UNPAID"),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    contactPhone: text("contact_phone").notNull(),
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    pincode: text("pincode").notNull(),
    companyName: text("company_name"),
    gstin: text("gstin"),
    poReference: text("po_reference"),
    notes: text("notes"),
    currency: text("currency").notNull().default("INR"),
    subtotalPaise: integer("subtotal_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    taxPaise: integer("tax_paise").notNull(),
    shippingPaise: integer("shipping_paise").notNull(),
    totalPaise: integer("total_paise").notNull(),
    totalQuantity: integer("total_quantity").notNull(),
    pricingSnapshot: jsonb("pricing_snapshot").notNull(),
    accessTokenHash: text("access_token_hash").notNull(),
    /** client-generated key: a double-submitted checkout returns the same order */
    idempotencyKey: text("idempotency_key").unique(),
    needsAttention: text("needs_attention"),
    placedAt: timestamp("placed_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_created_idx").on(t.createdAt),
    index("orders_customer_idx").on(t.customerId),
    index("orders_channel_idx").on(t.channel),
    check("orders_total_nonneg", sql`${t.totalPaise} >= 0`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** line number within the order (cart order) — drives "-1", "-2" in production file names */
    position: integer("position").notNull().default(0),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    productName: text("product_name").notNull(),
    productSlug: text("product_slug").notNull(),
    colourId: uuid("colour_id")
      .notNull()
      .references(() => productColours.id),
    colourName: text("colour_name").notNull(),
    colourHex: text("colour_hex").notNull(),
    printMethodId: uuid("print_method_id")
      .notNull()
      .references(() => printMethods.id),
    printMethodCode: text("print_method_code").notNull(),
    /** an order item without a design is not printable — hence NOT NULL */
    designVersionId: uuid("design_version_id")
      .notNull()
      .references(() => designVersions.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
    lineTotalPaise: integer("line_total_paise").notNull(),
    priceSnapshot: jsonb("price_snapshot").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId), check("order_items_qty_pos", sql`${t.quantity} > 0`)],
);

export const orderItemSizes = pgTable(
  "order_item_sizes",
  {
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    sizeCode: text("size_code").notNull(),
    sku: text("sku").notNull(),
    quantity: integer("quantity").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.orderItemId, t.variantId] }),
    check("order_item_sizes_qty_pos", sql`${t.quantity} > 0`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerOrderId: text("provider_order_id").notNull().unique(),
    providerPaymentId: text("provider_payment_id").unique(),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: paymentAttemptStatus("status").notNull().default("CREATED"),
    failureReason: text("failure_reason"),
    raw: jsonb("raw"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("payments_order_idx").on(t.orderId)],
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatus("from_status"),
    toStatus: orderStatus("to_status").notNull(),
    /** null = system (checkout / payment) */
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    // clock_timestamp (not now()): several changes in one transaction must stay in order
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  },
  (t) => [index("order_status_history_order_idx").on(t.orderId)],
);

export const productionFiles = pgTable(
  "production_files",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    side: side("side").notNull(),
    printMethodCode: text("print_method_code").notNull(),
    kind: text("kind").notNull(),
    bucket: text("bucket").notNull(),
    storageKey: text("storage_key").notNull(),
    widthPx: integer("width_px").notNull(),
    heightPx: integer("height_px").notNull(),
    dpi: integer("dpi").notNull(),
    generatedBy: uuid("generated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("production_files_item_side_kind_uq").on(t.orderItemId, t.side, t.kind),
    index("production_files_order_idx").on(t.orderId),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    data: jsonb("data"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  },
  (t) => [index("audit_logs_entity_idx").on(t.entityType, t.entityId), index("audit_logs_created_idx").on(t.createdAt)],
);

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v)),
});

/**
 * File storage inside Postgres (STORAGE_DRIVER=database). For deployments with
 * a shared database but no object storage, e.g. a Vercel demo with a Neon
 * database: every server instance sees the same files.
 */
export const storageObjects = pgTable(
  "storage_objects",
  {
    bucket: text("bucket").notNull(),
    key: text("key").notNull(),
    contentType: text("content_type").notNull(),
    data: bytea("data").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.bucket, t.key] })],
);

/** Fixed-window counters for rate limiting; shared by all server instances. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});
