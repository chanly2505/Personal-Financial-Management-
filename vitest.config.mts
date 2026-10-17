import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  // `server-only` throws outside a React Server environment; tests run in plain Node.
  "server-only": path.resolve(import.meta.dirname, "tests/helpers/server-only-stub.ts"),
};

// next-auth imports "next/server" without a file extension, which Node's ESM
// resolver rejects; letting Vite transform it resolves the import correctly.
const server = { deps: { inline: ["next-auth", "@auth/core"] } };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          server,
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/unit/setup-env.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          server,
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup-env.ts"],
          // Tests share one database and truncate it between cases.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/features/**", "src/server/**"],
    },
  },
});
