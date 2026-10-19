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
    // Short commit id of the build, shown by /api/health. Railway, Vercel, Netlify
    // and Cloudflare expose it only while building, so it is fixed into the build here.
    APP_COMMIT: (
      process.env.RAILWAY_GIT_COMMIT_SHA ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.COMMIT_REF ??
      process.env.WORKERS_CI_COMMIT_SHA ??
      ""
    ).slice(0, 7),
  },
  logging: {
    // `next dev` otherwise prints every server action call *with its arguments* —
    // which would put passwords and financial data in the terminal (docs/SECURITY.md §9).
    serverFunctions: false,
  },
  // Cloudflare builds (scripts/cloudflare-build.sh): keep Prisma's CLI, dev
  // database and engines for other databases out of the server bundle. The
  // Workers client loads its own PostgreSQL engine from src/generated, and the
  // Worker upload has a size limit. Other hosts build exactly as before.
  ...(process.env.CF_BUILD === "1" && {
    outputFileTracingExcludes: {
      "*": [
        "node_modules/prisma/**",
        "node_modules/@prisma/dev/**",
        "node_modules/@prisma/engines/**",
        "node_modules/@prisma/studio-core/**",
        "node_modules/@prisma/fetch-engine/**",
        "node_modules/@electric-sql/**",
        "node_modules/@prisma/client/runtime/*.wasm",
        "node_modules/@prisma/client/runtime/*wasm-base64*",
        "node_modules/@prisma/client/runtime/*.{mysql,sqlite,sqlserver,cockroachdb}.*",
      ],
    },
  }),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
