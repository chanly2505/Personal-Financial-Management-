import "server-only";

import { env } from "@/server/env";

/**
 * Client IP for rate limiting, read only from the header the hosting platform
 * guarantees (TRUSTED_IP_HEADER). Returns undefined when not configured —
 * callers then skip IP-based limits rather than trusting spoofable headers
 * such as a client-supplied X-Forwarded-For.
 */
export function getClientIp(
  headers: Headers,
  trustedHeader = env.TRUSTED_IP_HEADER,
): string | undefined {
  if (!trustedHeader) return undefined;
  const raw = headers.get(trustedHeader);
  if (!raw) return undefined;
  // For X-Forwarded-For style lists, the platform appends the real client first.
  const first = raw.split(",")[0]?.trim();
  if (!first || first.length > 64 || !/^[0-9a-fA-F:.]+$/.test(first)) return undefined;
  return first;
}
