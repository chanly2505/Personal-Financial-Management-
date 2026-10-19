import "server-only";
import { argon2idAsync } from "@noble/hashes/argon2.js";

/**
 * Password hashing with argon2id at OWASP's recommended minimum parameters
 * (19 MiB memory, 2 iterations, 1 lane), stored as a standard PHC string
 * ($argon2id$v=19$m=…,t=…,p=…$salt$hash) with a per-hash random salt, so
 * parameters can be raised later without a migration: old hashes still
 * verify, and `needsRehash` flags them.
 *
 * Implementation: @noble/hashes (audited, pure JavaScript) rather than a
 * native module, so the same code runs anywhere JavaScript runs,
 * which cannot load native addons or compile WebAssembly at runtime. Hashes
 * are byte-for-byte compatible with the previous native library
 * (tests/unit/password.test.ts).
 */
const OPTIONS = { m: 19_456, t: 2, p: 1 } as const;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
// Bounds for parameters read back from a stored hash (they come from our own
// database, but a corrupted value must not make verification run for minutes).
const MAX_MEMORY_KIB = 262_144;
const MAX_TIME = 10;
const MAX_PARALLELISM = 4;

const encoder = new TextEncoder();

// PHC strings use standard base64 without padding.
function toB64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=+$/, "");
}

function fromB64(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]+$/.test(text)) return null;
  try {
    const binary = atob(text + "=".repeat((4 - (text.length % 4)) % 4));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function derive(
  password: string,
  salt: Uint8Array,
  params: { m: number; t: number; p: number },
  dkLen = HASH_BYTES,
) {
  return argon2idAsync(encoder.encode(password), salt, {
    ...params,
    dkLen,
    // Yield to the event loop now and then, so a hash does not block other requests.
    asyncTick: 10,
  });
}

interface ParsedHash {
  params: { m: number; t: number; p: number };
  salt: Uint8Array;
  hash: Uint8Array;
}

function parse(passwordHash: string): ParsedHash | null {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/.exec(passwordHash);
  if (!match) return null;
  const [m, t, p] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 8 * p || m > MAX_MEMORY_KIB || t < 1 || t > MAX_TIME || p < 1 || p > MAX_PARALLELISM) {
    return null;
  }
  const salt = fromB64(match[4]!);
  const hash = fromB64(match[5]!);
  if (!salt || !hash || salt.length < 8 || hash.length < 16 || hash.length > 64) return null;
  return { params: { m, t, p }, salt, hash };
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, OPTIONS);
  return `$argon2id$v=19$m=${OPTIONS.m},t=${OPTIONS.t},p=${OPTIONS.p}$${toB64(salt)}$${toB64(hash)}`;
}

/** Constant-time verification. Returns false (never throws) for malformed hashes. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    const parsed = parse(passwordHash);
    if (!parsed) return false;
    const actual = await derive(password, parsed.salt, parsed.params, parsed.hash.length);
    return constantTimeEqual(actual, parsed.hash);
  } catch {
    return false;
  }
}

/** True when a stored hash uses weaker parameters than the current ones. */
export function needsRehash(passwordHash: string): boolean {
  return !passwordHash.startsWith(`$argon2id$v=19$m=${OPTIONS.m},t=${OPTIONS.t},p=${OPTIONS.p}$`);
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
