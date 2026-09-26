import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { redactUrl } from "@/server/db/url";

export const dynamic = "force-dynamic";

/**
 * Setup diagnostics for the shop owner: is the configuration valid, does the
 * database connect, is AI switched on? Reports no secrets — only which
 * setting is wrong and a sanitised error message.
 */
export async function GET() {
  const out: Record<string, unknown> = { ok: false };
  const clean = (err: unknown) =>
    (err instanceof Error ? err.message : String(err))
      .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"']+/gi, (u) => redactUrl(u))
      .replace(/(sk|or|key)-[A-Za-z0-9_-]{8,}/g, "$1-•••")
      .slice(0, 400);

  let e;
  try {
    const { env } = await import("@/server/env");
    e = env();
    out.config = "ok";
    out.demoMode = e.DEMO_MODE;
    out.database = e.DATABASE_URL ? `postgres (${redactUrl(e.DATABASE_URL)})` : "embedded (temporary, per server)";
    out.fileStorage = e.STORAGE_DRIVER;
  } catch (err) {
    out.config = clean(err);
    return NextResponse.json(out, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const { getDb } = await import("@/server/db/client");
    const db = await getDb();
    const rows = (await db.execute(sql`select count(*)::int as n from products`)) as unknown as { n: number }[] | { rows: { n: number }[] };
    const n = Array.isArray(rows) ? rows[0]?.n : rows.rows?.[0]?.n;
    out.databaseStatus = "ok";
    out.products = n;
  } catch (err) {
    out.databaseStatus = clean(err);
    return NextResponse.json(out, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const { imageProviders } = await import("@/server/ai/image-generation/registry");
    const providers = imageProviders();
    out.ai = providers.length ? providers.map((p) => `${p.name} (${p.model})`).join(" → ") : "off — add OPENAI_API_KEY or OPENROUTER_API_KEY";
  } catch (err) {
    out.ai = clean(err);
  }
  out.ok = true;
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
