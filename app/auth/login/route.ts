import { NextResponse, type NextRequest } from "next/server";
import { checkPassword, clearFailures, cookieOptions, lockedOut, recordFailure, SESSION_COOKIE, sessionToken } from "../../../lib/auth";

/** The sign-in form posts here (a plain route, so it can't be used to run server actions). */
export async function POST(request: NextRequest) {
  const back = (query: string) => NextResponse.redirect(new URL(`/login${query}`, request.url), 303);
  // Only this site's own sign-in form.
  if (request.headers.get("origin") !== new URL(request.url).origin) return back("");
  if (await lockedOut()) return back("?locked=1");
  const typed = String((await request.formData()).get("password") ?? "");
  if (!(await checkPassword(typed))) {
    await recordFailure();
    await new Promise((r) => setTimeout(r, 500)); // slows guessing
    return back("?wrong=1");
  }
  await clearFailures();
  const res = NextResponse.redirect(new URL("/", request.url), 303);
  res.cookies.set(SESSION_COOKIE, (await sessionToken())!, cookieOptions(request.nextUrl.protocol === "https:"));
  return res;
}
