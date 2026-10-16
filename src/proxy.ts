import { type NextRequest, NextResponse } from "next/server";

/**
 * Runs before every page request (Next.js 16 "proxy", formerly middleware).
 *
 * 1. Content-Security-Policy with a fresh nonce per request (docs/SECURITY.md §7).
 * 2. Optimistic auth redirect: a protected page requested without any session
 *    cookie goes straight to sign-in. This is only a fast path — the real check
 *    is requirePageUser() in the (app) layout, which also catches expired or
 *    revoked cookies. The proxy never redirects *away* from auth pages based on
 *    a cookie, so a stale cookie cannot cause a redirect loop.
 */

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/transactions",
  "/accounts",
  "/categories",
  "/budgets",
  "/recurring",
  "/goals",
  "/reports",
  "/settings",
];

const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(({ name }) => SESSION_COOKIES.some((c) => name === c || name.startsWith(`${c}.`)));
}

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function contentSecurityPolicy(nonce: string, request: NextRequest): string {
  const isDev = process.env.NODE_ENV === "development";
  const isHttps =
    request.headers.get("x-forwarded-proto") === "https" || request.nextUrl.protocol === "https:";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are required by Radix positioning and toasts.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isProtected(pathname) && !hasSessionCookie(request)) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(signIn);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, request);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  // Lets server components build "return to this page" links after sign-in.
  requestHeaders.set("x-pathname", `${pathname}${search}`);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Pages only: skip API routes, Next.js internals and static files.
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
