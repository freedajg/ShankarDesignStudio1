/**
 * Database CLI.
 *   npm run db:migrate                 apply SQL migrations (PGlite or DATABASE_URL)
 *   npm run db:seed                    demo catalogue + settings (+ dev staff users on the embedded dev DB);
 *                                      with STORAGE_DRIVER=supabase also creates the private storage buckets
 *   npm run db:user -- --email a@b.c --name "Asha" --role ADMIN    (password from STAFF_PASSWORD env)
 */
import { parseArgs } from "node:util";
import { getDb } from "../src/server/db/client";
import { ensureStaffUser, seedDemoData } from "../src/server/db/seed";
import { hashPassword } from "../src/server/auth/crypto";

import { DEMO_STAFF as DEV_STAFF } from "../src/server/demo";

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: 1 });
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    await client.end();
  } else {
    await getDb(); // the embedded database migrates itself on open
  }
  console.log("✓ migrations applied");
}

/** Creates the private Supabase Storage buckets (idempotent). No-op for local storage. */
async function ensureBuckets() {
  if (process.env.STORAGE_DRIVER !== "supabase") return;
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("STORAGE_DRIVER=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  const { BUCKETS } = await import("../src/server/storage");
  for (const name of Object.values(BUCKETS)) {
    const res = await fetch(`${url}/storage/v1/bucket`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ id: name, name, public: false }),
    });
    const body = await res.text();
    if (res.ok) console.log(`✓ created private bucket ${name}`);
    else if (/already exists|Duplicate/i.test(body)) console.log(`✓ bucket ${name} exists`);
    else throw new Error(`Could not create bucket ${name} (${res.status}): ${body}`);
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "migrate") return migrate();

  if (cmd === "buckets") return ensureBuckets();

  if (cmd === "seed") {
    await migrate();
    await ensureBuckets();
    const db = await getDb();
    await seedDemoData(db);
    console.log("✓ demo catalogue and settings seeded (DEMO values — see docs/OPEN_QUESTIONS.md)");
    const embedded = !process.env.DATABASE_URL && process.env.NODE_ENV !== "production";
    if (embedded) {
      for (const u of DEV_STAFF) {
        await ensureStaffUser(db, { ...u, passwordHash: await hashPassword(u.password) });
      }
      console.log("✓ dev staff logins:", DEV_STAFF.map((u) => `${u.email} / ${u.password} (${u.role})`).join(", "));
    }
    return;
  }

  if (cmd === "user") {
    const { values } = parseArgs({
      args: rest,
      options: { email: { type: "string" }, name: { type: "string" }, role: { type: "string" } },
    });
    const password = process.env.STAFF_PASSWORD;
    if (!values.email || !values.name || !password || (values.role !== "ADMIN" && values.role !== "PRODUCTION")) {
      throw new Error('Usage: STAFF_PASSWORD=… npm run db:user -- --email x@y.z --name "Name" --role ADMIN|PRODUCTION');
    }
    const db = await getDb();
    const user = await ensureStaffUser(db, {
      email: values.email,
      name: values.name,
      role: values.role,
      passwordHash: await hashPassword(password),
    });
    console.log(`✓ ${user.email} has role ${values.role}`);
    return;
  }

  throw new Error(`Unknown command "${cmd ?? ""}". Use migrate | seed | user.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
