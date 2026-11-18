import type { NextConfig } from "next";

/**
 * Baseline security headers. A nonce-based Content-Security-Policy is planned
 * for Milestone 7 (see docs/ARCHITECTURE.md §6).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // Cache Components is intentionally disabled: almost every page is
  // tenant- and session-specific, and server-side caching of multi-tenant
  // data is a leak risk we do not want by default. See docs/ARCHITECTURE.md §2.
  cacheComponents: false,
  poweredByHeader: false,
  turbopack: {
    // Pin the workspace root (a stray lockfile in a parent folder confuses detection).
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
