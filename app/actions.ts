"use server";

import { revalidatePath } from "next/cache";
import { all, first, getDb, run } from "../lib/db";
import { addDays, isDate } from "../lib/dates";
import { sameFood } from "../lib/food-match";
import { generatePlan, generateTrip, refreshPlan, SLOT_SHARE, swapMeal } from "../lib/planner";
import { getTargets, getToday } from "../lib/data";
import {
  ClaudeNotConfigured, parseFoods, suggestRecipes,
  type ParsedFood, type ParseResult, type SavedRecipe, type SuggestedRecipe,
} from "../lib/claude";
import { foodPortions, searchFoods, type FoodHit, type Macros, type Portion } from "../lib/foods";
import { AISLES, guessAisle } from "../lib/food-math";
import { substitute, type ProgramDay } from "../lib/program";
import { EQUIPMENT, SLOTS, type Aisle, type Recipe, type Slot } from "../lib/types";

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

function num(fd: FormData, key: string) {
  const v = Number(fd.get(key));
  return Number.isFinite(v) ? v : 0;
}

function optNum(fd: FormData, key: string) {
  const raw = str(fd, key);
  return raw === "" || !Number.isFinite(Number(raw)) ? null : Number(raw);
}

function date(fd: FormData) {
  const d = str(fd, "date");
  if (!isDate(d)) throw new Error("Invalid date");
  return d;
}

function slot(fd: FormData): Slot {
  const s = str(fd, "slot") as Slot;
  if (!SLOTS.includes(s)) throw new Error("Invalid slot");
  return s;
}

function done() {
  revalidatePath("/", "layout");
}

// Food

export async function logFood(fd: FormData) {
  const name = str(fd, "name");
  if (!name) return;
  await run(
    "INSERT INTO food_log (date, slot, name, calories, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?)",
    date(fd), slot(fd), name, Math.round(num(fd, "calories")), num(fd, "protein"), num(fd, "carbs"), num(fd, "fat"),
  );
  done();
}

export type ParseState = { result?: ParseResult; error?: string; description?: string };

export async function describeFood(_prev: ParseState, fd: FormData): Promise<ParseState> {
  const description = str(fd, "description").slice(0, 2000);
  if (!description) return {};
  const { timezone } = (await first<{ timezone: string }>("SELECT timezone FROM profile WHERE id = 1"))!;
  const localTime = new Date().toLocaleString("en-US", { timeZone: timezone, weekday: "long", hour: "numeric", minute: "2-digit" });
  const saved = await all<SavedRecipe>("SELECT name, calories, protein, carbs, fat FROM recipe WHERE active = 1 ORDER BY daily DESC, id DESC LIMIT 60");
  try {
    return { result: await parseFoods(description, localTime, saved), description };
  } catch (e) {
    if (e instanceof ClaudeNotConfigured) return { error: "Claude isn't set up yet: add an ANTHROPIC_API_KEY secret.", description };
    console.error("describeFood failed", e);
    return { error: e instanceof Error ? e.message : "Something went wrong talking to Claude.", description };
  }
}

/** Log several reviewed items at once (JSON array of ParsedFood in "items"). */
export async function logFoods(fd: FormData) {
  const d = date(fd);
  const items = JSON.parse(str(fd, "items") || "[]") as (ParsedFood & { fiber?: number | null; sugar?: number | null; sodium?: number | null })[];
  const db = await getDb();
  const opt = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  // File near-duplicates under the name already in the log (lib/food-match.ts), so
  // the catalog and chips don't split one food across slightly different names.
  const known = await all<{ name: string; calories: number }>(
    "SELECT name, MAX(calories) AS calories FROM food_log WHERE date >= ? AND recipe_id IS NULL GROUP BY name ORDER BY COUNT(*) DESC",
    addDays(d, -180),
  );
  const nameFor = (name: string, calories: number) => known.find((k) => sameFood(k, { name, calories }))?.name ?? name;
  const rows = items
    .filter((i) => i.name && SLOTS.includes(i.slot))
    .map((i) =>
      db
        .prepare("INSERT INTO food_log (date, slot, name, calories, protein, carbs, fat, fiber, sugar, sodium) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(
          d, i.slot, nameFor(String(i.name), Math.round(Number(i.calories) || 0)).slice(0, 200), Math.round(Number(i.calories) || 0), Number(i.protein) || 0, Number(i.carbs) || 0, Number(i.fat) || 0,
          opt(i.fiber), opt(i.sugar), opt(i.sodium),
        ),
    );
  if (rows.length) await db.batch(rows);
  done();
}

export async function eatPlanned(fd: FormData) {
  const d = date(fd);
  const s = slot(fd);
  const row = await first<Recipe & { servings: number }>(
    "SELECT r.*, p.servings FROM meal_plan p JOIN recipe r ON r.id = p.recipe_id WHERE p.date = ? AND p.slot = ?",
    d, s,
  );
  if (!row) return;
  const k = row.servings;
  const label = k === 1 ? row.name : `${row.name} (×${k})`;
  await run(
    "INSERT INTO food_log (date, slot, name, calories, protein, carbs, fat, recipe_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    d, s, label, Math.round(row.calories * k), row.protein * k, row.carbs * k, row.fat * k, row.id,
  );
  done();
}

export async function deleteFood(fd: FormData) {
  await run("DELETE FROM food_log WHERE id = ?", num(fd, "id"));
  done();
}

// Body

export async function logWeight(fd: FormData) {
  const w = num(fd, "weight_lb");
  if (w <= 0) return;
  const waist = optNum(fd, "waist_in");
  await run(
    `INSERT INTO weigh_in (date, weight_lb, waist_in) VALUES (?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET weight_lb = excluded.weight_lb, waist_in = COALESCE(excluded.waist_in, weigh_in.waist_in)`,
    date(fd), w, waist && waist > 10 ? waist : null,
  );
  done();
}

export async function deleteWeight(fd: FormData) {
  await run("DELETE FROM weigh_in WHERE date = ?", date(fd));
  done();
}

// Training

export async function logSet(fd: FormData) {
  const exercise = str(fd, "exercise");
  const reps = Math.round(num(fd, "reps"));
  if (!exercise || reps <= 0) return;
  const rir = optNum(fd, "rir");
  await run(
    "INSERT INTO set_log (date, exercise, weight_lb, reps, rir) VALUES (?, ?, ?, ?, ?)",
    date(fd), exercise, num(fd, "weight_lb"), reps, rir == null ? null : Math.min(5, Math.max(0, Math.round(rir))),
  );
  done();
}

/** VO2 max entered directly, or from a 12-minute run test (Cooper: 35.97 × miles − 11.29). */
export async function logVo2(fd: FormData) {
  const miles = num(fd, "miles");
  const value = num(fd, "vo2") || (miles > 0 ? 35.97 * miles - 11.29 : 0);
  if (value < 10 || value > 90) return;
  await run("INSERT INTO vo2max (date, value) VALUES (?, ?) ON CONFLICT (date) DO UPDATE SET value = excluded.value", date(fd), Math.round(value * 10) / 10);
  done();
}

export async function deleteVo2(fd: FormData) {
  await run("DELETE FROM vo2max WHERE date = ?", date(fd));
  done();
}

// Metrics (lib/markers.ts): one value per day per kind.

const METRIC_RANGE: Record<string, [number, number]> = {
  sleep: [0, 16], water: [0, 400], balance: [0, 300], bp_sys: [70, 250], bp_dia: [40, 150],
  apob: [5, 300], ldl: [5, 400], lpa: [0, 600], a1c: [3, 15], glucose: [40, 400], tg: [10, 2000],
};

async function saveMetrics(day: string, values: [string, number][]) {
  const ok = values.filter(([k, v]) => METRIC_RANGE[k] && Number.isFinite(v) && v >= METRIC_RANGE[k][0] && v <= METRIC_RANGE[k][1]);
  if (!ok.length) return;
  const db = await getDb();
  await db.batch(ok.map(([k, v]) => db.prepare(
    "INSERT INTO metric (date, kind, value) VALUES (?, ?, ?) ON CONFLICT (date, kind) DO UPDATE SET value = excluded.value",
  ).bind(day, k, Math.round(v * 100) / 100)));
}

/** One tap on Today; tapping the chosen value again clears it. */
export async function logSleep(fd: FormData) {
  const hours = num(fd, "hours");
  const d = date(fd);
  const current = await first<{ value: number }>("SELECT value FROM metric WHERE date = ? AND kind = 'sleep'", d);
  if (current?.value === hours) await run("DELETE FROM metric WHERE date = ? AND kind = 'sleep'", d);
  else await saveMetrics(d, [["sleep", hours]]);
  done();
}

/** Adds `oz` (negative to undo) to the day's water; reaching zero clears it. */
export async function logWater(fd: FormData) {
  const d = date(fd);
  const current = await first<{ value: number }>("SELECT value FROM metric WHERE date = ? AND kind = 'water'", d);
  const total = Math.max(0, (current?.value ?? 0) + num(fd, "oz"));
  if (total === 0) await run("DELETE FROM metric WHERE date = ? AND kind = 'water'", d);
  else await saveMetrics(d, [["water", total]]);
  done();
}

/** Any lab fields filled in, plus blood pressure as "120/80". Blank fields are skipped. */
export async function logLabs(fd: FormData) {
  const values: [string, number][] = [];
  for (const k of ["apob", "ldl", "lpa", "a1c", "glucose", "tg"]) if (str(fd, k)) values.push([k, num(fd, k)]);
  const bp = str(fd, "bp").match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
  if (bp) values.push(["bp_sys", Number(bp[1])], ["bp_dia", Number(bp[2])]);
  await saveMetrics(date(fd), values);
  done();
}

export async function logBalance(fd: FormData) {
  await saveMetrics(date(fd), [["balance", num(fd, "seconds")]]);
  done();
}

/** `kind` may list several, e.g. "bp_sys,bp_dia". */
export async function deleteMetric(fd: FormData) {
  const kinds = str(fd, "kind").split(",").filter((k) => METRIC_RANGE[k]);
  if (!kinds.length) return;
  const db = await getDb();
  await db.batch(kinds.map((k) => db.prepare("DELETE FROM metric WHERE date = ? AND kind = ?").bind(date(fd), k)));
  done();
}

export async function deleteSet(fd: FormData) {
  await run("DELETE FROM set_log WHERE id = ?", num(fd, "id"));
  done();
}

/** Exercises are entered one per line, e.g. "Bench press 4x8". */
export async function saveWorkoutDay(fd: FormData) {
  const weekday = num(fd, "weekday");
  if (weekday < 0 || weekday > 6) return;
  const name = str(fd, "name");
  const lines = str(fd, "exercises").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const db = await getDb();
  const stmts = [
    db.prepare("DELETE FROM workout_day WHERE weekday = ?").bind(weekday),
    db.prepare("DELETE FROM workout_exercise WHERE weekday = ?").bind(weekday),
  ];
  if (name && lines.length) {
    stmts.push(db.prepare("INSERT INTO workout_day (weekday, name) VALUES (?, ?)").bind(weekday, name));
    lines.forEach((line, i) => {
      const m = line.match(/^(.*?)\s+(\d+)\s*[x×]\s*(\d+)$/i);
      const [exercise, sets, reps] = m ? [m[1], Number(m[2]), Number(m[3])] : [line, 3, 10];
      stmts.push(
        db.prepare("INSERT INTO workout_exercise (weekday, exercise, sets, reps, sort) VALUES (?, ?, ?, ?, ?)").bind(weekday, exercise, sets, reps, i),
      );
    });
  }
  await db.batch(stmts);
  done();
}

export async function addStrengthGoal(fd: FormData) {
  const exercise = str(fd, "exercise").slice(0, 100);
  const targetDate = str(fd, "target_date");
  const target = num(fd, "target_lb");
  if (!exercise || target <= 0 || !isDate(targetDate)) return;
  await run(
    "INSERT INTO strength_goal (exercise, target_lb, target_reps, target_date) VALUES (?, ?, ?, ?)",
    exercise, target, Math.max(1, Math.round(num(fd, "target_reps")) || 1), targetDate,
  );
  done();
}

export async function deleteStrengthGoal(fd: FormData) {
  await run("DELETE FROM strength_goal WHERE id = ?", num(fd, "id"));
  done();
}

/** Replace the whole weekly schedule with a reviewed program (JSON ProgramDay[] in "days"). */
export async function applyProgram(fd: FormData) {
  const days = JSON.parse(str(fd, "days") || "[]") as ProgramDay[];
  const db = await getDb();
  const stmts = [db.prepare("DELETE FROM workout_day"), db.prepare("DELETE FROM workout_exercise")];
  for (const d of days) {
    if (!(d.weekday >= 0 && d.weekday <= 6) || !d.exercises?.length) continue;
    stmts.push(db.prepare("INSERT OR REPLACE INTO workout_day (weekday, name) VALUES (?, ?)").bind(d.weekday, String(d.name).slice(0, 60)));
    d.exercises.forEach((e, i) =>
      stmts.push(
        db.prepare("INSERT INTO workout_exercise (weekday, exercise, sets, reps, sort) VALUES (?, ?, ?, ?, ?)")
          .bind(d.weekday, String(e.exercise).slice(0, 100), Math.round(Number(e.sets)) || 3, Math.round(Number(e.reps)) || 10, i),
      ),
    );
  }
  await db.batch(stmts);
  done();
}

// Profile

const oneOf = <T extends string>(v: string, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);

/** Profile column ← form field parsers. Only fields present in the submitted form are updated. */
const PROFILE_FIELDS: Record<string, (fd: FormData) => unknown> = {
  sex: (fd) => (str(fd, "sex") === "female" ? "female" : "male"),
  birth_year: (fd) => Math.round(num(fd, "birth_year")) || 1985,
  goal_weight_lb: (fd) => num(fd, "goal_weight_lb") || 180,
  goal_type: (fd) => oneOf(str(fd, "goal_type"), ["gain", "maintain", "lose"], "maintain"),
  activity: (fd) => oneOf(str(fd, "activity"), ["sedentary", "light", "moderate", "active", "very_active"], "moderate"),
  calorie_target: (fd) => optNum(fd, "calorie_target"),
  protein_g: (fd) => optNum(fd, "protein_g"),
  carbs_g: (fd) => optNum(fd, "carbs_g"),
  fat_g: (fd) => optNum(fd, "fat_g"),
  timezone: (fd) => str(fd, "timezone") || "America/Los_Angeles",
  avoid_foods: (fd) => str(fd, "avoid_foods").slice(0, 500),
  pantry: (fd) => str(fd, "pantry").slice(0, 1000),
  goal_date: (fd) => (isDate(str(fd, "goal_date")) ? str(fd, "goal_date") : null),
  equipment_notes: (fd) => str(fd, "equipment_notes").slice(0, 500),
  experience: (fd) => oneOf(str(fd, "experience"), ["beginner", "intermediate", "advanced"], "beginner"),
  shop_every: (fd) => Math.min(28, Math.max(1, Math.round(num(fd, "shop_every")) || 7)),
  shop_anchor: (fd) => (isDate(str(fd, "shop_anchor")) ? str(fd, "shop_anchor") : null),
};

/** Save whichever profile fields the (auto-saving) form sent; each Settings tab sends only its own. */
export async function saveProfile(fd: FormData) {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [col, parse] of Object.entries(PROFILE_FIELDS)) {
    if (!fd.has(col)) continue;
    sets.push(`${col} = ?`);
    values.push(parse(fd));
  }
  if (fd.has("height_ft")) {
    sets.push("height_in = ?");
    values.push(num(fd, "height_ft") * 12 + num(fd, "height_inches") || 70);
  }
  // Unchecked boxes aren't submitted, so the form flags that the equipment list is present.
  if (fd.has("equipment_present")) {
    sets.push("equipment = ?");
    values.push(fd.getAll("equipment").map(String).filter((k) => EQUIPMENT.some(([key]) => key === k)).join(","));
  }
  if (!sets.length) return;
  await run(`UPDATE profile SET ${sets.join(", ")}, profile_done = 1 WHERE id = 1`, ...values);
  if (fd.has("equipment_present")) await fitScheduleToEquipment(fd.getAll("equipment").map(String));
  done();
}

/** Swap saved exercises the equipment no longer allows (e.g. cable pushdowns without cables) for the next-best option. */
async function fitScheduleToEquipment(equipment: string[]) {
  const rows = await all<{ id: number; exercise: string }>("SELECT id, exercise FROM workout_exercise");
  const db = await getDb();
  const stmts = rows.flatMap((r) => {
    const next = substitute(r.exercise, equipment);
    return next ? [db.prepare("UPDATE workout_exercise SET exercise = ? WHERE id = ?").bind(next, r.id)] : [];
  });
  if (stmts.length) await db.batch(stmts);
}

/** Stop buying something: add it to pantry staples (kept off shopping lists). */
export async function addStaple(fd: FormData) {
  const item = str(fd, "item").toLowerCase().slice(0, 60);
  if (!item) return;
  const { pantry } = (await first<{ pantry: string }>("SELECT pantry FROM profile WHERE id = 1"))!;
  const list = pantry.split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.includes(item)) await run("UPDATE profile SET pantry = ? WHERE id = 1", [...list, item].join(","));
  done();
}

/** Drop typed-in targets so they follow your measured burn again. */
export async function autoTargets() {
  await run("UPDATE profile SET calorie_target = NULL, protein_g = NULL, carbs_g = NULL, fat_g = NULL WHERE id = 1");
  done();
}

// Meal planning

/** Plan the grocery trip containing the given date. */
export async function generateTripAction(fd: FormData) {
  await generateTrip(date(fd), await getToday());
  done();
}

export async function regenerateDay(fd: FormData) {
  await generatePlan(date(fd), 1);
  done();
}

export async function swap(fd: FormData) {
  await swapMeal(date(fd), slot(fd));
  done();
}

export async function toggleShopping(fd: FormData) {
  const week = date(fd);
  const key = str(fd, "item_key");
  const { meta } = await run("DELETE FROM shopping_check WHERE week_start = ? AND item_key = ?", week, key);
  if (meta.changes === 0) await run("INSERT INTO shopping_check (week_start, item_key) VALUES (?, ?)", week, key);
  done();
}

/**
 * Add an item to a trip's list (again = one more). With nutrition, the food is
 * also saved so it logs from Today in one tap with the same numbers.
 */
export async function addShoppingItem(fd: FormData) {
  const trip = date(fd);
  const name = str(fd, "name").slice(0, 200);
  if (!name) return;
  const aisle = AISLES.includes(str(fd, "aisle") as Aisle) ? str(fd, "aisle") : guessAisle(name);
  let foodId: number | null = null;
  const food = str(fd, "food");
  if (food) {
    const f = JSON.parse(food) as { name: string } & Macros;
    const opt = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
    const row = await first<{ id: number }>(
      `INSERT INTO saved_food (name, calories, protein, carbs, fat, fiber, sugar, sodium) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (name) DO UPDATE SET calories = excluded.calories, protein = excluded.protein, carbs = excluded.carbs, fat = excluded.fat,
         fiber = excluded.fiber, sugar = excluded.sugar, sodium = excluded.sodium
       RETURNING id`,
      String(f.name).slice(0, 200), Math.round(Number(f.calories) || 0), Number(f.protein) || 0, Number(f.carbs) || 0, Number(f.fat) || 0,
      opt(f.fiber), opt(f.sugar), opt(f.sodium),
    );
    foodId = row?.id ?? null;
  }
  await run(
    `INSERT INTO shopping_extra (trip_start, name, aisle, food_id) VALUES (?, ?, ?, ?)
     ON CONFLICT (trip_start, name) DO UPDATE SET qty = qty + 1, food_id = COALESCE(excluded.food_id, food_id)`,
    trip, name, aisle, foodId,
  );
  done();
}

export async function deleteShoppingItem(fd: FormData) {
  await run("DELETE FROM shopping_extra WHERE id = ?", num(fd, "id"));
  done();
}

// Recipes

export async function addRecipe(fd: FormData) {
  const name = str(fd, "name");
  if (!name) return;
  // Ingredient lines: "qty unit item @aisle", e.g. "6 oz Chicken breast @meat & seafood"
  const ingredients = str(fd, "ingredients")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [main, aisle = "pantry"] = line.split("@").map((s) => s.trim());
      const m = main.match(/^([\d.\/]+)\s+(\S+)\s+(.+)$/);
      if (!m) return { item: main, qty: 1, unit: "each", aisle };
      const qty = m[1].includes("/") ? Number(m[1].split("/")[0]) / Number(m[1].split("/")[1]) : Number(m[1]);
      return { item: m[3], qty: qty || 1, unit: m[2], aisle };
    });
  await run(
    "INSERT INTO recipe (name, meal_type, calories, protein, carbs, fat, ingredients, instructions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    name, slot(fd), Math.round(num(fd, "calories")), num(fd, "protein"), num(fd, "carbs"), num(fd, "fat"),
    JSON.stringify(ingredients), str(fd, "instructions"),
  );
  done();
}

export type SuggestState = { recipes?: SuggestedRecipe[]; error?: string };

export async function suggestRecipesAction(_prev: SuggestState, fd: FormData): Promise<SuggestState> {
  const mealType = str(fd, "meal_type");
  const today = await getToday();
  const { profile, targets } = await getTargets(today);
  const existing = await all<{ name: string }>("SELECT name FROM recipe");
  try {
    const recipes = await suggestRecipes({
      count: Math.min(8, Math.max(1, Math.round(num(fd, "count")) || 4)),
      mealType: SLOTS.includes(mealType as Slot) ? (mealType as Slot) : "any",
      request: str(fd, "request").slice(0, 500),
      existing: existing.map((r) => r.name),
      avoid: profile.avoid_foods,
      slotCalories: Object.fromEntries(SLOTS.map((s) => [s, Math.round(targets.calories * SLOT_SHARE[s])])) as Record<Slot, number>,
    });
    return { recipes };
  } catch (e) {
    if (e instanceof ClaudeNotConfigured) return { error: "Claude isn't set up yet: add an ANTHROPIC_API_KEY secret." };
    console.error("suggestRecipes failed", e);
    return { error: e instanceof Error ? e.message : "Something went wrong talking to Claude." };
  }
}

/** Nutrition lookup in USDA FoodData Central and Open Food Facts. No AI involved. */
export async function searchFoodsAction(query: string): Promise<{ hits: FoodHit[]; error?: string }> {
  const q = String(query ?? "").trim().slice(0, 100);
  if (!q) return { hits: [] };
  return searchFoods(q);
}

export async function foodPortionsAction(id: string): Promise<Portion[]> {
  const m = String(id).match(/^usda:(\d+)$/);
  if (!m) return [];
  try {
    return await foodPortions(Number(m[1]));
  } catch (e) {
    console.error("food portions failed", e);
    return [];
  }
}

/** Log servings of a saved recipe, e.g. a homemade shake. */
export async function logRecipe(fd: FormData) {
  const r = await first<Recipe>("SELECT * FROM recipe WHERE id = ?", num(fd, "recipe_id"));
  const k = Math.max(0.25, num(fd, "servings") || 1);
  if (!r) return;
  await run(
    "INSERT INTO food_log (date, slot, name, calories, protein, carbs, fat, recipe_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    date(fd), slot(fd), k === 1 ? r.name : `${r.name} (×${k})`, Math.round(r.calories * k), r.protein * k, r.carbs * k, r.fat * k, r.id,
  );
  done();
}

/**
 * Save reviewed recipes (JSON array of SuggestedRecipe in "recipes").
 * With daily=1, the (single) recipe is planned in its slot every day.
 */
export async function saveRecipes(fd: FormData) {
  const recipes = JSON.parse(str(fd, "recipes") || "[]") as SuggestedRecipe[];
  const daily = str(fd, "daily") === "1" && recipes.length === 1;
  const db = await getDb();
  const valid = recipes.filter((r) => r.name && SLOTS.includes(r.meal_type) && r.calories > 0);
  const rows = valid.map((r) =>
    db
      .prepare("INSERT INTO recipe (name, meal_type, calories, protein, carbs, fat, ingredients, instructions, daily) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(String(r.name).slice(0, 120), r.meal_type, Math.round(r.calories), Number(r.protein) || 0, Number(r.carbs) || 0, Number(r.fat) || 0, JSON.stringify(r.ingredients ?? []), String(r.instructions ?? ""), daily ? 1 : 0),
  );
  if (daily && valid.length) rows.unshift(db.prepare("UPDATE recipe SET daily = 0 WHERE meal_type = ?").bind(valid[0].meal_type));
  if (rows.length) await db.batch(rows);
  if (daily && valid.length) await refreshPlan(await getToday());
  done();
}

export async function toggleRecipe(fd: FormData) {
  await run("UPDATE recipe SET active = 1 - active WHERE id = ?", num(fd, "id"));
  done();
}

/** Make a recipe the every-day pick for its slot (one per slot), or put it back in the rotation. */
export async function toggleDaily(fd: FormData) {
  const r = await first<Recipe>("SELECT * FROM recipe WHERE id = ?", num(fd, "id"));
  if (!r) return;
  const db = await getDb();
  if (r.daily) {
    await db.prepare("UPDATE recipe SET daily = 0 WHERE id = ?").bind(r.id).run();
  } else {
    await db.batch([
      db.prepare("UPDATE recipe SET daily = 0 WHERE meal_type = ?").bind(r.meal_type),
      db.prepare("UPDATE recipe SET daily = 1, active = 1 WHERE id = ?").bind(r.id),
    ]);
  }
  await refreshPlan(await getToday());
  done();
}
