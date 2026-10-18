import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is rendered per request (CSP nonce, signed-in data), so no
// incremental cache (R2/KV) is needed.
export default defineCloudflareConfig({});
