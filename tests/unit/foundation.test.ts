import { describe, expect, it } from "vitest";
import { hashPassword, hashToken, randomToken, safeEqual, verifyPassword } from "@/server/auth/crypto";
import { applyBps, discountBps, formatInr } from "@/domain/money";
import { can, isStaff } from "@/domain/permissions";
import { demoSettings, parseSettings } from "@/domain/settings";

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("correct horse batterY", h)).toBe(false);
  });
  it("salts every hash", async () => {
    expect(await hashPassword("same password!")).not.toBe(await hashPassword("same password!"));
  });
  it("rejects short passwords and malformed hashes", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
    expect(await verifyPassword("anything", "garbage")).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
  });
});

describe("tokens", () => {
  it("are random, url-safe and hashed deterministically", () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(randomToken());
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).toHaveLength(64);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("money", () => {
  it("applies basis points with half-up rounding in paise", () => {
    expect(applyBps(10000, 500)).toBe(500);
    expect(applyBps(333, 500)).toBe(17); // 16.65 → 17
    expect(applyBps(330, 500)).toBe(17); // 16.5 → 17 (half-up)
    expect(applyBps(329, 500)).toBe(16);
    expect(discountBps(52900, 1000)).toBe(47610);
  });
  it("formats rupees", () => {
    expect(formatInr(39900)).toBe("₹399.00");
    expect(formatInr(39900, { whole: true })).toBe("₹399");
    expect(formatInr(12345678)).toBe("₹1,23,456.78");
  });
});

describe("permissions", () => {
  it("grants by role", () => {
    expect(can(["ADMIN"], "settings:write")).toBe(true);
    expect(can(["PRODUCTION"], "settings:write")).toBe(false);
    expect(can(["PRODUCTION"], "orders:update_status")).toBe(true);
    expect(can(["PRODUCTION"], "orders:cancel")).toBe(false);
    expect(isStaff(["CUSTOMER"])).toBe(false);
    expect(isStaff([])).toBe(false);
  });
});

describe("settings", () => {
  const rows = Object.entries(demoSettings).map(([key, value]) => ({ key, value }));
  it("parses a complete, valid set", () => {
    expect(parseSettings(rows).tax.rateBps).toBe(500);
  });
  it("fails loudly on a missing or malformed key", () => {
    expect(() => parseSettings(rows.filter((r) => r.key !== "tax"))).toThrow(/tax/);
    expect(() =>
      parseSettings(rows.map((r) => (r.key === "shipping" ? { key: "shipping", value: { flatPaise: -1, freeAbovePaise: null } } : r))),
    ).toThrow(/shipping/);
  });
});
