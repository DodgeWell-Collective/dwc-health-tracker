// Shared by the server lookup (lib/foods.ts) and the browser picker, so it can't
// import anything Worker-only.

import type { Aisle } from "./types";

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Optional extras when the database has them: grams, grams, milligrams. */
  fiber?: number | null;
  sugar?: number | null;
  sodium?: number | null;
}

export interface Portion {
  label: string;
  grams: number;
}

export interface FoodHit {
  /** "usda:<fdcId>" or "off:<barcode>" */
  id: string;
  name: string;
  brand: string | null;
  source: "USDA" | "Open Food Facts";
  /** Per 100 g (or 100 ml for drinks, which we treat as grams). */
  per100g: Macros;
  /** Household portions; USDA generic foods load theirs on demand. */
  portions: Portion[];
}

export const AISLES: Aisle[] = ["produce", "meat & seafood", "dairy & eggs", "bakery", "pantry", "frozen"];

const AISLE_WORDS: [Aisle, RegExp][] = [
  ["dairy & eggs", /\b(milk|yogurt|cheese|egg|butter|cream|kefir|cottage)\b/i],
  ["meat & seafood", /\b(chicken|beef|turkey|pork|salmon|tuna|shrimp|fish|steak|bacon)\b/i],
  ["frozen", /\bfrozen\b/i],
  ["bakery", /\b(bread|bagel|tortilla|bun|roll|pita)\b/i],
  ["produce", /\b(banana|apple|berr|spinach|kale|avocado|lettuce|tomato|onion|pepper|potato|carrot|broccoli|lemon|lime|mango|peach|orange|grape)/i],
];

export function guessAisle(name: string): Aisle {
  return AISLE_WORDS.find(([, re]) => re.test(name))?.[0] ?? "pantry";
}

export const round1 =(n: number) => Math.round(n * 10) / 10;

export function macrosFor(per100g: Macros, grams: number): Macros {
  const k = grams / 100;
  const opt = (v: number | null | undefined, r: (n: number) => number) => (v == null ? null : r(v * k));
  return {
    calories: Math.round(per100g.calories * k),
    protein: round1(per100g.protein * k),
    carbs: round1(per100g.carbs * k),
    fat: round1(per100g.fat * k),
    fiber: opt(per100g.fiber, round1),
    sugar: opt(per100g.sugar, round1),
    sodium: opt(per100g.sodium, Math.round),
  };
}

/** Weight units always available. Volume units assume ~1 g/ml, so they're offered for drinks. */
export const WEIGHT_UNITS: Portion[] = [
  { label: "g", grams: 1 },
  { label: "oz", grams: 28.3495 },
  { label: "lb", grams: 453.592 },
];

export const VOLUME_UNITS: Portion[] = [
  { label: "ml", grams: 1 },
  { label: "fl oz", grams: 29.5735 },
  { label: "cup (liquid)", grams: 236.588 },
];

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(
    (t, m) => ({ calories: t.calories + m.calories, protein: round1(t.protein + m.protein), carbs: round1(t.carbs + m.carbs), fat: round1(t.fat + m.fat) }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}
