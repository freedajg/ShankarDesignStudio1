import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/feedback";
import { Logo } from "@/components/brand";
import { getStaffUser } from "@/server/auth/session";
import { connection } from "next/server";
import { env } from "@/server/env";
import { DEMO_STAFF } from "@/server/demo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const { next } = await searchParams;
  await connection();
  const demo = env().DEMO_MODE;
  if (await getStaffUser()) redirect("/admin");
  return (
    <main className="grid flex-1 place-items-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="p-6 shadow-card">
          <h1 className="text-xl font-semibold">Staff sign in</h1>
          <p className="mb-6 mt-1 text-sm text-ink-muted">Orders, artwork and production.</p>
          <LoginForm next={typeof next === "string" ? next : undefined} />
        </Card>
        {demo && (
          <div className="mt-4 rounded-[var(--radius-md)] border border-info/20 bg-info-soft p-4 text-sm text-info" data-testid="demo-logins">
            <p className="font-semibold">Demo logins</p>
            <ul className="mt-1 space-y-0.5 font-mono text-xs">
              {DEMO_STAFF.map((u) => (
                <li key={u.email}>
                  {u.email} / {u.password} <span className="font-sans">({u.role.toLowerCase()})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
