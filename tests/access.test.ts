import { describe, expect, it } from "vitest";
import { accessIssuer, validAccessToken } from "../lib/access";

// Cloudflare Access tokens, signed with a throwaway key served as the team's certs.
const TEAM = "myteam";
const AUD = "app-aud-tag";
const pair = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
);
const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" };
const certs = (async () => new Response(JSON.stringify({ keys: [jwk] }))) as unknown as typeof fetch;

const b64 = (b: Uint8Array | string) =>
  btoa(typeof b === "string" ? b : String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function token(claims: Record<string, unknown>, key = pair.privateKey, kid = "k1") {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: "RS256", kid }));
  const body = b64(JSON.stringify({ iss: accessIssuer(TEAM), aud: [AUD], exp: now + 600, nbf: now, ...claims }));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64(sig)}`;
}

describe("Cloudflare Access tokens", () => {
  it("accepts a current token for this app", async () => {
    expect(await validAccessToken(await token({}), TEAM, AUD, certs)).toBe(true);
  });

  it("rejects other apps, other teams, expired and missing tokens", async () => {
    expect(await validAccessToken(await token({ aud: ["another-app"] }), TEAM, AUD, certs)).toBe(false);
    expect(await validAccessToken(await token({ iss: "https://evil.cloudflareaccess.com" }), TEAM, AUD, certs)).toBe(false);
    expect(await validAccessToken(await token({ exp: Math.floor(Date.now() / 1000) - 5 }), TEAM, AUD, certs)).toBe(false);
    expect(await validAccessToken(undefined, TEAM, AUD, certs)).toBe(false);
    expect(await validAccessToken("not.a.token", TEAM, AUD, certs)).toBe(false);
  });

  it("rejects a token signed with someone else's key", async () => {
    const other = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    expect(await validAccessToken(await token({}, other.privateKey), TEAM, AUD, certs)).toBe(false);
    expect(await validAccessToken(await token({}, other.privateKey, "unknown"), TEAM, AUD, certs)).toBe(false);
  });

  it("rejects a token with its claims edited after signing", async () => {
    const [head, , sig] = (await token({})).split(".");
    const forged = b64(JSON.stringify({ iss: accessIssuer(TEAM), aud: [AUD], exp: 9999999999 }));
    expect(await validAccessToken(`${head}.${forged}.${sig}`, TEAM, AUD, certs)).toBe(false);
  });
});
