import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { getDb } from "@/server/db/client";
import { ensureOwner } from "@/server/owner";
import { addToCart, ensureCartTokenHash } from "@/server/services/cart";

const body = z.object({
  designVersionId: z.string().uuid(),
  channel: z.enum(["B2C", "B2B"]),
  printMethodCode: z.string().min(1).max(40),
  sizes: z.array(z.object({ sizeId: z.string().uuid(), quantity: z.number().int().min(0).max(20000) })).min(1).max(20),
  // any price the client sends is ignored by construction: it isn't in this schema
});

export const POST = api(async (req) => {
  const input = await readJson(req, body);
  const owner = await ensureOwner();
  const result = await addToCart(await getDb(), owner.tokenHash, await ensureCartTokenHash(), input);
  return json(result, { status: 201 });
});
