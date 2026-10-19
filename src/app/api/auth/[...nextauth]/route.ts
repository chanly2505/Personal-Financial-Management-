import type { NextRequest } from "next/server";

import { handlers } from "@/server/auth/config";

/**
 * Auth.js endpoints. GET /api/auth/session is answered with "no session":
 * nothing in the app uses it (pages and actions verify sessions on the server,
 * including revocation), and Auth.js would otherwise return the name and email
 * from a revoked cookie and re-issue it (SEC-3, docs/security-audit.md).
 */
export function GET(request: NextRequest) {
  if (request.nextUrl.pathname.replace(/\/$/, "").endsWith("/api/auth/session")) {
    return Response.json(null, { headers: { "Cache-Control": "no-store" } });
  }
  return handlers.GET(request);
}

export const { POST } = handlers;
