import { z } from "zod";
import { api, json, readJson } from "@/server/http";
import { getDb } from "@/server/db/client";
import { notFound } from "@/server/errors";
import { currentCartTokenHash, removeCartItem, updateCartItemSizes } from "@/server/services/cart";

const uuid = z.string().uuid();
const body = z.object({
  sizes: z.array(z.object({ sizeId: z.string().uuid(), quantity: z.number().int().min(0).max(20000) })).min(1).max(20),
});

export const PATCH = api<RouteContext<"/api/cart/items/[id]">>(async (req, ctx) => {
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw notFound("That cart item");
  const { sizes } = await readJson(req, body);
  await updateCartItemSizes(await getDb(), await currentCartTokenHash(), id, sizes);
  return json({ ok: true });
});

export const DELETE = api<RouteContext<"/api/cart/items/[id]">>(async (_req, ctx) => {
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw notFound("That cart item");
  await removeCartItem(await getDb(), await currentCartTokenHash(), id);
  return json({ ok: true });
});
