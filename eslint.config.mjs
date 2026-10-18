import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Layer boundaries from docs/ARCHITECTURE.md §3. Server code must never reach
// UI or shared helpers, and Prisma is reachable only through src/server/db.ts
// and feature repositories.
const serverImports = {
  group: ["@/server", "@/server/*", "@/features/*/server/*", "**/server/*"],
  message: "UI and shared code must not import server-only modules (docs/ARCHITECTURE.md §3).",
};
const prismaImports = {
  group: ["@/generated/prisma", "@/generated/prisma/*", "@prisma/client", "@prisma/client/*"],
  message: "Only src/server/db.ts and feature repositories may import Prisma.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "src/components/**",
      "src/lib/**",
      "src/features/*/components/**",
      "src/features/*/schemas.ts",
      "src/features/*/types.ts",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: [serverImports, prismaImports] }],
    },
  },
  {
    files: ["src/app/**", "src/features/*/actions.ts", "src/features/*/server/service.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [prismaImports] }],
    },
  },
  {
    // Only these files may construct or query Prisma directly.
    files: ["src/server/**", "src/features/*/server/repository.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: "dangerouslySetInnerHTML is forbidden (docs/SECURITY.md §5).",
        },
        {
          selector: "MemberExpression[property.name=/^\\$(queryRawUnsafe|executeRawUnsafe)$/]",
          message: "Unsafe raw SQL is forbidden outside test helpers (docs/SECURITY.md §5).",
        },
      ],
    },
  },
  {
    files: ["tests/**"],
    rules: { "no-restricted-syntax": "off" },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated and report output.
    "src/generated/**",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    // Cloudflare build output (scripts/cloudflare-build.sh, wrangler).
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
