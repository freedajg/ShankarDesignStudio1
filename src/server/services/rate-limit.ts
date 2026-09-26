import "server-only";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { rateLimits } from "../db/schema";
import { AppError } from "../errors";

/**
 * Fixed-window rate limit stored in Postgres so it holds across serverless instances.
 * One atomic upsert per call: resets the window when it has expired, else increments.
 */
export async function hit(db: DbOrTx, key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; count: number }> {
  const rows = await db
    .insert(rateLimits)
    .values({ key, windowStart: new Date(), count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} < now() - make_interval(secs => ${windowSeconds}) then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.windowStart} < now() - make_interval(secs => ${windowSeconds}) then now() else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count });
  const count = rows[0]?.count ?? 1;
  return { allowed: count <= limit, count };
}

export async function enforce(db: DbOrTx, key: string, limit: number, windowSeconds: number, message = "Too many attempts. Please wait a minute and try again.") {
  const { allowed } = await hit(db, key, limit, windowSeconds);
  if (!allowed) throw new AppError("RATE_LIMITED", message);
}
