import type { NextConfig } from "next";

/**
 * Static security headers for every response (docs/SECURITY.md §7).
 * The Content-Security-Policy is set per request in src/proxy.ts because it
 * carries a nonce.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Browsers ignore HSTS on plain-HTTP localhost, so this is safe to send everywhere.
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    // Short commit id of the build, shown by /api/health (Railway provides it while building).
    APP_COMMIT: (process.env.RAILWAY_GIT_COMMIT_SHA ?? "").slice(0, 7),
  },
  logging: {
    // `next dev` otherwise prints every server action call *with its arguments* —
    // which would put passwords and financial data in the terminal (docs/SECURITY.md §9).
    serverFunctions: false,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API responses are JSON or downloads, never pages: nothing may load or frame them (SEC-7).
      {
        source: "/api/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
