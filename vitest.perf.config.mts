import path from "node:path";
import { defineConfig } from "vitest/config";

// Performance benchmark (tests/perf); run with `npm run test:perf`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/helpers/server-only-stub.ts"),
    },
  },
  test: {
    name: "perf",
    // Print the timings (Vitest hides console output of passing tests otherwise).
    silent: false,
    reporters: ["verbose"],
    environment: "node",
    server: { deps: { inline: ["next-auth", "@auth/core"] } },
    include: ["tests/perf/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/integration/setup-env.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 300_000,
  },
});
