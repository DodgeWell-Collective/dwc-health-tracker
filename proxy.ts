import { NextResponse, type NextRequest } from "next/server";
import { appPassword, SESSION_COOKIE, sameToken, sessionToken } from "./lib/auth";

/** Sends every request without a valid session to /login when APP_PASSWORD is set. */
export async function proxy(request: NextRequest) {
  const password = appPassword();
  if (!password) return NextResponse.next();
  const cookie = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  if (cookie && sameToken(cookie, await sessionToken(password))) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // The login page and the files it needs (styles, icons, manifest) stay public.
  matcher: ["/((?!login|_next/static|pwa/).*)"],
};
