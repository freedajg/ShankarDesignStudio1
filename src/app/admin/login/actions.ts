"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticateStaff, createSession, deleteSession } from "@/server/auth/service";
import { clearSessionCookie, requestMeta, SESSION_COOKIE, setSessionCookie } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { cookies } from "next/headers";

export type LoginState = { error?: string; email?: string };

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(200),
  password: z.string().min(1, "Enter your password").max(200),
  next: z.string().max(300).optional(),
});

/** Only same-site relative paths under /admin are allowed as a post-login destination. */
function safeNext(next: string | undefined) {
  return next && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };

  const db = await getDb();
  const meta = await requestMeta();
  try {
    const user = await authenticateStaff(db, { ...parsed.data, ip: meta.ip });
    const { token, expiresAt } = await createSession(db, user.id, meta);
    await setSessionCookie(token, expiresAt);
  } catch (err) {
    if (err instanceof AppError) return { error: err.message, email };
    console.error("[login]", err);
    return { error: "We couldn't sign you in right now. Please try again.", email };
  }
  redirect(safeNext(parsed.data.next));
}

export async function logout() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await deleteSession(await getDb(), token);
  await clearSessionCookie();
  redirect("/admin/login");
}
