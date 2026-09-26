"use client";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** JSON fetch against our own API. Errors carry the server's customer-safe message. */
export async function apiFetch<T>(url: string, init: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal; keepalive?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.body || init.form ? "POST" : "GET"),
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
      signal: init.signal,
      keepalive: init.keepalive,
      credentials: "same-origin",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("You appear to be offline. Check your connection and try again.", 0, "NETWORK");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(err?.message ?? "Something went wrong. Please try again.", res.status, err?.code ?? "UNKNOWN", err?.details);
  }
  return data as T;
}
