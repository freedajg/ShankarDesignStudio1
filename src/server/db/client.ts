import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { env } from "../env";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
/** A transaction handle has the same query API as the database. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

type Holder = { db?: Promise<Db> };
// Survive Next.js dev hot reloads: one connection pool / one embedded database per process.
const holder = globalThis as unknown as { __sgDb?: Holder };
holder.__sgDb ??= {};

async function connect(): Promise<Db> {
  const e = env();
  if (e.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    // prepare:false keeps us compatible with Supabase's transaction pooler (pgbouncer).
    const client = postgres(e.DATABASE_URL, { prepare: false, max: 10 });
    return drizzle(client, { schema }) as unknown as Db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = e.PGLITE_DATA_DIR;
  if (!dataDir.startsWith("memory://")) {
    const { mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(dataDir), { recursive: true });
  }
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  // Embedded dev database: keep it migrated automatically so `npm run dev` just works.
  await migrate(db, { migrationsFolder: "drizzle" });
  return db as unknown as Db;
}

export function getDb(): Promise<Db> {
  holder.__sgDb!.db ??= connect().catch((err) => {
    holder.__sgDb!.db = undefined;
    throw err;
  });
  return holder.__sgDb!.db;
}

/** Tests inject an isolated in-memory database. */
export function setDbForTests(db: Db | undefined) {
  holder.__sgDb!.db = db ? Promise.resolve(db) : undefined;
}
