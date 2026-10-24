import { all, first } from "./db";
import { addDays, todayIn, tripStart } from "./dates";
import { parseMaxDumbbell, type Lifter } from "./loads";
import { formulaMaintenance, goalPace, MEASURE_DAYS, measuredMaintenance, targetsFor } from "./nutrition";
import type { Profile, Recipe, Slot } from "./types";

export async function getProfile(): Promise<Profile> {
  return (await first<Profile>("SELECT * FROM profile WHERE id = 1"))!;
}

export async function getToday(): Promise<string> {
  return todayIn((await getProfile()).timezone);
}

/** Most recent weigh-in on or before `date`, if any. */
export async function weightOn(date: string) {
  return first<{ date: string; weight_lb: number }>(
    "SELECT date, weight_lb FROM weigh_in WHERE date <= ? ORDER BY date DESC LIMIT 1",
    date,
  );
}

export async function getTargets(date: string) {
  const profile = await getProfile();
  // Measured from data up to today, even when planning future days.
  const today = todayIn(profile.timezone);
  const asOf = date < today ? date : today;
  const from = addDays(asOf, -MEASURE_DAYS);
  const [w, intake, weighIns] = await Promise.all([
    weightOn(date),
    all<{ date: string; calories: number }>(
      "SELECT date, SUM(calories) AS calories FROM food_log WHERE date >= ? AND date < ? GROUP BY date", from, asOf,
    ),
    all<{ date: string; weight_lb: number }>("SELECT date, weight_lb FROM weigh_in WHERE date >= ? AND date < ? ORDER BY date", from, asOf),
  ]);
  const weightLb = w?.weight_lb ?? profile.goal_weight_lb;
  const pace = goalPace(profile, w?.weight_lb ?? null, date);
  const formula = Math.round(formulaMaintenance(profile, weightLb) / 10) * 10;
  const measured = measuredMaintenance(intake, weighIns, asOf, formula);
  return { profile, weight: w, pace, formula, measured, targets: targetsFor(profile, weightLb, pace, measured) };
}

/** The grocery trip containing `date`: its first day and length. */
export function tripFor(profile: Profile, date: string) {
  const every = Math.min(28, Math.max(1, profile.shop_every || 7));
  const start = tripStart(date, profile.shop_anchor ?? "2026-01-05" /* a Monday */, every);
  return { start, days: every, end: addDays(start, every - 1) };
}

/** Inputs for starting weights. Without a weigh-in, goal weight stands in. */
export function lifterFor(profile: Profile, weightLb: number | null | undefined, today: string): Lifter {
  return {
    sex: profile.sex,
    age: Number(today.slice(0, 4)) - profile.birth_year,
    heightIn: profile.height_in,
    weightLb: weightLb ?? profile.goal_weight_lb,
    experience: profile.experience ?? "beginner",
    maxDumbbell: parseMaxDumbbell(profile.equipment_notes ?? ""),
  };
}

/** Recipes planned in their slot every day (at most one per slot). */
export function dailyRecipes(recipes: Recipe[]): Partial<Record<Slot, Recipe>> {
  const out: Partial<Record<Slot, Recipe>> = {};
  for (const r of recipes) if (r.daily && !out[r.meal_type]) out[r.meal_type] = r;
  return out;
}

export async function activeRecipes(profile: Profile): Promise<Recipe[]> {
  const avoid = profile.avoid_foods
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const recipes = await all<Recipe>("SELECT * FROM recipe WHERE active = 1 ORDER BY meal_type, name");
  return recipes.filter((r) => {
    const text = `${r.name} ${r.ingredients}`.toLowerCase();
    return !avoid.some((a) => text.includes(a));
  });
}
