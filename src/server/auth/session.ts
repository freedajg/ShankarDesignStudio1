import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "../db/client";
import { forbidden, unauthorized } from "../errors";
import { resolveSession, type SessionUser } from "./service";
import { can, type Permission } from "@/domain/permissions";

export const SESSION_COOKIE = "sg_session";

const secure = () => process.env.NODE_ENV === "production";

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Current staff user for this request (memoised per request), or null. */
export const getStaffUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveSession(await getDb(), token);
});

/** For pages / server actions: redirects to login, or throws 403. */
export async function requirePermissionPage(permission: Permission, returnTo = "/admin"): Promise<SessionUser> {
  const user = await getStaffUser();
  if (!user) redirect(`/admin/login?next=${encodeURIComponent(returnTo)}`);
  if (!can(user.roles, permission)) throw forbidden();
  return user;
}

/** For route handlers: throws AppError 401/403. */
export async function requirePermissionApi(permission: Permission): Promise<SessionUser> {
  const user = await getStaffUser();
  if (!user) throw unauthorized();
  if (!can(user.roles, permission)) throw forbidden();
  return user;
}

export async function requestMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}
