import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = {
  // Every page is rendered per request (CSP nonce, signed-in data), so no
  // incremental cache (R2/KV) is needed.
  ...defineCloudflareConfig({}),
  // Build Next.js directly: `npm run build` itself hands over to the
  // Cloudflare build on Workers Builds (scripts/build.sh), which would loop.
  buildCommand: "npx next build",
};

export default config;
