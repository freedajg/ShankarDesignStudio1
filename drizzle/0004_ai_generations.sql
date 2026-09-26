CREATE TYPE "public"."ai_generation_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'REFUSED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."asset_source" AS ENUM('UPLOAD', 'AI');--> statement-breakpoint
CREATE TABLE "ai_generation_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"asset_id" uuid NOT NULL,
	"selected_at" timestamp with time zone,
	"design_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_token_hash" text NOT NULL,
	"parent_generation_id" uuid,
	"reference_asset_id" uuid,
	"prompt" text NOT NULL,
	"refinement" text,
	"style" text,
	"orientation" text,
	"lettering" boolean DEFAULT false NOT NULL,
	"interpretation" jsonb NOT NULL,
	"final_prompt" text NOT NULL,
	"provider" text,
	"model" text,
	"status" "ai_generation_status" DEFAULT 'PENDING' NOT NULL,
	"error_code" text,
	"product_id" uuid,
	"colour_id" uuid,
	"print_area_code" text,
	"print_method_code" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "artwork_assets" ADD COLUMN "source" "asset_source" DEFAULT 'UPLOAD' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_generation_images" ADD CONSTRAINT "ai_generation_images_generation_id_ai_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."ai_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_images" ADD CONSTRAINT "ai_generation_images_asset_id_artwork_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."artwork_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_reference_asset_id_artwork_assets_id_fk" FOREIGN KEY ("reference_asset_id") REFERENCES "public"."artwork_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_colour_id_product_colours_id_fk" FOREIGN KEY ("colour_id") REFERENCES "public"."product_colours"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_generation_images_pos_uq" ON "ai_generation_images" USING btree ("generation_id","position");--> statement-breakpoint
CREATE INDEX "ai_generation_images_asset_idx" ON "ai_generation_images" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "ai_generations_owner_idx" ON "ai_generations" USING btree ("owner_token_hash","created_at");