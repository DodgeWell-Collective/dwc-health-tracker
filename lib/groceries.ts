import { all } from "./db";
import { addDays } from "./dates";
import type { Profile, Slot } from "./types";

/** Groceries count as on hand for this many days after they're added. */
export const GROCERY_DAYS = 14;

export interface Grocery {
  id: number;
  name: string;
  added: string;
}

export function groceriesOnHand(date: string) {
  return all<Grocery>("SELECT id, name, added FROM grocery WHERE added > ? ORDER BY name", addDays(date, -GROCERY_DAYS));
}

// "Kirkland Boneless Skinless Chicken Breasts" has the recipe ingredient "chicken breast":
// every word of the ingredient appears in the product, plurals aside.
const words = (s: string) =>
  s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2).map((w) => w.replace(/(ies)$/, "y").replace(/(?<=[^s])s$/, ""));

/** Whether an ingredient is covered by something bought. */
export function groceryMatcher(names: string[]) {
  const products = names.map((n) => new Set(words(n)));
  const memo = new Map<string, boolean>();
  return (ingredient: string) => {
    let hit = memo.get(ingredient);
    if (hit === undefined) {
      const need = words(ingredient);
      hit = need.length > 0 && products.some((p) => need.every((w) => p.has(w)));
      memo.set(ingredient, hit);
    }
    return hit;
  };
}

/** Others' servings at a meal: the household eats the shared meals, not your daily recipes. */
export function householdServings(profile: Pick<Profile, "household" | "household_slots">, slot: Slot, daily: boolean) {
  if (daily || !profile.household) return 0;
  return profile.household_slots.split(",").includes(slot) ? profile.household : 0;
}
