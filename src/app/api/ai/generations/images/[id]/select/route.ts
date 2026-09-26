import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { getDb } from "@/server/db/client";
import { notFound } from "@/server/errors";
import { currentOwner } from "@/server/owner";
import { markSelected } from "@/server/services/ai-generation";

/** Records that this AI variation was placed on the customer's design. */
export const POST = api<RouteContext<"/api/ai/generations/images/[id]/select">>(async (req, ctx) => {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) throw notFound("That design");
  const owner = await currentOwner();
  if (!owner) throw notFound("That design");
  const body = await readJson(req, z.object({ designId: z.string().uuid().nullish() }), 2048);
  await markSelected(await getDb(), owner.tokenHash, id, body.designId ?? null);
  return json({ ok: true });
});
