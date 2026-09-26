/**
 * Database CLI.
 *   npm run db:migrate                 apply SQL migrations (PGlite or DATABASE_URL)
 *   npm run db:seed                    demo catalogue + settings (+ dev staff users on the embedded dev DB)
 *   npm run db:user -- --email a@b.c --name "Asha" --role ADMIN    (password from STAFF_PASSWORD env)
 */
import { parseArgs } from "node:util";
import { getDb } from "../src/server/db/client";
import { ensureStaffUser, seedDemoData } from "../src/server/db/seed";
import { hashPassword } from "../src/server/auth/crypto";

// Development-only staff logins, created only on the embedded (PGlite) dev database.
export const DEV_STAFF = [
  { email: "admin@studio.local", name: "Dev Admin", password: "admin-dev-password", role: "ADMIN" as const },
  { email: "production@studio.local", name: "Dev Production", password: "production-dev-password", role: "PRODUCTION" as const },
];

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

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "migrate") return migrate();

  if (cmd === "seed") {
    await migrate();
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
