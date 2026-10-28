import { all, getDb } from "./db";
import { activeRecipes, dailyRecipes, getProfile, getTargets, tripFor } from "./data";
import { addDays, daysBetween } from "./dates";
import { groceriesOnHand, groceryMatcher } from "./groceries";
import { SLOTS, type Ingredient, type Recipe, type Slot } from "./types";

/** Share of the daily calorie target given to each meal slot. */
export const SLOT_SHARE: Record<Slot, number> = { breakfast: 0.25, lunch: 0.3, dinner: 0.33, snack: 0.12 };

/** A recipe can't reappear within this many days of itself. */
const NO_REPEAT_DAYS = 3;

/** How much a recipe made entirely from groceries you've bought outranks one sharing the list. */
const GROCERY_WEIGHT = 0.75;

/** Full plans tried per trip; the one needing the fewest distinct ingredients wins. */
const ATTEMPTS = 60;

/** Fresh meat, fish and produce bought on shopping day are flagged when used this many days later. */
export const FRESH_DAYS = 5;

export interface PlanRow {
  date: string;
  slot: Slot;
  recipe_id: number;
  servings: number;
}

/**
 * Calories for each slot. A daily recipe (e.g. a protein shake) takes its own
 * calories; the other slots split what's left in proportion to SLOT_SHARE.
 */
export function slotBudgets(targetCalories: number, daily: Partial<Record<Slot, Recipe>>): Record<Slot, number> {
  const fixed = SLOTS.reduce((t, s) => t + (daily[s]?.calories ?? 0), 0);
  const openShare = SLOTS.reduce((t, s) => t + (daily[s] ? 0 : SLOT_SHARE[s]), 0);
  const rest = Math.max(0, targetCalories - fixed);
  return Object.fromEntries(
    SLOTS.map((s) => [s, daily[s] ? daily[s]!.calories : openShare ? (rest * SLOT_SHARE[s]) / openShare : 0]),
  ) as Record<Slot, number>;
}

function servingsFor(recipe: Recipe, slotCalories: number) {
  const raw = Math.round((slotCalories / recipe.calories) * 2) / 2;
  return Math.min(3, Math.max(0.5, raw));
}

const keyCache = new WeakMap<Recipe, string[]>();
/** Normalized ingredient names, the unit of "how many things do I have to buy". */
function ingredientKeys(r: Recipe): string[] {
  let keys = keyCache.get(r);
  if (!keys) {
    keys = [...new Set((JSON.parse(r.ingredients) as Ingredient[]).map((i) => i.item.trim().toLowerCase()))];
    keyCache.set(r, keys);
  }
  return keys;
}

function usedRecently(plan: PlanRow[], recipeId: number, date: string) {
  return plan.some((p) => p.recipe_id === recipeId && p.date !== date && Math.abs(daysBetween(p.date, date)) <= NO_REPEAT_DAYS);
}

/** Share of a recipe's ingredients already bought (0 when nothing has been). */
async function groceryShare(date: string) {
  const have = groceryMatcher((await groceriesOnHand(date)).map((g) => g.name));
  return { have, share: (r: Recipe) => { const keys = ingredientKeys(r); return keys.length ? keys.filter(have).length / keys.length : 0; } };
}

/**
 * Pick a recipe for a slot, favoring ones that use groceries you've bought, then ones
 * whose ingredients are already on this trip's list. `jitter` adds randomness so
 * repeated attempts explore different plans.
 */
function choose(recipes: Recipe[], slot: Slot, date: string, plan: PlanRow[], basket: Set<string>, jitter: number, exclude?: number, keysOf = ingredientKeys, bought: (r: Recipe) => number = () => 0): Recipe | undefined {
  const candidates = recipes.filter((r) => r.meal_type === slot && r.id !== exclude);
  if (candidates.length === 0) return undefined;
  const fresh = candidates.filter((r) => !usedRecently(plan, r.id, date));
  const pool = fresh.length ? fresh : candidates;
  let best: Recipe | undefined;
  let bestScore = -Infinity;
  for (const r of pool) {
    const keys = keysOf(r);
    const overlap = keys.length ? keys.filter((k) => basket.has(k)).length / keys.length : 1;
    const score = overlap + GROCERY_WEIGHT * bought(r) + Math.random() * jitter;
    if (score > bestScore) [best, bestScore] = [r, score];
  }
  return best;
}

async function planBetween(start: string, end: string) {
  return all<PlanRow>("SELECT date, slot, recipe_id, servings FROM meal_plan WHERE date BETWEEN ? AND ?", start, end);
}

async function save(rows: PlanRow[]) {
  if (rows.length === 0) return;
  const db = await getDb();
  await db.batch(
    rows.map((r) =>
      db
        .prepare("INSERT OR REPLACE INTO meal_plan (date, slot, recipe_id, servings) VALUES (?, ?, ?, ?)")
        .bind(r.date, r.slot, r.recipe_id, r.servings),
    ),
  );
}

/**
 * (Re)plan `days` days from `start`. Everything else already planned in the same
 * grocery trip stays put and counts as already on the list, so the new days lean
 * on the same ingredients. Of ATTEMPTS randomized plans, keep the one with the
 * fewest distinct ingredients for the whole trip.
 */
export async function generatePlan(start: string, days: number) {
  const end = addDays(start, days - 1);
  const profile = await getProfile();
  const trip = tripFor(profile, start);
  const recipes = await activeRecipes(profile);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const daily = dailyRecipes(recipes);
  const rotating = recipes.filter((r) => !r.daily);
  // Staples and groceries on hand don't cost a shopping item, so they don't count against a plan.
  const staples = profile.pantry.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const { have, share } = await groceryShare(start);
  const toBuy = (r: Recipe) => ingredientKeys(r).filter((k) => !staples.some((s) => k.includes(s)) && !have(k));

  const context = (await planBetween(addDays(trip.start < start ? trip.start : start, -NO_REPEAT_DAYS), addDays(trip.end > end ? trip.end : end, NO_REPEAT_DAYS)))
    .filter((p) => p.date < start || p.date > end);
  const tripKeys = new Set(
    context.filter((p) => p.date >= trip.start && p.date <= trip.end).flatMap((p) => (byId.get(p.recipe_id) ? toBuy(byId.get(p.recipe_id)!) : [])),
  );
  for (const r of Object.values(daily)) toBuy(r!).forEach((k) => tripKeys.add(k));

  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  const budgets = new Map<string, Record<Slot, number>>();
  for (const date of dates) budgets.set(date, slotBudgets((await getTargets(date)).targets.calories, daily));

  let bestRows: PlanRow[] = [];
  let bestCost = Infinity;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const basket = new Set(tripKeys);
    const plan = [...context];
    const rows: PlanRow[] = [];
    // The first attempt is pure greedy; later ones explore with more randomness.
    const jitter = attempt === 0 ? 0.001 : 0.15 + (attempt / ATTEMPTS) * 0.5;
    for (const date of dates) {
      for (const slot of SLOTS) {
        const fixed = daily[slot];
        const r = fixed ?? choose(rotating, slot, date, plan, basket, jitter, undefined, toBuy, share);
        if (!r) continue;
        const row = { date, slot, recipe_id: r.id, servings: fixed ? 1 : servingsFor(r, budgets.get(date)![slot]) };
        plan.push(row);
        rows.push(row);
        toBuy(r).forEach((k) => basket.add(k));
      }
    }
    if (basket.size < bestCost) [bestRows, bestCost] = [rows, basket.size];
  }
  await save(bestRows);
}

/** Plan the whole grocery trip containing `date`, from today on if it's already under way. */
export async function generateTrip(date: string, today: string) {
  const trip = tripFor(await getProfile(), date);
  const from = today > trip.start && today <= trip.end ? today : trip.start;
  await generatePlan(from, daysBetween(from, trip.end) + 1);
}

/** Replace one slot with a different recipe, preferring ingredients already on this trip's list. */
export async function swapMeal(date: string, slot: Slot) {
  const { profile, targets } = await getTargets(date);
  const trip = tripFor(profile, date);
  const recipes = await activeRecipes(profile);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const daily = dailyRecipes(recipes);
  const plan = await planBetween(addDays(trip.start, -NO_REPEAT_DAYS), addDays(trip.end, NO_REPEAT_DAYS));
  const current = plan.find((p) => p.date === date && p.slot === slot);
  const basket = new Set(
    plan
      .filter((p) => p.date >= trip.start && p.date <= trip.end && p !== current)
      .flatMap((p) => (byId.get(p.recipe_id) ? ingredientKeys(byId.get(p.recipe_id)!) : [])),
  );
  // Swapping a daily recipe's slot picks a one-off replacement from the rotation.
  const { share } = await groceryShare(date);
  const r = choose(recipes.filter((x) => !x.daily), slot, date, plan, basket, 0.35, current?.recipe_id, ingredientKeys, share);
  if (!r) return;
  const { [slot]: _, ...others } = daily;
  await save([{ date, slot, recipe_id: r.id, servings: servingsFor(r, slotBudgets(targets.calories, others)[slot]) }]);
}

/**
 * After daily recipes change, update already-planned days from `from` on without
 * reshuffling them: daily slots get their recipe, a slot that stopped being daily
 * gets a rotating pick, and every other slot's servings are re-sized.
 */
export async function refreshPlan(from: string) {
  const { profile } = await getTargets(from);
  const recipes = await activeRecipes(profile);
  const daily = dailyRecipes(recipes);
  const rotating = recipes.filter((r) => !r.daily);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const existing = await all<PlanRow>("SELECT date, slot, recipe_id, servings FROM meal_plan WHERE date >= ? ORDER BY date", from);
  const plan = await planBetween(addDays(from, -NO_REPEAT_DAYS), addDays(existing.at(-1)?.date ?? from, NO_REPEAT_DAYS));
  const basket = new Set(existing.flatMap((p) => (byId.get(p.recipe_id) ? ingredientKeys(byId.get(p.recipe_id)!) : [])));
  const updated: PlanRow[] = [];
  for (const date of new Set(existing.map((p) => p.date))) {
    const { targets } = await getTargets(date);
    const budget = slotBudgets(targets.calories, daily);
    for (const row of existing.filter((p) => p.date === date)) {
      const fixed = daily[row.slot];
      let r = fixed ?? byId.get(row.recipe_id);
      if (!fixed && (!r || r.daily)) r = choose(rotating, row.slot, date, plan, basket, 0.05, row.recipe_id);
      if (!r) continue;
      const next = { date, slot: row.slot, recipe_id: r.id, servings: fixed ? 1 : servingsFor(r, budget[row.slot]) };
      const i = plan.findIndex((p) => p.date === date && p.slot === row.slot);
      if (i >= 0) plan[i] = next;
      updated.push(next);
    }
  }
  await save(updated);
}

export interface PlannedMeal extends PlanRow {
  recipe: Recipe;
}

export async function getPlan(start: string, days: number): Promise<PlannedMeal[]> {
  const rows = await all<PlanRow & Recipe>(
    `SELECT p.date, p.slot, p.recipe_id, p.servings, r.*
     FROM meal_plan p JOIN recipe r ON r.id = p.recipe_id
     WHERE p.date BETWEEN ? AND ?`,
    start,
    addDays(start, days - 1),
  );
  return rows.map((row) => ({
    date: row.date,
    slot: row.slot as Slot,
    recipe_id: row.recipe_id,
    servings: row.servings,
    recipe: { ...row, id: row.recipe_id },
  }));
}

export interface ShoppingItem {
  key: string;
  item: string;
  qty: number;
  unit: string;
  aisle: string;
  meals: string[];
  /** Day of the trip (0 = shopping day) it's first and last needed. */
  firstDay: number;
  lastDay: number;
  /** Fresh meat/fish or produce still needed FRESH_DAYS+ days after shopping. */
  spoils: boolean;
}

/** `others` adds the household's servings to each meal (lib/groceries.ts householdServings). */
export function shoppingList(meals: PlannedMeal[], tripStart: string, others: (m: PlannedMeal) => number = () => 0): ShoppingItem[] {
  const map = new Map<string, ShoppingItem>();
  for (const m of meals) {
    const day = daysBetween(tripStart, m.date);
    const servings = m.servings + others(m);
    for (const ing of JSON.parse(m.recipe.ingredients) as Ingredient[]) {
      const key = `${ing.item.toLowerCase()}|${ing.unit}`;
      const entry = map.get(key) ?? { key, item: ing.item, qty: 0, unit: ing.unit, aisle: ing.aisle, meals: [], firstDay: day, lastDay: day, spoils: false };
      entry.qty += ing.qty * servings;
      entry.firstDay = Math.min(entry.firstDay, day);
      entry.lastDay = Math.max(entry.lastDay, day);
      if (!entry.meals.includes(m.recipe.name)) entry.meals.push(m.recipe.name);
      map.set(key, entry);
    }
  }
  for (const e of map.values()) {
    e.spoils = (e.aisle === "produce" || e.aisle === "meat & seafood") && e.lastDay >= FRESH_DAYS && !/frozen|canned|dried/i.test(e.item);
  }
  return [...map.values()].sort((a, b) => a.aisle.localeCompare(b.aisle) || a.item.localeCompare(b.item));
}

/** Distinct ingredients a set of meals needs. */
export function ingredientCount(meals: PlannedMeal[]) {
  return new Set(meals.flatMap((m) => ingredientKeys(m.recipe))).size;
}
