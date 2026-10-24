import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

// Sign-in against a throwaway SQLite database (cloudflare:workers → lib/node-env.ts).
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "health-auth-")), "test.sqlite");
type Auth = typeof import("../lib/auth");
type Secrets = typeof import("../lib/secrets");
let auth: Auth;
let secrets: Secrets;

beforeAll(async () => {
  auth = await import("../lib/auth");
  secrets = await import("../lib/secrets");
});

beforeEach(async () => {
  process.env.APP_PASSWORD = "first-password";
  delete process.env.APP_AUTH;
  await secrets.deleteSecret("password_hash");
  await auth.clearFailures();
  auth.forgetSession();
});

describe("passwords", () => {
  it("hashes with a fresh salt and verifies", async () => {
    const a = await auth.hashPassword("correct horse");
    const b = await auth.hashPassword("correct horse");
    expect(a).not.toBe(b);
    expect(await auth.verifyHash("correct horse", a)).toBe(true);
    expect(await auth.verifyHash("wrong horse", a)).toBe(false);
  });

  it("uses APP_PASSWORD until one is set in Settings", async () => {
    expect(await auth.checkPassword("first-password")).toBe(true);
    await secrets.setSecret("password_hash", await auth.hashPassword("second-password"));
    expect(await auth.checkPassword("first-password")).toBe(false);
    expect(await auth.checkPassword("second-password")).toBe(true);
  });

  it("stays locked with no password at all", async () => {
    delete process.env.APP_PASSWORD;
    expect(await auth.hasPassword()).toBe(false);
    expect(await auth.checkPassword("")).toBe(false);
    expect(await auth.validSession("")).toBe(false);
    expect(await auth.sessionToken()).toBeNull();
  });
});

describe("sessions", () => {
  it("accepts only the current token", async () => {
    const token = (await auth.sessionToken())!;
    expect(await auth.validSession(token)).toBe(true);
    expect(await auth.validSession(token.replace(/.$/, "0"))).toBe(token.endsWith("0"));
    expect(await auth.validSession(undefined)).toBe(false);
  });

  it("signs every device out when the password changes", async () => {
    const before = (await auth.sessionToken())!;
    await secrets.setSecret("password_hash", await auth.hashPassword("second-password"));
    auth.forgetSession();
    expect(await auth.validSession(before)).toBe(false);
    expect(await auth.validSession((await auth.sessionToken())!)).toBe(true);
  });
});

describe("lockout", () => {
  it("locks after 10 wrong passwords and clears on success", async () => {
    for (let i = 0; i < 9; i++) await auth.recordFailure();
    expect(await auth.lockedOut()).toBe(false);
    await auth.recordFailure();
    expect(await auth.lockedOut()).toBe(true);
    await auth.clearFailures();
    expect(await auth.lockedOut()).toBe(false);
  });
});

describe("API keys", () => {
  it("prefers a key saved in Settings over the server setting", async () => {
    process.env.ANTHROPIC_API_KEY = "from-server";
    expect(await secrets.apiKey("anthropic_api_key")).toBe("from-server");
    await secrets.setSecret("anthropic_api_key", "from-settings");
    expect(await secrets.apiKey("anthropic_api_key")).toBe("from-settings");
    await secrets.deleteSecret("anthropic_api_key");
    delete process.env.ANTHROPIC_API_KEY;
    expect(await secrets.apiKey("anthropic_api_key")).toBeUndefined();
  });
});
