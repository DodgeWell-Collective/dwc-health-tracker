import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// The Node build's stand-in for D1 (lib/node-env.ts), on a throwaway SQLite file.
type Stmt = { bind(...p: unknown[]): Stmt; all<T>(): Promise<{ results: T[] }>; first<T>(): Promise<T | null>; run(): Promise<{ results: unknown[]; meta: { changes: number } }> };
type Db = { prepare(sql: string): Stmt; batch(s: Stmt[]): Promise<{ results: unknown[] }[]> };
let db: Db;

beforeAll(async () => {
  process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "health-")), "test.sqlite");
  process.env.SOME_KEY = "abc";
  const { env } = await import("../lib/node-env");
  db = env.DB as Db;
  await db.prepare("CREATE TABLE metric (date TEXT, kind TEXT, value REAL, PRIMARY KEY (date, kind))").run();
});

describe("node-env", () => {
  it("reads settings from process.env", async () => {
    const { env } = await import("../lib/node-env");
    expect(env.SOME_KEY).toBe("abc");
    expect(env.MISSING).toBeUndefined();
  });

  it("binds, writes and reads like D1", async () => {
    const r = await db.prepare("INSERT INTO metric VALUES (?, ?, ?)").bind("2026-10-23", "water", 16).run();
    expect(r.meta.changes).toBe(1);
    expect(await db.prepare("SELECT value FROM metric WHERE kind = ?").bind("water").first()).toEqual({ value: 16 });
    expect(await db.prepare("SELECT value FROM metric WHERE kind = ?").bind("nope").first()).toBeNull();
    expect((await db.prepare("SELECT * FROM metric").all()).results).toHaveLength(1);
  });

  it("returns rows from queries inside a batch", async () => {
    const [, info, count] = await db.batch([
      db.prepare("INSERT INTO metric VALUES ('2026-10-24', 'sleep', 7)"),
      db.prepare("PRAGMA table_info(metric)"),
      db.prepare("SELECT COUNT(*) AS n FROM metric"),
    ]);
    expect((info.results as { name: string }[]).map((c) => c.name)).toEqual(["date", "kind", "value"]);
    expect(count.results).toEqual([{ n: 2 }]);
  });

  it("rolls back a failed batch", async () => {
    await expect(db.batch([
      db.prepare("INSERT INTO metric VALUES ('2026-10-25', 'sleep', 8)"),
      db.prepare("INSERT INTO metric VALUES ('2026-10-23', 'water', 1)"), // duplicate key
    ])).rejects.toThrow();
    expect(await db.prepare("SELECT * FROM metric WHERE date = '2026-10-25'").first()).toBeNull();
  });
});
