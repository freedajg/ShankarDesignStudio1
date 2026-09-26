import "server-only";
import { connection } from "next/server";
import { getDb } from "./client";

/**
 * Database access from pages. `connection()` keeps the query out of build-time
 * prerendering: catalogue, prices and stock must be read per request.
 */
export async function requestDb() {
  await connection();
  return getDb();
}
