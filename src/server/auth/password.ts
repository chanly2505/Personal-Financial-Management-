import "server-only";
import { hash, verify } from "@node-rs/argon2";

// Algorithm.Argon2id; the package exports it as an ambient const enum, which
// isolatedModules cannot import.
const ARGON2ID = 2;

/**
 * Password hashing with argon2id at OWASP's recommended minimum parameters
 * (19 MiB memory, 2 iterations, 1 lane). Salts are generated per hash and
 * embedded in the PHC string, so parameters can be raised later without a
 * migration: old hashes still verify, and `needsRehash` flags them.
 */
const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/** Constant-time verification. Returns false (never throws) for malformed hashes. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** True when a stored hash uses weaker parameters than the current ones. */
export function needsRehash(passwordHash: string): boolean {
  return !passwordHash.startsWith(
    `$argon2id$v=19$m=${OPTIONS.memoryCost},t=${OPTIONS.timeCost},p=${OPTIONS.parallelism}$`,
  );
}

let dummyHash: Promise<string> | undefined;

/**
 * Verify against a throwaway hash so that "unknown email" takes as long as
 * "wrong password" — response time must not reveal which emails are registered.
 */
export async function verifyDummyPassword(password: string): Promise<false> {
  dummyHash ??= hashPassword("dummy-password-for-timing-equalisation");
  await verifyPassword(await dummyHash, password);
  return false;
}
