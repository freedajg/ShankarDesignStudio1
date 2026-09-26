CREATE TYPE "public"."asset_kind" AS ENUM('ORIGINAL', 'PROCESSED');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('B2C', 'B2B');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('NEW', 'PAYMENT_PENDING', 'PAID', 'DESIGN_REVIEW', 'APPROVED', 'IN_PRODUCTION', 'PRINTED', 'QUALITY_CHECK', 'SHIPPED', 'DELIVERED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_attempt_status" AS ENUM('CREATED', 'PAID', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."print_side" AS ENUM('front', 'back');--> statement-breakpoint
CREATE TYPE "public"."print_size_class" AS ENUM('SMALL', 'STANDARD', 'LARGE');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('CUSTOMER', 'ADMIN', 'PRODUCTION');--> statement-breakpoint
CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 10001 CACHE 1;--> statement-breakpoint
CREATE TABLE "artwork_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"parent_asset_id" uuid,
	"owner_token_hash" text,
	"user_id" uuid,
	"bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"preview_key" text,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"width_px" integer NOT NULL,
	"height_px" integer NOT NULL,
	"has_alpha" boolean NOT NULL,
	"sha256" text NOT NULL,
	"original_filename" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"data" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_price_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "channel" NOT NULL,
	"product_id" uuid,
	"min_qty" integer NOT NULL,
	"discount_bps" integer NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "bulk_price_tiers_uq" UNIQUE NULLS NOT DISTINCT("channel","product_id","min_qty"),
	CONSTRAINT "bulk_price_tiers_valid" CHECK ("bulk_price_tiers"."min_qty" >= 1 and "bulk_price_tiers"."discount_bps" between 0 and 9000)
);
--> statement-breakpoint
CREATE TABLE "cart_item_sizes" (
	"cart_item_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "cart_item_sizes_cart_item_id_variant_id_pk" PRIMARY KEY("cart_item_id","variant_id"),
	CONSTRAINT "cart_item_sizes_qty_pos" CHECK ("cart_item_sizes"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"design_id" uuid NOT NULL,
	"design_version_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"colour_id" uuid NOT NULL,
	"print_method_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"line_total_paise" integer NOT NULL,
	"price_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_qty_pos" CHECK ("cart_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"channel" "channel" DEFAULT 'B2C' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"gstin" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "design_version_assets" (
	"design_version_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "design_version_assets_design_version_id_asset_id_pk" PRIMARY KEY("design_version_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "design_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"schema_version" integer NOT NULL,
	"design_json" jsonb NOT NULL,
	"product_id" uuid NOT NULL,
	"colour_id" uuid NOT NULL,
	"element_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_token_hash" text,
	"user_id" uuid,
	"product_id" uuid NOT NULL,
	"colour_id" uuid NOT NULL,
	"name" text DEFAULT 'Untitled design' NOT NULL,
	"draft_json" jsonb NOT NULL,
	"draft_revision" integer DEFAULT 0 NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_item_sizes" (
	"order_item_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"size_code" text NOT NULL,
	"sku" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "order_item_sizes_order_item_id_variant_id_pk" PRIMARY KEY("order_item_id","variant_id"),
	CONSTRAINT "order_item_sizes_qty_pos" CHECK ("order_item_sizes"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"product_slug" text NOT NULL,
	"colour_id" uuid NOT NULL,
	"colour_name" text NOT NULL,
	"colour_hex" text NOT NULL,
	"print_method_id" uuid NOT NULL,
	"print_method_code" text NOT NULL,
	"design_version_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"line_total_paise" integer NOT NULL,
	"price_snapshot" jsonb NOT NULL,
	CONSTRAINT "order_items_qty_pos" CHECK ("order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"changed_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"channel" "channel" NOT NULL,
	"status" "order_status" DEFAULT 'NEW' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'UNPAID' NOT NULL,
	"customer_id" uuid NOT NULL,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"pincode" text NOT NULL,
	"company_name" text,
	"gstin" text,
	"po_reference" text,
	"notes" text,
	"currency" text DEFAULT 'INR' NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"tax_paise" integer NOT NULL,
	"shipping_paise" integer NOT NULL,
	"total_paise" integer NOT NULL,
	"total_quantity" integer NOT NULL,
	"pricing_snapshot" jsonb NOT NULL,
	"access_token_hash" text NOT NULL,
	"needs_attention" text,
	"placed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_total_nonneg" CHECK ("orders"."total_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_order_id" text NOT NULL,
	"provider_payment_id" text,
	"amount_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" "payment_attempt_status" DEFAULT 'CREATED' NOT NULL,
	"failure_reason" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_order_id_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "payments_provider_payment_id_unique" UNIQUE("provider_payment_id")
);
--> statement-breakpoint
CREATE TABLE "print_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"side" "print_side" NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"width_mm" numeric(8, 2) NOT NULL,
	"height_mm" numeric(8, 2) NOT NULL,
	"mockup_x" numeric(6, 5) NOT NULL,
	"mockup_y" numeric(6, 5) NOT NULL,
	"mockup_width" numeric(6, 5) NOT NULL,
	"size_class" "print_size_class" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "print_areas_dims_pos" CHECK ("print_areas"."width_mm" > 0 and "print_areas"."height_mm" > 0)
);
--> statement-breakpoint
CREATE TABLE "print_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"customer_selectable" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "print_methods_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "print_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"print_method_id" uuid NOT NULL,
	"size_class" "print_size_class" NOT NULL,
	"price_paise" integer NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "print_prices_nonneg" CHECK ("print_prices"."price_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_colours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"hex" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "product_colours_hex" CHECK ("product_colours"."hex" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "product_mockups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"side" "print_side" NOT NULL,
	"mask_url" text NOT NULL,
	"shade_url" text NOT NULL,
	"highlight_url" text NOT NULL,
	"width_px" integer NOT NULL,
	"height_px" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_print_methods" (
	"product_id" uuid NOT NULL,
	"print_method_id" uuid NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "product_print_methods_product_id_print_method_id_pk" PRIMARY KEY("product_id","print_method_id")
);
--> statement-breakpoint
CREATE TABLE "product_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"code" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"colour_id" uuid NOT NULL,
	"size_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"price_adjustment_paise" integer DEFAULT 0 NOT NULL,
	"stock_qty" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_sku_unique" UNIQUE("sku"),
	CONSTRAINT "product_variants_stock_nonneg" CHECK ("product_variants"."stock_qty" is null or "product_variants"."stock_qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "production_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"side" "print_side" NOT NULL,
	"print_method_code" text NOT NULL,
	"kind" text NOT NULL,
	"bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"width_px" integer NOT NULL,
	"height_px" integer NOT NULL,
	"dpi" integer NOT NULL,
	"generated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"sku_prefix" text NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"fabric" text,
	"gsm" integer,
	"base_price_b2c_paise" integer NOT NULL,
	"base_price_b2b_paise" integer NOT NULL,
	"min_qty_b2b" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_sku_prefix_unique" UNIQUE("sku_prefix"),
	CONSTRAINT "products_prices_nonneg" CHECK ("products"."base_price_b2c_paise" >= 0 and "products"."base_price_b2b_paise" >= 0),
	CONSTRAINT "products_min_qty_pos" CHECK ("products"."min_qty_b2b" >= 1)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "artwork_assets" ADD CONSTRAINT "artwork_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_price_tiers" ADD CONSTRAINT "bulk_price_tiers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_item_sizes" ADD CONSTRAINT "cart_item_sizes_cart_item_id_cart_items_id_fk" FOREIGN KEY ("cart_item_id") REFERENCES "public"."cart_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_item_sizes" ADD CONSTRAINT "cart_item_sizes_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_design_version_id_design_versions_id_fk" FOREIGN KEY ("design_version_id") REFERENCES "public"."design_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_colour_id_product_colours_id_fk" FOREIGN KEY ("colour_id") REFERENCES "public"."product_colours"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_print_method_id_print_methods_id_fk" FOREIGN KEY ("print_method_id") REFERENCES "public"."print_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_version_assets" ADD CONSTRAINT "design_version_assets_design_version_id_design_versions_id_fk" FOREIGN KEY ("design_version_id") REFERENCES "public"."design_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_version_assets" ADD CONSTRAINT "design_version_assets_asset_id_artwork_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."artwork_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_colour_id_product_colours_id_fk" FOREIGN KEY ("colour_id") REFERENCES "public"."product_colours"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_colour_id_product_colours_id_fk" FOREIGN KEY ("colour_id") REFERENCES "public"."product_colours"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_sizes" ADD CONSTRAINT "order_item_sizes_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_sizes" ADD CONSTRAINT "order_item_sizes_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_colour_id_product_colours_id_fk" FOREIGN KEY ("colour_id") REFERENCES "public"."product_colours"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_print_method_id_print_methods_id_fk" FOREIGN KEY ("print_method_id") REFERENCES "public"."print_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_design_version_id_design_versions_id_fk" FOREIGN KEY ("design_version_id") REFERENCES "public"."design_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_areas" ADD CONSTRAINT "print_areas_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_prices" ADD CONSTRAINT "print_prices_print_method_id_print_methods_id_fk" FOREIGN KEY ("print_method_id") REFERENCES "public"."print_methods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_colours" ADD CONSTRAINT "product_colours_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_mockups" ADD CONSTRAINT "product_mockups_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_print_methods" ADD CONSTRAINT "product_print_methods_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_print_methods" ADD CONSTRAINT "product_print_methods_print_method_id_print_methods_id_fk" FOREIGN KEY ("print_method_id") REFERENCES "public"."print_methods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sizes" ADD CONSTRAINT "product_sizes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_colour_id_product_colours_id_fk" FOREIGN KEY ("colour_id") REFERENCES "public"."product_colours"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_size_id_product_sizes_id_fk" FOREIGN KEY ("size_id") REFERENCES "public"."product_sizes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_files" ADD CONSTRAINT "production_files_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_files" ADD CONSTRAINT "production_files_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_files" ADD CONSTRAINT "production_files_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artwork_assets_owner_idx" ON "artwork_assets" USING btree ("owner_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "artwork_assets_bucket_key_uq" ON "artwork_assets" USING btree ("bucket","storage_key");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cart_items_cart_idx" ON "cart_items" USING btree ("cart_id");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_customer_name_uq" ON "companies" USING btree ("customer_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "design_versions_design_version_uq" ON "design_versions" USING btree ("design_id","version");--> statement-breakpoint
CREATE INDEX "designs_owner_idx" ON "designs" USING btree ("owner_token_hash");--> statement-breakpoint
CREATE INDEX "designs_user_idx" ON "designs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_status_history_order_idx" ON "order_status_history" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_channel_idx" ON "orders" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "print_areas_product_code_uq" ON "print_areas" USING btree ("product_id","code");--> statement-breakpoint
CREATE INDEX "print_areas_product_idx" ON "print_areas" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "print_prices_method_class_uq" ON "print_prices" USING btree ("print_method_id","size_class");--> statement-breakpoint
CREATE UNIQUE INDEX "product_colours_product_name_uq" ON "product_colours" USING btree ("product_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "product_mockups_product_side_uq" ON "product_mockups" USING btree ("product_id","side");--> statement-breakpoint
CREATE UNIQUE INDEX "product_sizes_product_code_uq" ON "product_sizes" USING btree ("product_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_colour_size_uq" ON "product_variants" USING btree ("colour_id","size_id");--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_files_item_side_kind_uq" ON "production_files" USING btree ("order_item_id","side","kind");--> statement-breakpoint
CREATE INDEX "production_files_order_idx" ON "production_files" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "products_active_sort_idx" ON "products" USING btree ("is_active","sort");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");