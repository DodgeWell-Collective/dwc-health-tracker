import { setting } from "./secrets";

// With APP_AUTH=access, Cloudflare Access does the sign-in and the app checks its work:
// every request must carry the token Access signs (Cf-Access-Jwt-Assertion), issued by
// your team for this application. So a route that skips Access (a workers.dev or preview
// address switched on later, say) gets nothing.

type Jwk = JsonWebKey & { kid: string };

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const json = (s: string) => JSON.parse(new TextDecoder().decode(b64url(s)));

/** "myteam" or "myteam.cloudflareaccess.com" → "https://myteam.cloudflareaccess.com". */
export function accessIssuer(team: string) {
  const host = team.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return `https://${host.includes(".") ? host : `${host}.cloudflareaccess.com`}`;
}

// Access rotates its signing keys every few weeks; fetch them again after an hour or on an unknown key.
let certs: { issuer: string; keys: Jwk[]; at: number } | null = null;
async function signingKey(issuer: string, kid: string, fetchKeys: typeof fetch) {
  const fresh = certs && certs.issuer === issuer && Date.now() - certs.at < 3_600_000;
  if (!fresh || !certs!.keys.some((k) => k.kid === kid)) {
    const res = await fetchKeys(`${issuer}/cdn-cgi/access/certs`);
    if (!res.ok) return null;
    certs = { issuer, keys: ((await res.json()) as { keys: Jwk[] }).keys, at: Date.now() };
  }
  const jwk = certs!.keys.find((k) => k.kid === kid);
  return jwk ? crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]) : null;
}

/** True when `token` is a current Access token for this team and application. */
export async function validAccessToken(token: string | null | undefined, team: string, aud: string, fetchKeys: typeof fetch = fetch) {
  try {
    const [head, body, sig] = (token ?? "").split(".");
    if (!head || !body || !sig) return false;
    const header = json(head) as { alg?: string; kid?: string };
    if (header.alg !== "RS256" || !header.kid) return false;
    const issuer = accessIssuer(team);
    const key = await signingKey(issuer, header.kid, fetchKeys);
    if (!key) return false;
    if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(sig), new TextEncoder().encode(`${head}.${body}`)))) return false;
    const claims = json(body) as { iss?: string; aud?: string | string[]; exp?: number; nbf?: number };
    const now = Date.now() / 1000;
    const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    return claims.iss === issuer && auds.includes(aud) && typeof claims.exp === "number" && claims.exp > now && (claims.nbf ?? 0) <= now + 60;
  } catch {
    return false;
  }
}

/** Access settings, when APP_AUTH=access. Missing team or AUD means nothing is let in. */
export function accessConfig() {
  return { team: setting("ACCESS_TEAM") ?? "", aud: setting("ACCESS_AUD") ?? "" };
}
