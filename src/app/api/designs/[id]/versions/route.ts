import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { getDb } from "@/server/db/client";
import { notFound } from "@/server/errors";
import { ensureOwner } from "@/server/owner";
import { createVersion } from "@/server/services/designs";

const body = z.object({ doc: z.unknown(), name: z.string().max(80).optional() });

/** Explicit save: validates strictly and freezes an immutable version. */
export const POST = api<RouteContext<"/api/designs/[id]/versions">>(async (req, ctx) => {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) throw notFound("That design");
  const input = await readJson(req, body);
  const version = await createVersion(await getDb(), await ensureOwner(), id, input);
  return json({ version }, { status: 201 });
});
