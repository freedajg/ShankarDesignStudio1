import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { getDb } from "@/server/db/client";
import { ensureOwner } from "@/server/owner";
import { createDesign } from "@/server/services/designs";
import { enforce } from "@/server/services/rate-limit";

const body = z.object({ doc: z.unknown(), name: z.string().max(80).optional() });

/** Create a design (the first time a customer changes anything in the studio). */
export const POST = api(async (req) => {
  const input = await readJson(req, body);
  const db = await getDb();
  const owner = await ensureOwner();
  await enforce(db, `design:create:${owner.tokenHash}`, 60, 60 * 60, "Too many new designs in a short time. Please wait a little.");
  const design = await createDesign(db, owner, input);
  return json({ design }, { status: 201 });
});
