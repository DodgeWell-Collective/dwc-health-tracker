"use client";

import { useCallback, useRef, useState, useTransition, type ReactNode } from "react";
import { foodPortionsAction, searchFoodsAction } from "../app/actions";
import { macrosFor, VOLUME_UNITS, WEIGHT_UNITS, type FoodHit, type Macros, type Portion } from "../lib/food-math";
import { BarcodeScan } from "./barcode-scan";

export const fieldCls = "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export interface PickedFood {
  /** Display name, e.g. "Bananas, raw" or "Gold Standard Whey (Optimum Nutrition)". */
  name: string;
  amount: number;
  unit: string;
  grams: number;
  macros: Macros;
  source: FoodHit["source"];
}

/** The amount last used for each database food, per device: "usda:123" → { amount, unit }. */
const PORTIONS_KEY = "lastPortions";
function lastPortion(id: string): { amount: number; unit: string } | undefined {
  try { return JSON.parse(localStorage.getItem(PORTIONS_KEY) || "{}")[id]; } catch { return undefined; }
}
function rememberPortion(id: string, amount: number, unit: string) {
  try {
    const all = JSON.parse(localStorage.getItem(PORTIONS_KEY) || "{}");
    delete all[id];
    // Newest last; keep the 300 most recent.
    const kept = Object.fromEntries([...Object.entries(all), [id, { amount, unit }]].slice(-300));
    localStorage.setItem(PORTIONS_KEY, JSON.stringify(kept));
  } catch {}
}

/**
 * Search USDA / Open Food Facts (or scan a barcode), pick a food and an amount;
 * macros come straight from the database values. `quick` renders instant matches
 * under the box as you type (and above any database results); `fallback` renders when the databases have nothing.
 * Each food starts at the amount you last picked for it; with `instantScan`, scanning a product
 * you've had before adds it straight away at that amount. `initialQuery` and `onQueryChange`
 * let the typed text outlive this box (switching to and from Claude keeps it).
 */
export function FoodPicker({ onAdd, addLabel = "Add", placeholder = "Search foods", quick, fallback, instantScan, initialQuery = "", onQueryChange }: {
  onAdd: (food: PickedFood) => void;
  instantScan?: boolean;
  initialQuery?: string;
  onQueryChange?: (query: string) => void;
  addLabel?: string;
  placeholder?: string;
  /** `choose` opens a food (e.g. one scanned before) at the amount step. */
  quick?: (query: string, clear: () => void, choose: (hit: FoodHit) => void) => ReactNode;
  fallback?: (query: string, clear: () => void) => ReactNode;
}) {
  const [query, setQueryState] = useState(initialQuery);
  const queryChanged = useRef(onQueryChange);
  queryChanged.current = onQueryChange;
  const setQuery = useCallback((q: string) => { setQueryState(q); queryChanged.current?.(q); }, []);
  const [hits, setHits] = useState<FoodHit[] | null>(null);
  const [error, setError] = useState<string>();
  const [searching, startSearch] = useTransition();
  const [picked, setPicked] = useState<FoodHit | null>(null);
  const [portions, setPortions] = useState<Portion[]>([]);
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState("g");

  // A scan's results arrive in a callback made on first render; this keeps it on the current meal.
  const onAddLatest = useRef(onAdd);
  onAddLatest.current = onAdd;

  const clear = useCallback(() => { setQuery(""); setHits(null); setPicked(null); setError(undefined); }, [setQuery]);

  function choose(hit: FoodHit) {
    setPicked(hit);
    setPortions(hit.portions);
    const first = hit.portions[0];
    const last = lastPortion(hit.id);
    const known = (list: Portion[]) => last && [...list, ...WEIGHT_UNITS, ...VOLUME_UNITS].some((u) => u.label === last.unit);
    if (known(hit.portions)) {
      setUnit(last!.unit);
      setAmount(last!.amount);
    } else {
      setUnit(first ? first.label : "g");
      setAmount(first ? 1 : 100);
    }
    if (hit.id.startsWith("usda:") && hit.portions.length === 0) {
      startSearch(async () => {
        const p = await foodPortionsAction(hit.id);
        if (p.length) {
          setPortions(p);
          if (known(hit.portions)) return;
          if (known(p)) {
            setUnit(last!.unit);
            setAmount(last!.amount);
            return;
          }
          // Default to an everyday portion ("1 cup"), not "1 quart".
          setUnit((p.find((x) => x.grams <= 300) ?? p[0]).label);
          setAmount(1);
        }
      });
    }
  }

  function search(q: string) {
    if (!q.trim()) return;
    startSearch(async () => {
      const res = await searchFoodsAction(q);
      setHits(res.hits);
      setError(res.error);
      setPicked(null);
      // A scanned barcode is one exact product: go straight to the amount,
      // or add it outright when you've had it before.
      if (/^\d{8,14}$/.test(q.trim()) && res.hits.length === 1) {
        const hit = res.hits[0];
        const last = lastPortion(hit.id);
        const units = [...hit.portions, ...WEIGHT_UNITS, ...VOLUME_UNITS];
        const per = units.find((u) => u.label === last?.unit)?.grams;
        if (instantScan && last && per) addFood(hit, last.amount, last.unit, last.amount * per);
        else choose(hit);
      }
    });
  }

  const onCode = useCallback((code: string) => { setQuery(code); search(code); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const units = [...portions, ...WEIGHT_UNITS, ...VOLUME_UNITS];
  const gramsPerUnit = units.find((u) => u.label === unit)?.grams ?? 1;
  const grams = Math.max(0, amount) * gramsPerUnit;
  const macros = picked ? macrosFor(picked.per100g, grams) : null;

  function addFood(hit: FoodHit, amount: number, unit: string, grams: number) {
    if (grams <= 0) return;
    rememberPortion(hit.id, amount, unit);
    onAddLatest.current({
      // Skip the brand when the name already says it ("Nutella (Nutella)").
      name: hit.brand && !hit.name.toLowerCase().includes(hit.brand.toLowerCase()) ? `${hit.name} (${hit.brand})` : hit.name,
      amount,
      // "1 serving (1 scoop)" reads as "2 serving (1 scoop)" once multiplied.
      unit: unit.replace(/^1 /, ""),
      grams: Math.round(grams * 10) / 10,
      macros: macrosFor(hit.per100g, grams),
      source: hit.source,
    });
    clear();
  }

  const add = () => picked && addFood(picked, amount, unit, grams);

  return (
    <div className="space-y-2">
      <form onSubmit={(e) => { e.preventDefault(); search(query); }} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setHits(null); setPicked(null); }}
          placeholder={placeholder}
          enterKeyHint="search"
          className={`${fieldCls} min-w-0 flex-1`}
          aria-label="Search foods"
        />
        <BarcodeScan onCode={onCode} />
        <button disabled={searching || !query.trim()} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {searching && !picked ? "…" : "Search"}
        </button>
      </form>

      {/* Your own matches stay on top, above database results. */}
      {!picked && quick?.(query, clear, choose)}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {picked && macros ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="text-sm font-medium">{picked.name}{picked.brand && <span className="font-normal text-zinc-500"> · {picked.brand}</span>}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={`${fieldCls} w-20`} aria-label="Amount" />
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className={`${fieldCls} min-w-0 max-w-[60%]`} aria-label="Unit">
              {portions.length > 0 && (
                <optgroup label="Portions">
                  {portions.map((p) => <option key={p.label} value={p.label}>{p.label} ({Math.round(p.grams)} g)</option>)}
                </optgroup>
              )}
              <optgroup label="Weight">{WEIGHT_UNITS.map((u) => <option key={u.label} value={u.label}>{u.label}</option>)}</optgroup>
              <optgroup label="Volume (drinks)">{VOLUME_UNITS.map((u) => <option key={u.label} value={u.label}>{u.label}</option>)}</optgroup>
            </select>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={add} disabled={grams <= 0} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {addLabel} · {macros.calories} kcal
            </button>
            <span className="text-xs tabular-nums text-zinc-500">{macros.protein}P · {macros.carbs}C · {macros.fat}F</span>
            <button type="button" onClick={() => setPicked(null)} className="ml-auto text-xs text-zinc-500 hover:underline">Back</button>
          </div>
        </div>
      ) : (
        hits && (
          <>
            {hits.length > 0 && (
              <ul className="max-h-72 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => choose(h)} className="w-full px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <div className="text-sm">{h.name}</div>
                      <div className="text-xs tabular-nums text-zinc-500">
                        {h.brand && `${h.brand} · `}{h.per100g.calories} kcal/100 g · {h.per100g.protein}g protein
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {hits.length === 0 && !error && <p className="text-sm text-zinc-500">No matches.</p>}
            {fallback?.(query, clear)}
          </>
        )
      )}
    </div>
  );
}
