"use client";

import { useState, useTransition } from "react";
import { saveRecipes } from "../app/actions";
import { AISLES, guessAisle, round1, sumMacros } from "../lib/food-math";
import { SLOTS, type Aisle, type Slot } from "../lib/types";
import { fieldCls, FoodPicker, type PickedFood } from "./food-picker";

interface Line extends PickedFood {
  aisle: Aisle;
  /** Name on the shopping list; matching an existing ingredient merges them. */
  listName: string;
}

/** A known ingredient whose words all appear in the database name, e.g. "Milk (2%)" for USDA's long milk entry. */
function suggestListName(name: string, known: string[]) {
  const lower = name.toLowerCase();
  const words = (s: string) => s.toLowerCase().split(/[^a-z0-9%]+/).filter((w) => w.length > 1);
  return known.filter((k) => words(k).every((w) => lower.includes(w))).sort((a, b) => words(b).length - words(a).length)[0] ?? name.split(" (")[0];
}

/** Build a recipe (e.g. a homemade protein shake) from database foods; totals are summed, not estimated. */
export function RecipeBuilder({ knownIngredients }: { knownIngredients: string[] }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [name, setName] = useState("");
  const [mealType, setMealType] = useState<Slot>("snack");
  const [yields, setYields] = useState(1);
  const [daily, setDaily] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState<string>();

  const servings = Math.max(1, yields || 1);
  const total = sumMacros(lines.map((l) => l.macros));
  const per = { calories: Math.round(total.calories / servings), protein: round1(total.protein / servings), carbs: round1(total.carbs / servings), fat: round1(total.fat / servings) };

  function save() {
    const fd = new FormData();
    fd.set(
      "recipes",
      JSON.stringify([
        {
          name: name.trim(),
          meal_type: mealType,
          ...per,
          // Shopping-list quantities are per serving.
          ingredients: lines.map((l) => ({ item: l.listName.trim() || l.name, qty: round1(l.amount / servings), unit: l.unit.replace(/^1 /, "").slice(0, 40), aisle: l.aisle })),
          instructions: instructions.trim(),
        },
      ]),
    );
    fd.set("daily", daily ? "1" : "0");
    startSaving(async () => {
      await saveRecipes(fd);
      setSaved(name.trim());
      setLines([]);
      setName("");
      setInstructions("");
      setDaily(false);
      setYields(1);
    });
  }

  return (
    <div className="space-y-3">
      <FoodPicker addLabel="Add ingredient" onAdd={(f) => { setSaved(undefined); setLines((l) => [...l, { ...f, aisle: guessAisle(f.name), listName: suggestListName(f.name, knownIngredients) }]); }} />
      <datalist id="known-ingredients">{knownIngredients.map((k) => <option key={k} value={k} />)}</datalist>

      {saved && <p className="text-sm text-emerald-600">✓ Saved {saved}.</p>}

      {lines.length > 0 && (
        <div className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {lines.map((l, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 flex-1">
                  {l.amount} {l.unit} {l.name}
                  <span className="block text-xs tabular-nums text-zinc-500">{Math.round(l.grams)} g · {l.macros.calories} kcal · {l.macros.protein}P / {l.macros.carbs}C / {l.macros.fat}F · {l.source}</span>
                  <label className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                    On the list as
                    <input
                      list="known-ingredients"
                      value={l.listName}
                      onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, listName: e.target.value } : x)))}
                      className={`${fieldCls} !py-0.5 text-xs`}
                      aria-label="Shopping list name"
                    />
                  </label>
                </span>
                <select value={l.aisle} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, aisle: e.target.value as Aisle } : x)))} className={`${fieldCls} !py-1 text-xs`} aria-label="Store aisle">
                  {AISLES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-zinc-400 hover:text-red-600" aria-label="Remove">×</button>
              </li>
            ))}
          </ul>

          <div className="text-sm tabular-nums">
            <span className="font-medium">{per.calories} kcal</span> · {per.protein}g protein · {per.carbs}g carbs · {per.fat}g fat per serving
            {servings > 1 && <span className="text-zinc-500"> ({total.calories} kcal total)</span>}
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipe name, e.g. “Morning protein shake”" className={fieldCls} aria-label="Recipe name" />
            <select value={mealType} onChange={(e) => setMealType(e.target.value as Slot)} className={fieldCls} aria-label="Meal">
              {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <label className="flex items-center gap-1 text-sm text-zinc-500">
              Makes <input type="number" min="1" step="1" value={yields} onChange={(e) => setYields(Number(e.target.value))} className={`${fieldCls} w-16`} /> serving{servings === 1 ? "" : "s"}
            </label>
          </div>
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} placeholder="Instructions (optional), e.g. “Blend until smooth.”" className={`${fieldCls} w-full`} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} />
            I have this every day. Plan it in {mealType} daily and size the other meals around it.
          </label>
          <button type="button" onClick={save} disabled={saving || !name.trim()} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save recipe"}
          </button>
        </div>
      )}
    </div>
  );
}
