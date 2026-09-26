import { NextResponse } from "next/server";
import { api, json, readJson } from "@/server/http";
import { getDb } from "@/server/db/client";
import { currentOwner, ensureOwner } from "@/server/owner";
import { requestMeta } from "@/server/auth/session";
import { AI_MESSAGES, aiStatus, GenerationFailed, generationInput, listGenerations, prepareGeneration, runGeneration } from "@/server/services/ai-generation";

// image models can take a while; the client shows staged progress and can cancel
export const maxDuration = 180;

/** Status (enabled, remaining quota) + this browser's recent AI designs. */
export const GET = api(async () => {
  const db = await getDb();
  const owner = await currentOwner();
  const [status, generations] = await Promise.all([aiStatus(db, owner?.tokenHash ?? null), owner ? listGenerations(db, owner.tokenHash) : []]);
  return json({ status, generations });
});

/**
 * Generate artwork. Validation, limits and ownership are checked up front
 * (plain JSON errors). Then the response streams NDJSON progress events:
 *   {"type":"stage","stage":"interpreting"|"generating"|"processing"}
 *   {"type":"done","generation":{…},"status":{…}}
 *   {"type":"error","reason":"REFUSED"|"FAILED"|"CANCELLED","message":"…"}
 * Provider names, prompts and internal errors are never included.
 */
export const POST = api(async (req) => {
  const db = await getDb();
  const owner = await ensureOwner();
  const { ip } = await requestMeta();
  const input = await readJson(req, generationInput, 16 * 1024);
  const prep = await prepareGeneration(db, { ownerTokenHash: owner.tokenHash, ip, input });

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // client went away
        }
      };
      send({ type: "stage", stage: "interpreting" });
      try {
        const generation = await runGeneration(db, prep, { signal: abort.signal, onStage: (stage) => send({ type: "stage", stage }) });
        send({ type: "done", generation, status: await aiStatus(db, owner.tokenHash) });
      } catch (err) {
        if (err instanceof GenerationFailed) send({ type: "error", reason: err.reason, message: err.customerMessage });
        else {
          console.error("[ai] generation crashed", err);
          send({ type: "error", reason: "FAILED", message: AI_MESSAGES.failed });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new NextResponse(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
});
