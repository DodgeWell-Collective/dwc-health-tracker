import Anthropic from "@anthropic-ai/sdk";
import { env } from "cloudflare:workers";
import { SLOTS, type Aisle, type Ingredient, type Slot } from "./types";

export interface ParsedFood {
  name: string;
  slot: Slot;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface ParseResult {
  items: ParsedFood[];
  notes: string;
}

const SYSTEM = `You are a nutrition logger. The user describes what they ate in plain language. Break it into separate food items and estimate calories, protein, carbs and fat for the portion they actually ate.

Accuracy matters more than speed:
- Use USDA FoodData Central values for whole and generic foods.
- For branded, packaged or restaurant items (e.g. Chipotle, Starbucks, a specific protein bar), search the web for the official nutrition facts rather than guessing.
- Account for cooking fats, sauces, dressings and drinks when mentioned or strongly implied (e.g. "scrambled in butter").
- When a portion is vague, assume a typical serving and say what you assumed.
- Keep macros consistent with calories (protein×4 + carbs×4 + fat×9 should be close to the calorie total).

The user may refer to one of their saved recipes (e.g. "my shake", "the usual oats"). When they do, use that recipe's saved per-serving values scaled to how much they had, and don't re-estimate it.

Assign each item a meal slot (breakfast, lunch, dinner or snack). Use the slot the user names; otherwise infer it from the food and the local time given.

When you're done, call the record_foods tool exactly once with every item. Put any portion assumptions or uncertainty in "notes", briefly.`;

const RECORD_FOODS: Anthropic.Beta.BetaTool = {
  name: "record_foods",
  description: "Record the itemized foods with their nutrition estimates for the user to review.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["items", "notes"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "slot", "calories", "protein", "carbs", "fat"],
          properties: {
            name: { type: "string", description: "Food with portion, e.g. '2 large eggs, scrambled in 1 tsp butter'" },
            slot: { type: "string", enum: SLOTS },
            calories: { type: "number" },
            protein: { type: "number", description: "grams" },
            carbs: { type: "number", description: "grams" },
            fat: { type: "number", description: "grams" },
          },
        },
      },
      notes: { type: "string" },
    },
  },
};

export class ClaudeNotConfigured extends Error {}

/** Claude features are optional; without a key the app hides them. */
export function claudeEnabled() {
  return Boolean((env as unknown as { ANTHROPIC_API_KEY?: string }).ANTHROPIC_API_KEY);
}

/**
 * Run one request that should end with Claude calling `tool`, and return that call's input.
 * Web search runs server-side; a long search can return pause_turn, which we resume.
 */
async function callForTool(opts: { system: string; prompt: string; tool: Anthropic.Beta.BetaTool; webSearch: boolean; maxTokens?: number }) {
  const apiKey = (env as unknown as { ANTHROPIC_API_KEY?: string }).ANTHROPIC_API_KEY;
  if (!apiKey) throw new ClaudeNotConfigured("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });
  const tools: Anthropic.Beta.BetaToolUnion[] = opts.webSearch
    ? [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }, opts.tool]
    : [opts.tool];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.prompt }];

  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: opts.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: opts.system,
      tools,
      tool_choice: { type: "auto" },
      messages,
    });

    if (response.stop_reason === "refusal") throw new Error("Claude declined this request.");

    const call = response.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === opts.tool.name,
    );
    if (call) return call.input;

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ");
    throw new Error(text || `Claude stopped without an answer (${response.stop_reason}).`);
  }
  throw new Error("Claude took too long to finish.");
}

export async function parseFoods(description: string, localTime: string, saved: SavedRecipe[] = []): Promise<ParseResult> {
  const savedText = saved.length
    ? `My saved recipes (per serving):\n${saved.map((r) => `- ${r.name}: ${r.calories} kcal, ${r.protein}P/${r.carbs}C/${r.fat}F`).join("\n")}\n\n`
    : "";
  const input = await callForTool({
    system: SYSTEM,
    prompt: `${savedText}Local time: ${localTime}\n\nWhat I ate: ${description}`,
    tool: RECORD_FOODS,
    webSearch: true,
  });
  return normalize(input);
}

// Recipe suggestions

const AISLES: Aisle[] = ["produce", "meat & seafood", "dairy & eggs", "bakery", "pantry", "frozen"];

export interface SuggestedRecipe {
  name: string;
  meal_type: Slot;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: Ingredient[];
  instructions: string;
}

const RECORD_RECIPES: Anthropic.Beta.BetaTool = {
  name: "record_recipes",
  description: "Record the suggested recipes for the user to review.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["recipes"],
    properties: {
      recipes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "meal_type", "calories", "protein", "carbs", "fat", "ingredients", "instructions"],
          properties: {
            name: { type: "string" },
            meal_type: { type: "string", enum: SLOTS },
            calories: { type: "number", description: "per serving" },
            protein: { type: "number", description: "grams per serving" },
            carbs: { type: "number", description: "grams per serving" },
            fat: { type: "number", description: "grams per serving" },
            ingredients: {
              type: "array",
              description: "Quantities for ONE serving",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["item", "qty", "unit", "aisle"],
                properties: {
                  item: { type: "string", description: "Grocery-store name, e.g. 'Chicken breast'" },
                  qty: { type: "number" },
                  unit: { type: "string", description: "oz, cup, tbsp, tsp, each, slice, can, clove…" },
                  aisle: { type: "string", enum: AISLES },
                },
              },
            },
            instructions: { type: "string", description: "2–4 short sentences" },
          },
        },
      },
    },
  },
};

const RECIPE_SYSTEM = `You suggest recipes for a meal-planning app that scales portions to the user's calorie targets. Every recipe is one serving; the app multiplies servings to fit, so ingredient quantities and macros must be for exactly one serving.

- Macros must be accurate (USDA values) and consistent: protein×4 + carbs×4 + fat×9 ≈ calories.
- Favor high protein, whole foods, and realistic weeknight effort (under 40 minutes active time).
- Use common grocery items and reuse ingredients across suggestions where it makes sense, so the shopping list stays short.
- Name ingredients consistently ("Chicken breast", not "boneless skinless chicken breasts") so they combine on the shopping list.
- Never suggest anything containing a food the user avoids, and don't repeat recipes they already have.

Call the record_recipes tool once with all suggestions.`;

export async function suggestRecipes(opts: {
  count: number;
  mealType: Slot | "any";
  request: string;
  existing: string[];
  avoid: string;
  slotCalories: Record<Slot, number>;
}): Promise<SuggestedRecipe[]> {
  const prompt = [
    `Suggest ${opts.count} new ${opts.mealType === "any" ? "recipes across breakfast, lunch, dinner and snacks" : `${opts.mealType} recipes`}.`,
    opts.request && `What I'm in the mood for: ${opts.request}`,
    `My typical calories per meal: ${SLOTS.map((s) => `${s} ~${opts.slotCalories[s]}`).join(", ")}. Aim a single serving at roughly 60–90% of that.`,
    opts.avoid && `Foods I avoid: ${opts.avoid}`,
    `Recipes I already have: ${opts.existing.join("; ")}`,
  ].filter(Boolean).join("\n\n");

  const input = await callForTool({ system: RECIPE_SYSTEM, prompt, tool: RECORD_RECIPES, webSearch: false });
  return normalizeRecipes(input);
}

export interface SavedRecipe {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function normalizeRecipes(input: unknown): SuggestedRecipe[] {
  return ((input as { recipes?: unknown[] }).recipes ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    const ingredients = ((r.ingredients as unknown[]) ?? []).map((x) => {
      const i = x as Record<string, unknown>;
      return {
        item: String(i.item ?? "").slice(0, 100),
        qty: Math.max(0, Number(i.qty) || 0),
        unit: String(i.unit ?? "each").slice(0, 20),
        aisle: AISLES.includes(i.aisle as Aisle) ? (i.aisle as Aisle) : "pantry",
      };
    }).filter((i) => i.item);
    return {
      name: String(r.name ?? "Recipe").slice(0, 120),
      meal_type: SLOTS.includes(r.meal_type as Slot) ? (r.meal_type as Slot) : "dinner",
      calories: Math.round(Number(r.calories) || 0),
      protein: Math.round(Number(r.protein) || 0),
      carbs: Math.round(Number(r.carbs) || 0),
      fat: Math.round(Number(r.fat) || 0),
      ingredients,
      instructions: String(r.instructions ?? "").slice(0, 1000),
    };
  }).filter((r) => r.calories > 0);
}

function normalize(input: unknown): ParseResult {
  const data = input as { items?: unknown[]; notes?: unknown };
  const round1 = (n: unknown) => Math.max(0, Math.round(Number(n) * 10) / 10 || 0);
  const items = (data.items ?? []).map((raw) => {
    const i = raw as Record<string, unknown>;
    return {
      name: String(i.name ?? "Food").slice(0, 200),
      slot: SLOTS.includes(i.slot as Slot) ? (i.slot as Slot) : "snack",
      calories: Math.round(Number(i.calories) || 0),
      protein: round1(i.protein),
      carbs: round1(i.carbs),
      fat: round1(i.fat),
    };
  });
  return { items, notes: String(data.notes ?? "") };
}
