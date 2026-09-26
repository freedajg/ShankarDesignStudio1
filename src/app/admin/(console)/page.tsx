import { requirePermissionPage } from "@/server/auth/session";

export default async function AdminHome() {
  const user = await requirePermissionPage("admin:access");
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>
      <p className="mt-2 text-ink-muted">Order metrics arrive with the orders milestone.</p>
    </div>
  );
}
