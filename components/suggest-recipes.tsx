"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { saveRecipes, suggestRecipesAction, type SuggestState } from "../app/actions";
import type { SuggestedRecipe } from "../lib/claude";
import { SLOTS } from "../lib/types";

const fieldCls = "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function SuggestRecipes() {
  const [state, submit, thinking] = useActionState<SuggestState, FormData>(suggestRecipesAction, {});
  const [recipes, setRecipes] = useState<SuggestedRecipe[]>([]);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    setRecipes(state.recipes ?? []);
    setKeep((state.recipes ?? []).map(() => true));
    setSaved(0);
  }, [state]);

  const chosen = recipes.filter((_, i) => keep[i]);

  function save() {
    const fd = new FormData();
    fd.set("recipes", JSON.stringify(chosen));
    startSaving(async () => {
      await saveRecipes(fd);
      setSaved(chosen.length);
      setRecipes([]);
    });
  }

  return (
    <div className="space-y-3">
      <form action={submit} className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input name="request" placeholder="Optional: “more fish”, “quick 15-minute lunches”, “high-protein breakfasts without eggs”" className={fieldCls} />
        <select name="meal_type" defaultValue="any" className={fieldCls} aria-label="Meal type">
          <option value="any">Any meal</option>
          {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select name="count" defaultValue="4" className={fieldCls} aria-label="How many">
          {[2, 4, 6, 8].map((n) => <option key={n} value={n}>{n} recipes</option>)}
        </select>
        <button disabled={thinking} className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {thinking ? "Thinking…" : "Suggest"}
        </button>
      </form>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {saved > 0 && <p className="text-sm text-emerald-600">Added {saved} recipe{saved === 1 ? "" : "s"}. The planner will start using them.</p>}

      {recipes.length > 0 && (
        <div className="space-y-2">
          {recipes.map((r, i) => (
            <label key={i} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${keep[i] ? "border-emerald-300 dark:border-emerald-800" : "border-zinc-200 opacity-60 dark:border-zinc-800"}`}>
              <input type="checkbox" checked={keep[i] ?? false} onChange={(e) => setKeep((k) => k.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-1" />
              <div className="flex-1 text-sm">
                <div className="font-medium">
                  {r.name} <span className="text-xs font-normal capitalize text-zinc-500">· {r.meal_type}</span>
                </div>
                <div className="text-xs tabular-nums text-zinc-500">{r.calories} kcal · {r.protein}P / {r.carbs}C / {r.fat}F per serving</div>
                <div className="mt-1 text-xs text-zinc-500">{r.ingredients.map((x) => `${x.qty} ${x.unit} ${x.item}`).join(" · ")}</div>
                <div className="mt-1 text-xs">{r.instructions}</div>
              </div>
            </label>
          ))}
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving || chosen.length === 0} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving ? "Adding…" : `Add ${chosen.length} to my recipes`}
            </button>
            <button onClick={() => setRecipes([])} className="text-sm text-zinc-500 hover:underline">Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}
