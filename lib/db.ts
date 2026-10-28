import { env } from "cloudflare:workers";
import { SEED_RECIPES } from "./seed-recipes";

// Schema is applied idempotently on first use per isolate, so there is no
// separate migration step for local dev or production.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    sex TEXT NOT NULL DEFAULT 'male',
    birth_year INTEGER NOT NULL DEFAULT 1985,
    height_in REAL NOT NULL DEFAULT 70,
    goal_weight_lb REAL NOT NULL DEFAULT 180,
    goal_type TEXT NOT NULL DEFAULT 'gain',
    activity TEXT NOT NULL DEFAULT 'moderate',
    calorie_target INTEGER,
    protein_g INTEGER,
    carbs_g INTEGER,
    fat_g INTEGER,
    timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    avoid_foods TEXT NOT NULL DEFAULT ''
  )`,
  `INSERT OR IGNORE INTO profile (id) VALUES (1)`,
  `CREATE TABLE IF NOT EXISTS weigh_in (
    date TEXT PRIMARY KEY,
    weight_lb REAL NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS workout_day (
    weekday INTEGER PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
    name TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS workout_exercise (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    weekday INTEGER NOT NULL,
    exercise TEXT NOT NULL,
    sets INTEGER NOT NULL DEFAULT 3,
    reps INTEGER NOT NULL DEFAULT 10,
    sort INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS set_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    exercise TEXT NOT NULL,
    weight_lb REAL NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS set_log_date ON set_log (date)`,
  `CREATE TABLE IF NOT EXISTS recipe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    meal_type TEXT NOT NULL,
    calories INTEGER NOT NULL,
    protein REAL NOT NULL,
    carbs REAL NOT NULL,
    fat REAL NOT NULL,
    ingredients TEXT NOT NULL DEFAULT '[]',
    instructions TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS meal_plan (
    date TEXT NOT NULL,
    slot TEXT NOT NULL,
    recipe_id INTEGER NOT NULL,
    servings REAL NOT NULL DEFAULT 1,
    PRIMARY KEY (date, slot)
  )`,
  `CREATE TABLE IF NOT EXISTS food_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    slot TEXT NOT NULL,
    name TEXT NOT NULL,
    calories INTEGER NOT NULL,
    protein REAL NOT NULL DEFAULT 0,
    carbs REAL NOT NULL DEFAULT 0,
    fat REAL NOT NULL DEFAULT 0,
    recipe_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS food_log_date ON food_log (date)`,
  `CREATE TABLE IF NOT EXISTS shopping_check (
    week_start TEXT NOT NULL,
    item_key TEXT NOT NULL,
    PRIMARY KEY (week_start, item_key)
  )`,
  `CREATE TABLE IF NOT EXISTS strength_goal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise TEXT NOT NULL,
    target_lb REAL NOT NULL,
    target_reps INTEGER NOT NULL DEFAULT 1,
    target_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  // Foods saved from a scan or search (nutrition per serving), so they log in one tap.
  `CREATE TABLE IF NOT EXISTS saved_food (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    calories INTEGER NOT NULL,
    protein REAL NOT NULL,
    carbs REAL NOT NULL,
    fat REAL NOT NULL,
    fiber REAL,
    sugar REAL,
    sodium REAL
  )`,
  // Every product ever scanned, as the database returned it (a FoodHit as JSON), so it
  // autocompletes when typing and a rescan doesn't need the internet.
  `CREATE TABLE IF NOT EXISTS scanned_food (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    hit TEXT NOT NULL,
    scans INTEGER NOT NULL DEFAULT 1,
    last_scanned TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  // Groceries bought (scanned or typed on the Shopping page). The planner favors recipes
  // that use them, and the shopping list counts them as had (lib/groceries.ts).
  `CREATE TABLE IF NOT EXISTS grocery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    scanned_id TEXT,
    added TEXT NOT NULL
  )`,
  // VO2 max readings (ml/kg/min), from a watch or a field test.
  `CREATE TABLE IF NOT EXISTS vo2max (
    date TEXT PRIMARY KEY,
    value REAL NOT NULL
  )`,
  // One number per day per kind: sleep hours, lab results, blood pressure, balance (lib/markers.ts).
  `CREATE TABLE IF NOT EXISTS metric (
    date TEXT NOT NULL,
    kind TEXT NOT NULL,
    value REAL NOT NULL,
    PRIMARY KEY (date, kind)
  )`,
  // Password hash, session key and API keys entered in Settings (lib/secrets.ts).
  // Left out of the data download and backups.
  `CREATE TABLE IF NOT EXISTS app_secret (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  // Items added to a trip's shopping list by hand (on top of the meal plan's ingredients).
  `CREATE TABLE IF NOT EXISTS shopping_extra (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_start TEXT NOT NULL,
    name TEXT NOT NULL,
    aisle TEXT NOT NULL DEFAULT 'pantry',
    qty INTEGER NOT NULL DEFAULT 1,
    food_id INTEGER,
    UNIQUE (trip_start, name)
  )`,
];

// Columns added after the first release. CREATE TABLE IF NOT EXISTS won't add
// them to an existing table, so add whichever are missing.
const ADDED_COLUMNS: Record<string, Record<string, string>> = {
  profile: {
    goal_date: "TEXT",
    equipment: "TEXT NOT NULL DEFAULT ''",
    equipment_notes: "TEXT NOT NULL DEFAULT ''",
    experience: "TEXT NOT NULL DEFAULT 'beginner'",
    // Grocery trips: every N days, counted from any shopping day.
    shop_every: "INTEGER NOT NULL DEFAULT 7",
    shop_anchor: "TEXT",
    // Comma-separated items always on hand; kept off the shopping list.
    pantry: "TEXT NOT NULL DEFAULT 'salt,black pepper,olive oil,cooking spray,water'",
    // Others eating the shared meals (a standard serving each), and which meals those are.
    household: "INTEGER NOT NULL DEFAULT 0",
    household_slots: "TEXT NOT NULL DEFAULT 'dinner'",
    // Set once the profile has been saved (drives the setup checklist).
    profile_done: "INTEGER NOT NULL DEFAULT 0",
  },
  weigh_in: {
    waist_in: "REAL",
  },
  food_log: {
    fiber: "REAL",
    sugar: "REAL",
    sodium: "REAL", // mg
  },
  recipe: {
    daily: "INTEGER NOT NULL DEFAULT 0",
  },
  set_log: {
    // Reps in reserve: how many more reps the set had left (0 = failure). null = not rated.
    rir: "INTEGER",
  },
};

let ready: Promise<void> | null = null;

async function init(db: D1Database) {
  // One round trip on a cold isolate: schema, column lists and the recipe count together.
  const tables = Object.keys(ADDED_COLUMNS);
  const results = await db.batch([
    ...SCHEMA.map((sql) => db.prepare(sql)),
    ...tables.map((table) => db.prepare(`PRAGMA table_info(${table})`)),
    db.prepare("SELECT COUNT(*) AS n FROM recipe"),
  ]);
  const info = results.slice(SCHEMA.length, SCHEMA.length + tables.length);
  const alters = tables.flatMap((table, i) => {
    const existing = new Set((info[i].results as { name: string }[]).map((c) => c.name));
    return Object.entries(ADDED_COLUMNS[table])
      .filter(([name]) => !existing.has(name))
      .map(([name, type]) => db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`));
  });
  if (alters.length) await db.batch(alters);
  const { n } = (results.at(-1)!.results as { n: number }[])[0];
  if (n === 0) {
    await db.batch(
      SEED_RECIPES.map((r) =>
        db
          .prepare(
            `INSERT INTO recipe (name, meal_type, calories, protein, carbs, fat, ingredients, instructions)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(r.name, r.meal_type, r.calories, r.protein, r.carbs, r.fat, JSON.stringify(r.ingredients), r.instructions),
      ),
    );
  }
}

export async function getDb(): Promise<D1Database> {
  const db = (env as unknown as { DB: D1Database }).DB;
  ready ??= init(db).catch((e) => {
    ready = null;
    throw e;
  });
  await ready;
  return db;
}

export async function all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  const db = await getDb();
  return (await db.prepare(sql).bind(...params).all<T>()).results;
}

export async function first<T>(sql: string, ...params: unknown[]): Promise<T | null> {
  const db = await getDb();
  return db.prepare(sql).bind(...params).first<T>();
}

export async function run(sql: string, ...params: unknown[]) {
  const db = await getDb();
  return db.prepare(sql).bind(...params).run();
}
