import { apiKey } from "./secrets";

/**
 * Nutrition lookup from real databases. All macros are computed from these
 * per-100 g values and a gram amount; nothing here is estimated.
 *
 * - USDA FoodData Central: generic foods (Foundation, SR Legacy) and US branded labels.
 * - Open Food Facts: branded products by name or barcode (good for protein powders, bars).
 */

import { round1, type FoodHit, type Macros, type Portion } from "./food-math";

export type { FoodHit, Macros, Portion };

const UA = "dwc-health-tracker/1.0 (personal tracker; github.com/DodgeWell-Collective/dwc-health-tracker)";

async function usdaKey() {
  // DEMO_KEY works but is heavily rate-limited; a free key comes from api.data.gov/signup.
  return (await apiKey("usda_api_key")) || "DEMO_KEY";
}

/** Cache identical lookups at Cloudflare's edge for a day. */
async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, cf: { cacheTtl: 86_400, cacheEverything: true } } as RequestInit);
  if (!res.ok) throw new Error(`${new URL(url).hostname} returned ${res.status}`);
  return res.json() as Promise<T>;
}

// USDA

interface UsdaNutrient { nutrientNumber?: string; unitName?: string; value?: number }
interface UsdaFood {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
  brandName?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients: UsdaNutrient[];
}

function usdaMacros(nutrients: UsdaNutrient[]): Macros | null {
  const get = (...numbers: string[]) => {
    for (const n of numbers) {
      const hit = nutrients.find((x) => x.nutrientNumber === n && (n !== "208" || x.unitName === "KCAL"));
      if (hit?.value != null) return hit.value;
    }
    return null;
  };
  const protein = get("203") ?? 0;
  const fat = get("204") ?? 0;
  const carbs = get("205") ?? 0;
  // 208 = Energy (kcal); Foundation foods sometimes only have Atwater energy (957/958).
  const calories = get("208", "958", "957") ?? (protein || fat || carbs ? protein * 4 + carbs * 4 + fat * 9 : null);
  if (calories == null) return null;
  // 291 fiber, 269 total sugars (g), 307 sodium (mg)
  return { calories: round1(calories), protein: round1(protein), carbs: round1(carbs), fat: round1(fat), fiber: get("291"), sugar: get("269"), sodium: get("307") };
}

function titleCase(s: string) {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s;
}

async function searchUsda(query: string): Promise<FoodHit[]> {
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", await usdaKey());
  url.searchParams.set("query", query);
  url.searchParams.set("dataType", "Foundation,SR Legacy,Branded");
  url.searchParams.set("pageSize", "25");
  const data = await getJson<{ foods?: UsdaFood[] }>(url.toString());
  const hits: FoodHit[] = [];
  for (const f of data.foods ?? []) {
    const per100g = usdaMacros(f.foodNutrients ?? []);
    if (!per100g) continue;
    const branded = f.dataType === "Branded";
    const unit = (f.servingSizeUnit ?? "").toLowerCase();
    const portions: Portion[] =
      branded && f.servingSize && ["g", "grm", "ml", "mlt"].includes(unit)
        ? [{ label: `1 serving${f.householdServingFullText ? ` (${f.householdServingFullText.toLowerCase()})` : ""}`, grams: f.servingSize }]
        : [];
    hits.push({
      id: `usda:${f.fdcId}`,
      name: titleCase(f.description),
      brand: branded ? titleCase(f.brandName || f.brandOwner || "") || null : null,
      source: "USDA",
      per100g,
      portions,
    });
  }
  // Generic foods first; they're the reference values for whole foods.
  return [...hits.filter((h) => !h.brand), ...hits.filter((h) => h.brand)];
}

/** Household measures (e.g. "1 medium", "1 cup, sliced") with gram weights for a USDA food. */
export async function foodPortions(fdcId: number): Promise<Portion[]> {
  const f = await getJson<{
    foodPortions?: { amount?: number; modifier?: string; portionDescription?: string; gramWeight?: number; measureUnit?: { name?: string } }[];
  }>(`https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${await usdaKey()}`);
  return (f.foodPortions ?? [])
    .filter((p) => p.gramWeight && p.gramWeight > 0)
    .map((p) => {
      const unit = p.measureUnit?.name && p.measureUnit.name !== "undetermined" ? p.measureUnit.name : "";
      const desc = p.portionDescription && p.portionDescription !== "Quantity not specified" ? p.portionDescription : [unit, p.modifier].filter(Boolean).join(" ");
      return { label: `${p.amount && !/^\d/.test(desc) ? `${p.amount} ` : ""}${desc}`.trim(), grams: p.gramWeight! };
    })
    .filter((p, i, list) => p.label && list.findIndex((q) => q.label === p.label) === i);
}

// Open Food Facts

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string | string[];
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number>;
}

function offHit(p: OffProduct): FoodHit | null {
  const n = p.nutriments ?? {};
  const kcal = n["energy-kcal_100g"] ?? (n["energy_100g"] != null ? n["energy_100g"] / 4.184 : undefined);
  if (!p.code || !p.product_name || kcal == null) return null;
  const servingGrams = Number(p.serving_quantity);
  return {
    id: `off:${p.code}`,
    name: p.product_name,
    brand: (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(",")[0])?.trim() || null,
    source: "Open Food Facts",
    per100g: {
      calories: round1(kcal), protein: round1(n["proteins_100g"] ?? 0), carbs: round1(n["carbohydrates_100g"] ?? 0), fat: round1(n["fat_100g"] ?? 0),
      fiber: n["fiber_100g"] ?? null, sugar: n["sugars_100g"] ?? null, sodium: n["sodium_100g"] != null ? n["sodium_100g"] * 1000 : null,
    },
    portions: servingGrams > 0 ? [{ label: `1 serving${p.serving_size ? ` (${p.serving_size})` : ""}`, grams: servingGrams }] : [],
  };
}

const OFF_FIELDS = "code,product_name,brands,nutriments,serving_size,serving_quantity"; // nutriments includes fiber/sugars/sodium

async function searchOff(query: string): Promise<FoodHit[]> {
  if (/^\d{8,14}$/.test(query)) {
    const data = await getJson<{ product?: OffProduct }>(`https://world.openfoodfacts.org/api/v2/product/${query}.json?fields=${OFF_FIELDS}`);
    const hit = data.product && offHit({ ...data.product, code: data.product.code ?? query });
    return hit ? [hit] : [];
  }
  const url = new URL("https://search.openfoodfacts.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", "15");
  url.searchParams.set("fields", OFF_FIELDS);
  const data = await getJson<{ hits?: OffProduct[] }>(url.toString());
  return (data.hits ?? []).map(offHit).filter((h): h is FoodHit => h != null);
}

/** Search both databases. One failing doesn't hide results from the other. */
export async function searchFoods(query: string): Promise<{ hits: FoodHit[]; error?: string }> {
  const barcode = /^\d{8,14}$/.test(query);
  const [usda, off] = await Promise.allSettled([barcode ? Promise.resolve([]) : searchUsda(query), searchOff(query)]);
  const hits = [...(usda.status === "fulfilled" ? usda.value : []), ...(off.status === "fulfilled" ? off.value : [])];
  const failed = [usda, off].filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  for (const f of failed) console.error("food search failed", f.reason);
  // Only an error if every source failed; one source finding nothing is just "no matches".
  if (hits.length === 0 && failed.length === (barcode ? 1 : 2)) return { hits, error: "The nutrition databases didn't respond. Try again in a moment." };
  // Best match first: share of query words in the name/brand, a name that starts with
  // the first word ("Milk, reduced fat…" over "Pudding… with milk"), generic over branded, shorter names.
  const words = query.toLowerCase().split(/[^a-z0-9%]+/).filter((w) => w.length > 1);
  const score = (h: FoodHit) => {
    const text = `${h.name} ${h.brand ?? ""}`.toLowerCase();
    const share = words.length ? words.filter((w) => text.includes(w)).length / words.length : 0;
    return share + (words[0] && h.name.toLowerCase().startsWith(words[0]) ? 0.5 : 0);
  };
  const ranked = hits
    .map((h, i) => ({ h, i, s: score(h) }))
    .sort((a, b) => b.s - a.s || Number(!!a.h.brand) - Number(!!b.h.brand) || a.h.name.length - b.h.name.length || a.i - b.i)
    .map((x) => x.h);
  return { hits: ranked.slice(0, 30) };
}
