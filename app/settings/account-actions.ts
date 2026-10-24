"use server";

import Anthropic from "@anthropic-ai/sdk";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkPassword, cookieOptions, forgetSession, hashPassword, lockedOut, MIN_PASSWORD, recordFailure, SESSION_COOKIE, sessionToken } from "../../lib/auth";
import { deleteSecret, setSecret } from "../../lib/secrets";

const back = (query: string) => redirect(`/settings?tab=account&${query}`);

export async function changePassword(fd: FormData) {
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  if (await lockedOut()) back("pw=locked");
  if (!(await checkPassword(current))) {
    await recordFailure();
    back("pw=wrong");
  }
  if (next.length < MIN_PASSWORD) back("pw=short");
  if (next !== String(fd.get("confirm") ?? "")) back("pw=mismatch");
  await setSecret("password_hash", await hashPassword(next));
  forgetSession();
  // Other devices are signed out; this one gets a cookie for the new password.
  const https = (await headers()).get("origin")?.startsWith("https:") ?? false;
  (await cookies()).set(SESSION_COOKIE, (await sessionToken())!, cookieOptions(https));
  back("pw=ok");
}

const KEYS = { anthropic: "anthropic_api_key", usda: "usda_api_key" } as const;
const keyName = (fd: FormData) => KEYS[String(fd.get("name")) as keyof typeof KEYS];

export async function saveApiKey(fd: FormData) {
  const name = keyName(fd);
  const value = String(fd.get("value") ?? "").trim();
  if (!name || !value) back("");
  if (name === "anthropic_api_key") {
    // A free call that fails on a bad key, so a typo shows up now instead of at the first meal.
    try {
      await new Anthropic({ apiKey: value }).models.list({ limit: 1 });
    } catch {
      back("key=bad");
    }
  }
  await setSecret(name, value);
  revalidatePath("/", "layout");
  back("key=saved");
}

export async function removeApiKey(fd: FormData) {
  const name = keyName(fd);
  if (name) await deleteSecret(name);
  revalidatePath("/", "layout");
  back("");
}
