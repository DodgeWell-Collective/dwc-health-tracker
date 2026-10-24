// Near-duplicate detection for logged foods, so the catalog and chips don't fill
// up with the same food under slightly different names (common with Claude
// estimates: "Meat sauce, ~1 cup (…)" vs "Meat sauce, 1 cup (…)").
//
// Two entries are the same food when BOTH hold:
//   1. Names: Jaccard overlap of their word sets ≥ NAME_THRESHOLD, after dropping
//      numbers, units and filler words (portion is judged by calories instead).
//   2. Calories within max(KCAL_ABS, KCAL_PCT × the larger), so "1 cup" and
//      "2 cups" of the same thing stay separate.
// When calories are nearly identical (within 5%), a name that only adds words to
// the other also counts, down to CLOSE_NAME_THRESHOLD ("Organic Raisin Bran
// Clusters Cereal" ≈ "Raisin Bran Clusters"). A swapped word (chocolate vs
// vanilla, turkey vs ham) never does.

export const NAME_THRESHOLD = 0.75;
export const CLOSE_NAME_THRESHOLD = 0.5;
export const KCAL_ABS = 15;
export const KCAL_PCT = 0.1;
const CLOSE_KCAL_PCT = 0.05;

const FILLER = new Set([
  "a", "an", "and", "of", "the", "with", "w", "in", "on", "plus", "total", "about", "approx",
  "cup", "cups", "oz", "fl", "g", "gram", "grams", "lb", "ml", "tbsp", "tsp", "tablespoon", "teaspoon",
  "serving", "servings", "piece", "pieces", "slice", "slices", "bar", "bars", "small", "medium", "large",
]);

export function nameTokens(name: string): Set<string> {
  return new Set(
    name.toLowerCase()
      .replace(/[^a-z\s]/g, " ") // drops digits, %, fractions, punctuation
      .split(/\s+/)
      .map((w) => w.replace(/(es|s)$/, (m, _, i, s) => (s.length > 3 ? "" : m))) // crude plural fold: "eggs" ≈ "egg"
      .filter((w) => w.length > 1 && !FILLER.has(w)),
  );
}

export function nameSimilarity(a: string, b: string): number {
  const x = nameTokens(a), y = nameTokens(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / (x.size + y.size - shared);
}

/** One name's words all appear in the other: it only adds detail, nothing swapped. */
function nestedNames(a: string, b: string) {
  const x = nameTokens(a), y = nameTokens(b);
  const [small, large] = x.size <= y.size ? [x, y] : [y, x];
  return [...small].every((w) => large.has(w));
}

export function sameFood(a: { name: string; calories: number }, b: { name: string; calories: number }): boolean {
  if (a.name.trim().toLowerCase() === b.name.trim().toLowerCase()) return true;
  const diff = Math.abs(a.calories - b.calories), big = Math.max(a.calories, b.calories);
  if (diff > Math.max(KCAL_ABS, KCAL_PCT * big)) return false;
  const sim = nameSimilarity(a.name, b.name);
  if (sim >= NAME_THRESHOLD) return true;
  const close = diff <= Math.max(5, CLOSE_KCAL_PCT * big);
  return close && sim >= CLOSE_NAME_THRESHOLD && nestedNames(a.name, b.name);
}

/**
 * Collapse near-duplicates, keeping the first of each group (pass the list
 * most-used first) and adding up `uses`.
 */
export function dedupeFoods<T extends { name: string; calories: number; uses?: number }>(foods: T[]): T[] {
  const kept: T[] = [];
  for (const f of foods) {
    const twin = kept.find((k) => sameFood(k, f));
    if (!twin) kept.push({ ...f });
    else if (f.uses != null) twin.uses = (twin.uses ?? 0) + f.uses;
  }
  return kept;
}
