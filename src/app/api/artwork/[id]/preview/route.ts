import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/server/http";
import { getDb } from "@/server/db/client";
import { notFound } from "@/server/errors";
import { currentOwner } from "@/server/owner";
import { getAsset } from "@/server/services/artwork";
import { getStaffUser } from "@/server/auth/session";
import { can } from "@/domain/permissions";
import { storage, type Bucket } from "@/server/storage";

/** Editor preview of an uploaded image — only for the browser that uploaded it, or staff. */
export const GET = api<RouteContext<"/api/artwork/[id]/preview">>(async (_req, ctx) => {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) throw notFound("That image");
  const db = await getDb();
  const asset = await getAsset(db, id);
  if (!asset || asset.kind !== "PROCESSED" || !asset.previewKey) throw notFound("That image");

  const owner = await currentOwner();
  const isOwner = !!owner && owner.tokenHash === asset.ownerTokenHash;
  if (!isOwner) {
    const staff = await getStaffUser();
    if (!staff || !can(staff.roles, "artwork:download")) throw notFound("That image");
  }
  const data = await storage().get(asset.bucket as Bucket, asset.previewKey);
  if (!data) throw notFound("That image");
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
