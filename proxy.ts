import { NextResponse, type NextRequest } from "next/server";
import { accessConfig, validAccessToken } from "./lib/access";
import { accessAuth, authOff, SESSION_COOKIE, validSession } from "./lib/auth";

// Everything needs a session except the sign-in page and the sign-in POST itself.
// Checked per request, not by path pattern alone: server actions can be posted to any
// page URL, so a public page must not accept them.
export async function proxy(request: NextRequest) {
  // Behind Cloudflare Access: only requests carrying its signed token for this app get in.
  if (accessAuth()) {
    const { team, aud } = accessConfig();
    const ok = team && aud && (await validAccessToken(request.headers.get("cf-access-jwt-assertion"), team, aud));
    return withHeaders(ok ? NextResponse.next() : new NextResponse("Forbidden", { status: 403 }));
  }
  const { pathname } = request.nextUrl;
  const method = request.method;
  const open =
    authOff() ||
    (pathname === "/login" && (method === "GET" || method === "HEAD")) ||
    (pathname === "/auth/login" && method === "POST" && (await isPlainSignIn(request)));
  if (!open && !(await validSession(request.cookies.get(SESSION_COOKIE)?.value))) {
    return withHeaders(NextResponse.redirect(new URL("/login", request.url), 303));
  }
  return withHeaders(NextResponse.next());
}

/**
 * The sign-in form's own POST: a small url-encoded body with no server-action markers.
 * vinext runs server actions before route handlers, on any path, so a request carrying
 * an action id must not get through here without a session.
 */
async function isPlainSignIn(request: NextRequest) {
  if (request.headers.has("next-action")) return false;
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return false;
  const body = await request.clone().text();
  return body.length < 1024 && !/(\$|%24)ACTION/i.test(body);
}

/** No framing by other sites, no content-type guessing, no full URLs sent to other sites. */
function withHeaders(res: NextResponse) {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "same-origin");
  return res;
}

export const config = {
  // Static files the sign-in page needs (scripts, styles, icons, manifest).
  matcher: ["/((?!_next/static|pwa/).*)"],
};
