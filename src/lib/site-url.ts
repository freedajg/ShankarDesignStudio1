/**
 * Public base URL of the site. Never throws: it prefers APP_URL when it is a
 * valid absolute URL, then the host Vercel provides for the deployment, then
 * localhost. (A blank APP_URL — easy to create in a hosting dashboard — must not
 * break the build.)
 */
export function siteUrl(): URL {
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const candidates = [process.env.APP_URL?.trim(), vercelHost ? `https://${vercelHost}` : undefined];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const url = new URL(c);
      if (url.protocol === "http:" || url.protocol === "https:") return url;
    } catch {
      /* not a URL — try the next candidate */
    }
  }
  return new URL("http://localhost:3000");
}
