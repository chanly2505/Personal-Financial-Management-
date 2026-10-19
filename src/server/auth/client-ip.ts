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
  // Single-value headers only (x-real-ip, cf-connecting-ip, …), set by the
  // platform's edge. Lists like X-Forwarded-For are refused: proxies append on
  // the right, so the leftmost entry is whatever the client sent (SEC-6).
  const ip = raw.trim();
  if (!ip || ip.length > 64 || !/^[0-9a-fA-F:.]+$/.test(ip)) return undefined;
  return ip;
}
