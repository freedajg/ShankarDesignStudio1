import { defineConfig } from "drizzle-kit";

// Migrations are generated from src/server/db/schema.ts and applied to both the
// embedded dev database (PGlite) and Supabase Postgres in production.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  ...(process.env.DATABASE_URL ? { dbCredentials: { url: process.env.DATABASE_URL } } : {}),
});
