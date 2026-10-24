import { env } from "cloudflare:workers";

// Optional single-password login. With APP_PASSWORD unset the app is open, as it is
// behind Cloudflare Access. The session cookie holds an HMAC of the password, so
// changing the password signs every device out.
export const SESSION_COOKIE = "session";

export function appPassword(): string | undefined {
  return (env as unknown as { APP_PASSWORD?: string }).APP_PASSWORD || undefined;
}

export async function sessionToken(password: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("health-session-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares in constant time so the token can't be guessed byte by byte. */
export function sameToken(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
