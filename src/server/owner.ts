import "server-only";
import { cookies } from "next/headers";
import { hashToken, randomToken } from "./auth/crypto";

/**
 * Anonymous ownership. Guests don't need accounts: a random httpOnly cookie proves
 * that designs and uploads belong to this browser. Only the hash is stored.
 */
export const OWNER_COOKIE = "sg_owner";
const ONE_YEAR = 60 * 60 * 24 * 365;

export type Owner = { tokenHash: string };

/** Current owner, if the cookie exists. */
export async function currentOwner(): Promise<Owner | null> {
  const token = (await cookies()).get(OWNER_COOKIE)?.value;
  return token && token.length <= 100 ? { tokenHash: hashToken(token) } : null;
}

/** Current owner, creating the cookie if needed. Only callable where cookies can be set (route handlers, actions). */
export async function ensureOwner(): Promise<Owner> {
  const jar = await cookies();
  let token = jar.get(OWNER_COOKIE)?.value;
  if (!token || token.length > 100) {
    token = randomToken();
    jar.set(OWNER_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ONE_YEAR,
    });
  }
  return { tokenHash: hashToken(token) };
}
