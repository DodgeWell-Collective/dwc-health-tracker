import { env } from "cloudflare:workers";
import { first, run } from "./db";

/** A Worker secret/var on Cloudflare, an environment variable on Node. */
export function setting(name: string): string | undefined {
  return (env as unknown as Record<string, string | undefined>)[name] || undefined;
}

export type SecretKey = "password_hash" | "session_key" | "login_failures" | "anthropic_api_key" | "usda_api_key";

export async function getSecret(key: SecretKey) {
  return (await first<{ value: string }>("SELECT value FROM app_secret WHERE key = ?", key))?.value ?? null;
}

export async function setSecret(key: SecretKey, value: string) {
  await run("INSERT INTO app_secret (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", key, value);
}

export async function deleteSecret(key: SecretKey) {
  await run("DELETE FROM app_secret WHERE key = ?", key);
}

/** API keys: one saved in Settings wins over the server setting. */
export async function apiKey(key: "anthropic_api_key" | "usda_api_key") {
  return (await getSecret(key)) ?? setting(key.toUpperCase());
}
