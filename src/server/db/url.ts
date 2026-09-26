/**
 * Normalises a Postgres connection string for postgres.js.
 *
 * Hosted Postgres providers (Neon via Vercel, Supabase, …) hand out libpq-style
 * URLs with parameters postgres.js doesn't understand. postgres.js forwards
 * unknown query parameters to the server as settings, which then refuses the
 * connection — e.g. Neon's `channel_binding=require` fails with
 * `unrecognized configuration parameter "channel_binding"`. Drop those.
 */
const LIBPQ_ONLY = ["channel_binding", "gssencmode", "sslnegotiation", "sslcompression", "sslcert", "sslkey", "sslrootcert", "sslcrl", "krbsrvname", "service", "passfile"];

export function pgConnectionUrl(raw: string): string {
  const url = raw.trim();
  try {
    const u = new URL(url);
    for (const p of LIBPQ_ONLY) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return url;
  }
}

/** A connection string with the password removed, safe to show in diagnostics. */
export function redactUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (u.password) u.password = "•••";
    return `${u.protocol}//${u.username ? `${u.username}@` : ""}${u.host}${u.pathname}`;
  } catch {
    return "(unparseable)";
  }
}
