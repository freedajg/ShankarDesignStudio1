import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AppError } from "./errors";

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/**
 * Wraps a route handler:
 * - rejects cross-site state-changing requests (Origin must match Host) — CSRF defence
 * - converts AppError into a JSON error with a customer-safe message
 * - logs anything else and returns a generic 500 (no stack traces to clients)
 */
export function api<C = unknown>(handler: Handler<C>, opts: { signedWebhook?: boolean } = {}): Handler<C> {
  return async (req, ctx) => {
    try {
      // Signed webhooks are server-to-server; they authenticate with an HMAC instead.
      if (!opts.signedWebhook && !["GET", "HEAD", "OPTIONS"].includes(req.method) && !sameOrigin(req)) {
        throw new AppError("FORBIDDEN", "Cross-site request refused.");
      }
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Something went wrong on our side. Please try again." } },
    { status: 500 },
  );
}

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  // Same-origin fetches from older browsers may omit Origin; fall back to Fetch Metadata.
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Parses a JSON body with a Zod schema; 400 with field messages on failure. */
export async function readJson<T extends z.ZodType>(req: NextRequest, schema: T, maxBytes = 512 * 1024): Promise<z.infer<T>> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new AppError("VALIDATION", "Request is too large.");
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > maxBytes) throw new AppError("VALIDATION", "Request is too large.");
    body = JSON.parse(text);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("VALIDATION", "Request body must be valid JSON.");
  }
  return parseOrThrow(schema, body);
}

export function parseOrThrow<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const fields = parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message }));
    throw new AppError("VALIDATION", fields[0] ? `${fields[0].path || "input"}: ${fields[0].message}` : "Invalid input.", { fields });
  }
  return parsed.data;
}

export const json = <T>(data: T, init?: ResponseInit) => NextResponse.json(data, init);
