"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { appPassword, SESSION_COOKIE, sameToken, sessionToken } from "../../lib/auth";

export async function login(fd: FormData) {
  const password = appPassword();
  if (!password) redirect("/");
  const typed = String(fd.get("password") ?? "");
  if (!sameToken(await sessionToken(typed), await sessionToken(password))) redirect("/login?wrong=1");
  // Plain http works on a home network; the cookie is marked Secure whenever the site is on https.
  const https = (await headers()).get("origin")?.startsWith("https:") ?? false;
  (await cookies()).set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/");
}
