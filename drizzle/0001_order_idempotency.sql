ALTER TABLE "orders" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_idempotency_key_unique" UNIQUE("idempotency_key");