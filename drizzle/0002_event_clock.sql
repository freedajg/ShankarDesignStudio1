ALTER TABLE "audit_logs" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();--> statement-breakpoint
ALTER TABLE "order_status_history" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();