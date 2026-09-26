import "server-only";
import type { DbOrTx } from "../db/client";
import { auditLogs } from "../db/schema";

export type AuditEntry = {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  data?: Record<string, unknown>;
  ip?: string | null;
};

/** Sensitive actions (logins, status changes, downloads of customer artwork, settings) are recorded. */
export async function audit(db: DbOrTx, entry: AuditEntry) {
  await db.insert(auditLogs).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    data: entry.data ?? null,
    ip: entry.ip ?? null,
  });
}
