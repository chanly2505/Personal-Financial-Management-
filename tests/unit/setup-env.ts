// Unit tests never touch a database or real secrets, but some modules validate
// the environment when imported (src/server/env.ts). Give them harmless values
// so `npm run test:unit` works on its own, not only inside the full run.
process.env.DATABASE_URL ??= "postgresql://unit:unit@localhost:5432/unit_tests_never_connect";
process.env.AUTH_SECRET ??= "unit-test-secret-unit-test-secret-unit";
