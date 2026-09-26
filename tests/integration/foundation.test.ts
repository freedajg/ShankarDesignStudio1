import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb } from "../support/db";
import type { Db } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { ensureStaffUser, seedDemoData } from "@/server/db/seed";
import { hashPassword } from "@/server/auth/crypto";
import { authenticateStaff, createSession, deleteSession, resolveSession } from "@/server/auth/service";
import { hit } from "@/server/services/rate-limit";
import { AppError } from "@/server/errors";

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

describe("migrations + seed", () => {
  it("seeds the three V1 products with variants, print areas and mockups", async () => {
    const products = await db.select().from(t.products);
    expect(products.map((p) => p.slug).sort()).toEqual(["classic-crew-tshirt", "oversized-tshirt", "pique-polo"]);
    expect(products.every((p) => p.isDemo)).toBe(true);
    const crew = products.find((p) => p.slug === "classic-crew-tshirt")!;
    const variants = await db.select().from(t.productVariants).where(eq(t.productVariants.productId, crew.id));
    expect(variants).toHaveLength(10 * 6);
    const areas = await db.select().from(t.printAreas).where(eq(t.printAreas.productId, crew.id));
    expect(areas.filter((a) => a.isDefault).map((a) => a.side).sort()).toEqual(["back", "front"]);
  });

  it("is idempotent", async () => {
    const before = await db.select({ n: sql<number>`count(*)::int` }).from(t.productVariants);
    await seedDemoData(db);
    const after = await db.select({ n: sql<number>`count(*)::int` }).from(t.productVariants);
    expect(after[0].n).toBe(before[0].n);
  });

  it("enforces constraints: colour hex, negative stock, duplicate global tiers", async () => {
    const [p] = await db.select().from(t.products).limit(1);
    await expect(db.insert(t.productColours).values({ productId: p.id, name: "Bad", hex: "red" })).rejects.toThrow();
    const [v] = await db.select().from(t.productVariants).limit(1);
    await expect(db.update(t.productVariants).set({ stockQty: -1 }).where(eq(t.productVariants.id, v.id))).rejects.toThrow();
    await expect(
      db.insert(t.bulkPriceTiers).values({ channel: "B2B", productId: null, minQty: 25, discountBps: 100 }),
    ).rejects.toThrow();
  });
});

describe("staff auth", () => {
  const password = "a-long-test-password";
  beforeAll(async () => {
    await ensureStaffUser(db, { email: "Admin@Test.dev", name: "Admin", passwordHash: await hashPassword(password), role: "ADMIN" });
    // a user with no staff role must not be able to sign in to the console
    await db.insert(t.users).values({ email: "customer@test.dev", name: "C", passwordHash: await hashPassword(password) });
  });

  it("authenticates staff case-insensitively and issues a resolvable session", async () => {
    const user = await authenticateStaff(db, { email: " admin@test.dev ", password, ip: "1.1.1.1" });
    expect(user.roles).toEqual(["ADMIN"]);
    const { token } = await createSession(db, user.id, { ip: null, userAgent: null });
    const [row] = await db.select().from(t.sessions);
    expect(row.id).not.toBe(token); // only the hash is stored
    expect((await resolveSession(db, token))?.email).toBe("admin@test.dev");
    await deleteSession(db, token);
    expect(await resolveSession(db, token)).toBeNull();
  });

  it("rejects wrong passwords, unknown users and non-staff with the same message", async () => {
    const msgs = await Promise.all(
      [
        { email: "admin@test.dev", password: "wrong-password-123" },
        { email: "nobody@test.dev", password },
        { email: "customer@test.dev", password },
      ].map((c) =>
        authenticateStaff(db, { ...c, ip: "2.2.2.2" }).then(
          () => "ok",
          (e: AppError) => e.message,
        ),
      ),
    );
    expect(new Set(msgs).size).toBe(1);
    expect(msgs[0]).not.toBe("ok");
    const failures = await db.select().from(t.auditLogs).where(eq(t.auditLogs.action, "auth.login_failed"));
    expect(failures.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects disabled users and expired or bogus sessions", async () => {
    const [u] = await db.select().from(t.users).where(eq(t.users.email, "admin@test.dev"));
    const { token } = await createSession(db, u.id, { ip: null, userAgent: null });
    await db.update(t.users).set({ disabledAt: new Date() }).where(eq(t.users.id, u.id));
    expect(await resolveSession(db, token)).toBeNull();
    await db.update(t.users).set({ disabledAt: null }).where(eq(t.users.id, u.id));
    await db.update(t.sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await resolveSession(db, token)).toBeNull();
    expect(await resolveSession(db, "not-a-token")).toBeNull();
    expect(await resolveSession(db, undefined)).toBeNull();
  });

  it("rate-limits repeated attempts for one account", async () => {
    let last: unknown;
    for (let i = 0; i < 10; i++) {
      last = await authenticateStaff(db, { email: "victim@test.dev", password: "x-wrong-password", ip: `9.9.9.${i}` }).catch((e) => e);
    }
    expect((last as AppError).code).toBe("RATE_LIMITED");
  });
});

describe("rate limiter", () => {
  it("counts within a window and resets after it", async () => {
    expect((await hit(db, "k", 2, 60)).allowed).toBe(true);
    expect((await hit(db, "k", 2, 60)).allowed).toBe(true);
    expect((await hit(db, "k", 2, 60)).allowed).toBe(false);
    await db.update(t.rateLimits).set({ windowStart: new Date(Date.now() - 61_000) }).where(eq(t.rateLimits.key, "k"));
    expect((await hit(db, "k", 2, 60)).count).toBe(1);
  });
});

describe("demo seed", () => {
  it("gives catalogue rows the same ids in every database (serverless demo instances agree)", async () => {
    const { createTestDb } = await import("../support/db");
    const { loadProductConfig } = await import("@/server/services/catalogue");
    const [a, b] = await Promise.all([createTestDb(), createTestDb()]);
    const [pa, pb] = await Promise.all([loadProductConfig(a, { slug: "classic-crew-tshirt" }), loadProductConfig(b, { slug: "classic-crew-tshirt" })]);
    expect(pa!.id).toBe(pb!.id);
    expect(pa!.colours.map((c) => c.id)).toEqual(pb!.colours.map((c) => c.id));
    expect(pa!.sizes.map((s) => s.id)).toEqual(pb!.sizes.map((s) => s.id));
    expect(pa!.variants.map((v) => v.id).sort()).toEqual(pb!.variants.map((v) => v.id).sort());
    expect(pa!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("database file storage", () => {
  it("stores, overwrites, reads and deletes files inside Postgres", async () => {
    const { createTestDb } = await import("../support/db");
    const { setDbForTests } = await import("@/server/db/client");
    const { DatabaseStorage, BUCKETS } = await import("@/server/storage");
    setDbForTests(await createTestDb({ seed: false }));
    try {
      const s = new DatabaseStorage();
      const data = Buffer.from([0, 1, 2, 250, 255]);
      await s.put(BUCKETS.processed, "a/b.png", data, "image/png");
      expect(Buffer.compare((await s.get(BUCKETS.processed, "a/b.png"))!, data)).toBe(0);
      await s.put(BUCKETS.processed, "a/b.png", Buffer.from("new"), "image/png");
      expect((await s.get(BUCKETS.processed, "a/b.png"))!.toString()).toBe("new");
      expect(await s.get(BUCKETS.originals, "a/b.png")).toBeNull();
      await s.delete(BUCKETS.processed, "a/b.png");
      expect(await s.get(BUCKETS.processed, "a/b.png")).toBeNull();
      await expect(s.put(BUCKETS.processed, "../x", data, "image/png")).rejects.toThrow(/unsafe/);
    } finally {
      setDbForTests(undefined);
    }
  });
});
