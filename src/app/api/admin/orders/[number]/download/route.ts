import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { api } from "@/server/http";
import { getDb } from "@/server/db/client";
import { orders } from "@/server/db/schema";
import { notFound } from "@/server/errors";
import { requestMeta, requirePermissionApi } from "@/server/auth/session";
import { audit } from "@/server/services/audit";
import { orderDetail } from "@/server/services/orders";
import { artworkFile, designJson, orderPdf, printFile } from "@/server/production/files";

const query = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("print"), item: z.coerce.number().int().min(1).max(200), side: z.enum(["front", "back"]) }),
  z.object({ kind: z.literal("json"), item: z.coerce.number().int().min(1).max(200) }),
  z.object({ kind: z.literal("pdf") }),
  z.object({ kind: z.enum(["original", "processed"]), asset: z.string().uuid() }),
]);

/** Staff downloads of production assets. Every download is audit-logged. */
export const GET = api<RouteContext<"/api/admin/orders/[number]/download">>(async (req, ctx) => {
  const user = await requirePermissionApi("artwork:download");
  const { number } = await ctx.params;
  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) throw notFound("That file");
  const db = await getDb();
  const [row] = await db.select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, number)).limit(1);
  if (!row) throw notFound("That order");
  const detail = await orderDetail(db, row.id);
  const q = parsed.data;

  const file =
    q.kind === "print"
      ? await printFile(db, detail, q.item - 1, q.side, user.id)
      : q.kind === "json"
        ? await designJson(db, detail, q.item - 1)
        : q.kind === "pdf"
          ? await orderPdf(db, detail)
          : await artworkFile(db, detail, q.asset, q.kind);

  await audit(db, { actorUserId: user.id, action: "order.file_downloaded", entityType: "order", entityId: row.id, data: { file: file.filename }, ip: (await requestMeta()).ip });
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
