import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { getDb } from "@/server/db/client";
import { notFound } from "@/server/errors";
import { currentOwner, ensureOwner } from "@/server/owner";
import { getOwnedDesign, saveDraft } from "@/server/services/designs";

const uuid = z.string().uuid();
const body = z.object({ doc: z.unknown(), name: z.string().max(80).optional() });

export const GET = api<RouteContext<"/api/designs/[id]">>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const owner = await currentOwner();
  if (!owner || !uuid.safeParse(id).success) throw notFound("That design");
  const { design, doc, assets } = await getOwnedDesign(await getDb(), owner, id);
  return json({ design: { id: design.id, name: design.name, draftRevision: design.draftRevision, updatedAt: design.updatedAt }, doc, assets });
});

/** Autosave of the working draft. */
export const PUT = api<RouteContext<"/api/designs/[id]">>(async (req, ctx) => {
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw notFound("That design");
  const input = await readJson(req, body);
  const saved = await saveDraft(await getDb(), await ensureOwner(), id, input);
  return json({ design: saved });
});
