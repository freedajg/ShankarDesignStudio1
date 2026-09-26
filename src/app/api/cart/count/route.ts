import { api, json } from "@/server/http";
import { getDb } from "@/server/db/client";
import { cartCount, currentCartTokenHash } from "@/server/services/cart";

export const GET = api(async () => {
  const count = await cartCount(await getDb(), await currentCartTokenHash());
  return json({ count }, { headers: { "Cache-Control": "no-store" } });
});
