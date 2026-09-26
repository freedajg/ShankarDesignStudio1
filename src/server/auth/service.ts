import "server-only";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Db } from "../db/client";
import { sessions, userRoles, users } from "../db/schema";
import { AppError } from "../errors";
import { audit } from "../services/audit";
import { enforce } from "../services/rate-limit";
import { DUMMY_HASH, hashToken, randomToken, verifyPassword } from "./crypto";
import { isStaff, type Role } from "@/domain/permissions";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionUser = { id: string; email: string; name: string; roles: Role[] };

const INVALID = "That email and password don't match a staff account.";

async function rolesFor(db: Db, userId: string): Promise<Role[]> {
  const rows = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role);
}

/** Verifies staff credentials. Same error and similar timing whether or not the account exists. */
export async function authenticateStaff(
  db: Db,
  input: { email: string; password: string; ip: string | null },
): Promise<SessionUser> {
  const email = input.email.trim().toLowerCase();
  await enforce(db, `login:ip:${input.ip ?? "unknown"}`, 20, 15 * 60);
  await enforce(db, `login:email:${email}`, 8, 15 * 60, "Too many attempts for this account. Try again in 15 minutes.");

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  const roles = user ? await rolesFor(db, user.id) : [];

  if (!user || !ok || user.disabledAt || !isStaff(roles)) {
    await audit(db, {
      actorUserId: user?.id ?? null,
      action: "auth.login_failed",
      entityType: "user",
      entityId: user?.id ?? null,
      data: { email },
      ip: input.ip,
    });
    throw new AppError("UNAUTHORIZED", INVALID);
  }
  await audit(db, { actorUserId: user.id, action: "auth.login", entityType: "user", entityId: user.id, ip: input.ip });
  return { id: user.id, email: user.email, name: user.name, roles };
}

export async function createSession(db: Db, userId: string, meta: { ip: string | null; userAgent: string | null }) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null });
  // opportunistic cleanup of this user's expired sessions
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
  return { token, expiresAt };
}

export async function resolveSession(db: Db, token: string | undefined): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, disabledAt: users.disabledAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || row.disabledAt) return null;
  return { id: row.id, email: row.email, name: row.name, roles: await rolesFor(db, row.id) };
}

export async function deleteSession(db: Db, token: string | undefined) {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}
