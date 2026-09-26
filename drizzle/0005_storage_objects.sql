CREATE TABLE "storage_objects" (
	"bucket" text NOT NULL,
	"key" text NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_objects_bucket_key_pk" PRIMARY KEY("bucket","key")
);
