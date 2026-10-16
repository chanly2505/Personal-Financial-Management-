import { registerUser } from "@/features/auth/server/service";

let sequence = 0;

export const TEST_PASSWORD = "correct horse battery staple";

/** Register a real user through the service (argon2id hash, default categories). */
export async function registerTestUser(overrides: { email?: string; password?: string } = {}) {
  sequence += 1;
  const email = overrides.email ?? `person${sequence}-${Date.now()}@example.test`;
  const password = overrides.password ?? TEST_PASSWORD;
  const user = await registerUser({ email, password, name: `Person ${sequence}` });
  return { ...user, password };
}
