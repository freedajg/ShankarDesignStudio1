import "server-only";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { env } from "../env";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
/** A transaction handle has the same query API as the database. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

type Holder = { db?: Promise<Db>; raw?: Promise<Db> };
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
    // A demo on a shared database keeps its own tables up to date.
    if (e.DEMO_MODE) await migratePostgres(e.DATABASE_URL);
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
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db as unknown as Db;
}

/** The connection (migrated) without demo setup — used by the database file store, which demo setup itself needs. */
export function getRawDb(): Promise<Db> {
  holder.__sgDb!.raw ??= connect().catch((err) => {
    holder.__sgDb!.raw = undefined;
    throw err;
  });
  return holder.__sgDb!.raw;
}

/**
 * Applies SQL migrations. Several serverless instances may start at once: the
 * migrator records what it applied, so a loser of the race just retries and
 * finds everything done.
 */
async function migratePostgres(url: string) {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  for (let attempt = 1; ; attempt++) {
    const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
    try {
      await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
      return;
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    } finally {
      await client.end({ timeout: 5 });
    }
  }
}

export function getDb(): Promise<Db> {
  holder.__sgDb!.db ??= getRawDb()
    .then(async (db) => {
      if (env().DEMO_MODE) {
        const { ensureDemoData } = await import("../demo");
        await ensureDemoData(db);
      }
      return db;
    })
    .catch((err) => {
    holder.__sgDb!.db = undefined;
    throw err;
  });
  return holder.__sgDb!.db;
}

/** Tests inject an isolated in-memory database. */
export function setDbForTests(db: Db | undefined) {
  holder.__sgDb!.db = db ? Promise.resolve(db) : undefined;
  holder.__sgDb!.raw = holder.__sgDb!.db;
}
