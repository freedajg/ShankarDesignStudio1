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
  // Server renders (cart/order/admin previews, print files) read design fonts and
  // mockups from disk; ship them with every server function.
  outputFileTracingIncludes: {
    // (drizzle + pglite: the demo-mode embedded database migrates itself at start-up)
    "/*": ["./public/fonts/design/**/*", "./public/mockups/**/*", "./drizzle/**/*", "./node_modules/@electric-sql/pglite/dist/**/*"],
    "/**/*": ["./public/fonts/design/**/*", "./public/mockups/**/*", "./drizzle/**/*", "./node_modules/@electric-sql/pglite/dist/**/*"],
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
