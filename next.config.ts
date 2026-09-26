import path from "node:path";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://checkout.razorpay.com\")" },
];

const nextConfig: NextConfig = {
  // Native / WASM packages run as plain Node modules on the server, not bundled.
  serverExternalPackages: ["@electric-sql/pglite", "@napi-rs/canvas", "sharp", "postgres"],
  // Production renders read design fonts and mockups from disk; make sure they ship with the functions.
  outputFileTracingIncludes: {
    "/api/**/*": ["./public/fonts/design/**/*", "./public/mockups/**/*", "./drizzle/**/*"],
    "/admin/**/*": ["./public/fonts/design/**/*", "./public/mockups/**/*"],
  },
  // Pin the project root (the app has also lived inside a larger monorepo).
  turbopack: { root: path.resolve(".") },
  outputFileTracingRoot: path.resolve("."),
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
