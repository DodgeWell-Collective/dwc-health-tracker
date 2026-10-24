import { getSecret, setSecret, setting } from "./secrets";

// Single-user sign-in. The password is the one set in Settings (stored as a PBKDF2
// hash) or, until then, APP_PASSWORD. With neither, the app stays locked unless
// APP_AUTH=off says something else (such as Cloudflare Access) guards it.
// The session cookie is an HMAC of the current password under a random key kept in
// the database, so changing the password signs every device out.
export const SESSION_COOKIE = "session";
export const MIN_PASSWORD = 8;

export const authOff = () => setting("APP_AUTH") === "off";

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer | Uint8Array) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (s: string): Uint8Array<ArrayBuffer> => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)));

async function hmac(key: string, message: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

/** Compares in constant time so a value can't be guessed byte by byte. */
export function sameToken(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 100,000 is the most PBKDF2 iterations Cloudflare Workers allow.
const ITERATIONS = 100_000;

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const k = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, k, 256));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${hex(salt)}$${await pbkdf2(password, salt, ITERATIONS)}`;
}

export async function verifyHash(password: string, stored: string) {
  const [, iterations, salt, hash] = stored.split("$");
  return sameToken(await pbkdf2(password, unhex(salt), Number(iterations)), hash);
}

/** What the password is checked against: the Settings one, else APP_PASSWORD. */
async function credential(): Promise<{ hash: string } | { password: string } | null> {
  const hash = await getSecret("password_hash");
  if (hash) return { hash };
  const password = setting("APP_PASSWORD");
  return password ? { password } : null;
}

export async function hasPassword() {
  return (await credential()) != null;
}

export async function checkPassword(typed: string) {
  const c = await credential();
  if (!c) return false;
  if ("hash" in c) return verifyHash(typed, c.hash);
  return sameToken(await hmac("compare", typed), await hmac("compare", c.password));
}

async function sessionKey() {
  const existing = await getSecret("session_key");
  if (existing) return existing;
  await setSecret("session_key", hex(crypto.getRandomValues(new Uint8Array(32))));
  return (await getSecret("session_key"))!;
}

// The proxy checks every request; a short cache saves two queries per page.
let cached: { token: string | null; at: number } | null = null;
export const forgetSession = () => { cached = null; };

export async function sessionToken() {
  if (cached && Date.now() - cached.at < 30_000) return cached.token;
  const c = await credential();
  const token = c ? await hmac(await sessionKey(), "hash" in c ? c.hash : `env:${c.password}`) : null;
  cached = { token, at: Date.now() };
  return token;
}

export async function validSession(cookie: string | undefined) {
  const token = await sessionToken();
  return Boolean(cookie && token && sameToken(cookie, token));
}

// Lockout: after 10 wrong passwords within 15 minutes, sign-in waits out the window.
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60_000;

async function failures() {
  const raw = await getSecret("login_failures");
  const f = raw ? (JSON.parse(raw) as { count: number; since: number }) : null;
  return f && Date.now() - f.since < WINDOW_MS ? f : { count: 0, since: Date.now() };
}

export async function lockedOut() {
  return (await failures()).count >= MAX_FAILURES;
}

export async function recordFailure() {
  const f = await failures();
  await setSecret("login_failures", JSON.stringify({ count: f.count + 1, since: f.since }));
}

export async function clearFailures() {
  await setSecret("login_failures", JSON.stringify({ count: 0, since: Date.now() }));
}

export function cookieOptions(https: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, secure: https, path: "/", maxAge: 60 * 60 * 24 * 365 };
}
