import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db/client";
import { seedDemoData } from "@/server/db/seed";

/** A fresh, migrated, in-memory Postgres per test file — real SQL, no mocks. */
export async function createTestDb({ seed = true } = {}): Promise<Db> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Db;
  await migrate(db as never, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  if (seed) await seedDemoData(db);
  return db;
}
