import { NextResponse, type NextRequest } from "next/server";
import { buildAdminContentSecurityPolicy, createAdminNonce } from "@/lib/contentSecurityPolicy";

export function proxy(request: NextRequest) {
  const nonce = createAdminNonce();
  const contentSecurityPolicy = buildAdminContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);

  // Next reads the request CSP and applies its nonce to framework bootstrap,
  // React flight data, and other generated script elements for this response.
  requestHeaders.set("content-security-policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
