"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ORDER_STATUSES } from "@/domain/orders";
import { requestMeta, requirePermissionPage } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { changeStatus } from "@/server/services/orders";

export type StatusActionState = { error?: string; ok?: string };

const schema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string().regex(/^SG-\d+$/),
  to: z.enum(ORDER_STATUSES),
  note: z.string().max(500).optional(),
});

export async function updateStatus(_prev: StatusActionState, formData: FormData): Promise<StatusActionState> {
  const user = await requirePermissionPage("orders:update_status");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Choose a status." };
  try {
    const res = await changeStatus(await getDb(), user, { orderId: parsed.data.orderId, to: parsed.data.to, note: parsed.data.note, ip: (await requestMeta()).ip });
    revalidatePath(`/admin/orders/${parsed.data.orderNumber}`);
    return { ok: `Moved to ${res.label}.` };
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
}
