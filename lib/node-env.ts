// Stands in for `cloudflare:workers` in the Node build (vite.config.ts aliases it
// with `--mode node`). Settings come from process.env, and DB is a SQLite file
// behind the small part of the D1 API this app uses.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

type Row = Record<string, unknown>;

// D1 binds booleans and undefined loosely; node:sqlite only takes these types.
const toSql = (v: unknown): SQLInputValue =>
  v === undefined ? null : typeof v === "boolean" ? Number(v) : (v as SQLInputValue);

class Statement {
  constructor(private db: DatabaseSync, private sql: string, private params: SQLInputValue[] = []) {}

  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params.map(toSql));
  }

  private stmt() {
    return this.db.prepare(this.sql);
  }

  async all<T = Row>() {
    return { results: this.stmt().all(...this.params) as T[], success: true, meta: {} };
  }

  async first<T = Row>(column?: string): Promise<T | null> {
    const row = this.stmt().get(...this.params) as Row | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async run() {
    // Statements that return rows (PRAGMA, SELECT) still report them, as D1 does in a batch.
    const stmt = this.stmt();
    if (stmt.columns().length) return { results: stmt.all(...this.params), success: true, meta: { changes: 0 } };
    const r = stmt.run(...this.params);
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

class Database {
  constructor(private db: DatabaseSync) {}

  prepare(sql: string) {
    return new Statement(this.db, sql);
  }

  /** All statements in one transaction, like D1. */
  async batch(statements: Statement[]) {
    this.db.exec("BEGIN");
    try {
      const out = [];
      for (const s of statements) out.push(await s.run());
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}

let db: Database | null = null;
function openDb() {
  if (!db) {
    const file = process.env.DATABASE_PATH || "data/health.sqlite";
    mkdirSync(dirname(file), { recursive: true });
    const sqlite = new DatabaseSync(file);
    sqlite.exec("PRAGMA journal_mode = WAL");
    db = new Database(sqlite);
  }
  return db;
}

export const env: Record<string, unknown> = new Proxy({}, {
  get: (_, key) => (key === "DB" ? openDb() : typeof key === "string" ? process.env[key] : undefined),
});
