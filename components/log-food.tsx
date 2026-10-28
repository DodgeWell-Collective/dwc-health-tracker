"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { logFoods, logRecipe, repeatMeal, undoLog } from "../app/actions";
import { addDays, formatDate } from "../lib/dates";
import { SLOTS, type Slot } from "../lib/types";
import { ClaudeEstimate } from "./ask-claude";
import { fieldCls, FoodPicker, type PickedFood } from "./food-picker";
import { hitName, type FoodHit } from "../lib/food-math";

export interface QuickFood {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  sodium: number | null;
  /** Meal it's usually logged at; absent for foods only bought, not yet eaten. */
  slot?: Slot | null;
  /** Times logged recently; absent for foods only bought, not yet eaten. */
  uses?: number;
}

/** Your foods for this meal, usual-for-this-meal first, then most logged (the chips). */
function matchesFor(foods: QuickFood[], term: string, slot: Slot) {
  return foods
    .filter((f) => f.name.toLowerCase().includes(term))
    .sort((a, b) => Number(b.slot === slot) - Number(a.slot === slot) || (b.uses ?? 0) - (a.uses ?? 0))
    .slice(0, 6);
}

/** "Nut Bars (Kirkland), 2 serving (1 bar (40 g))" → "Nut Bars"; the full name shows on hover and in the log. */
const shortName = (name: string) => name.split(/,| \(/)[0].trim() || name;

const chip = "rounded-full border border-zinc-300 px-3 py-1 text-sm hover:border-emerald-500 hover:bg-emerald-50 dark:border-zinc-700 dark:hover:bg-emerald-950/40";
const row ="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50";

export interface QuickRecipe {
  id: number;
  name: string;
  calories: number;
  /** Times logged recently. */
  uses: number;
}

/** Eaten this many times (in the last 180 days) to count as one of your usual foods. */
const USUAL = 2;


/** What was eaten at a meal on its most recent earlier day. */
export interface PreviousMeal {
  slot: Slot;
  date: string;
  calories: number;
  /** Food names joined with " · ". */
  items: string;
}


/**
 * One box for all food logging: frequent foods and saved recipes log in one tap,
 * anything else comes from the nutrition databases (search or barcode), with
 * Claude and manual entry as fallbacks that reuse what was typed.
 */
export function LogFood({ date, defaultSlot, frequent, recipes, scanned, previous, claude }: { date: string; defaultSlot: Slot; frequent: QuickFood[]; recipes: QuickRecipe[]; scanned: FoodHit[]; previous: PreviousMeal[]; claude: boolean }) {
  const [slot, setSlot] = useState<Slot>(defaultSlot);
  const [, start] = useTransition();
  // The last thing added, with the rows to take back if it was a mis-tap.
  const [flash, setFlashState] = useState<{ msg: string; ids?: number[] }>();
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function setFlash(msg?: string, ids?: number[]) {
    clearTimeout(flashTimer.current);
    setFlashState(msg ? { msg, ids } : undefined);
    if (msg) flashTimer.current = setTimeout(() => setFlashState(undefined), 8000);
  }
  useEffect(() => () => clearTimeout(flashTimer.current), []);
  function undo() {
    const ids = flash?.ids;
    setFlash();
    if (ids?.length) start(async () => { await undoLog(ids); });
  }
  const [mode, setMode] = useState<{ kind: "claude" | "manual"; text: string } | null>(null);

  // "Use Claude" switch: describe a meal in words instead of searching the databases. Remembered per device.
  const [useClaude, setUseClaude] = useState(false);
  // What's typed, shared by the search box and the Claude box so switching keeps it.
  const [text, setText] = useState("");
  useEffect(() => { try { setUseClaude(claude && localStorage.getItem("logWithClaude") === "1"); } catch {} }, [claude]);
  function toggleClaude() {
    setUseClaude((on) => {
      try { localStorage.setItem("logWithClaude", on ? "0" : "1"); } catch {}
      return !on;
    });
    setMode(null);
  }

  const done = (msg?: string) => { setMode(null); if (msg) setFlash(msg); };

  function logItem(item: QuickFood | (PickedFood["macros"] & { name: string })) {
    const fd = new FormData();
    fd.set("date", date);
    fd.set("items", JSON.stringify([{ ...item, slot }]));
    start(async () => setFlash(`Added ${item.name}`, await logFoods(fd)));
  }

  function logSaved(r: QuickRecipe) {
    const fd = new FormData();
    fd.set("date", date);
    fd.set("slot", slot);
    fd.set("recipe_id", String(r.id));
    fd.set("servings", "1");
    start(async () => setFlash(`Added ${r.name}`, await logRecipe(fd)));
  }

  const last = previous.find((p) => p.slot === slot);
  // "yesterday", "Tue" within the week, else "Oct 14".
  const lastDay = last && (last.date === addDays(date, -1) ? "yesterday" : formatDate(last.date, last.date > addDays(date, -7) ? { weekday: "short" } : { month: "short", day: "numeric" }));
  function logRepeat(p: PreviousMeal) {
    const fd = new FormData();
    fd.set("date", date);
    fd.set("slot", p.slot);
    fd.set("from", p.date);
    start(async () => setFlash(`Added ${p.slot} from ${lastDay}`, await repeatMeal(fd)));
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1" role="radiogroup" aria-label="Meal">
        {SLOTS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={slot === s}
            onClick={() => setSlot(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${slot === s ? "bg-emerald-600 text-white" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
          >
            {s}
          </button>
        ))}
        {claude && <button
          type="button"
          onClick={toggleClaude}
          aria-pressed={useClaude}
          title="Describe meals in words; Claude estimates the nutrition"
          className={`ml-auto rounded-full px-3 py-1 text-xs font-medium ${useClaude ? "bg-violet-600 text-white" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
        >
          ✦ Claude
        </button>}
      </div>

      {mode?.kind === "claude" ? (
        <ClaudeEstimate date={date} slot={slot} text={mode.text} onDone={done} />
      ) : mode?.kind === "manual" ? (
        <ManualEntry name={mode.text} onLog={(item) => { logItem(item); setMode(null); }} onCancel={() => setMode(null)} />
      ) : useClaude ? (
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { setMode({ kind: "claude", text: text.trim() }); setText(""); } }} className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What did you eat? e.g. 2 eggs, toast with butter"
            enterKeyHint="send"
            className={`${fieldCls} min-w-0 flex-1`}
            aria-label="Describe what you ate"
          />
          <button disabled={!text.trim()} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">Estimate</button>
        </form>
      ) : (
        <FoodPicker
          placeholder="Search or scan"
          instantScan
          initialQuery={text}
          onQueryChange={setText}
          addLabel={`Add to ${slot}`}
          onAdd={(f) => logItem({ name: `${f.name}, ${f.amount} ${f.unit}`, ...f.macros })}
          quick={(q, clear, choose) => {
            const term = q.trim().toLowerCase();
            if (!term) {
              // One tap: repeat this meal's last day, or one of the foods you usually have at it (logged 2+ times).
              const staples = matchesFor(frequent, "", slot).filter((f) => f.slot === slot && (f.uses ?? 0) >= 2).slice(0, 6);
              return (staples.length > 0 || last) && (
                <div className="flex flex-wrap gap-1.5">
                  {last && (
                    <button type="button" onClick={() => logRepeat(last)} className={`${chip} border-emerald-300 dark:border-emerald-800`} title={last.items}>
                      ↻ Same as {lastDay} <span className="text-zinc-500">{last.calories}</span>
                    </button>
                  )}
                  {staples.map((f) => (
                    <button key={f.name} type="button" onClick={() => logItem(f)} className={chip} title={f.name}>
                      {shortName(f.name)} <span className="text-zinc-500">{f.calories}</span>
                    </button>
                  ))}
                </div>
              );
            }
            // Matches in three groups, each A–Z: what you eat most, what you've scanned, then the rest.
            // Foods and recipes log in one tap at the size you last had; a scanned product opens at its amount.
            type Match = { key: string; name: string; right: ReactNode; pick: () => void };
            const has = (name: string) => name.toLowerCase().includes(term);
            // Names starting with what's typed first, then A–Z.
            const starts = (m: { name: string }) => Number(!m.name.toLowerCase().startsWith(term));
            const byName = (a: { name: string }, b: { name: string }) => starts(a) - starts(b) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
            const food = (f: QuickFood): Match => ({ key: `f${f.name}`, name: f.name, right: f.calories, pick: () => { logItem(f); clear(); } });
            const recipe = (r: QuickRecipe): Match => ({ key: `r${r.id}`, name: r.name, right: r.calories, pick: () => { logSaved(r); clear(); } });
            const foods = frequent.filter((f) => has(f.name));
            const meals = recipes.filter((r) => has(r.name));
            const usual = [...foods.filter((f) => (f.uses ?? 0) >= USUAL).map(food), ...meals.filter((r) => r.uses >= USUAL).map(recipe)].sort(byName);
            // A scanned product you already log often shows once, as the one-tap food.
            const products = scanned
              .filter((h) => has(`${h.name} ${h.brand ?? ""}`) && !usual.some((u) => u.name.toLowerCase().startsWith(hitName(h).toLowerCase())))
              .map((h): Match => ({ key: h.id, name: hitName(h), right: <ScanIcon />, pick: () => choose(h) }))
              .sort(byName);
            const rest = [...foods.filter((f) => (f.uses ?? 0) < USUAL).map(food), ...meals.filter((r) => r.uses < USUAL).map(recipe)].sort(byName);
            const matches = [...usual, ...products, ...rest].slice(0, 10);
            if (!matches.length) return null;
            return (
              <ul className="max-h-80 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-emerald-200 dark:divide-zinc-800 dark:border-emerald-900" aria-label="Your foods">
                {matches.map((m) => (
                  <li key={m.key}><button type="button" onClick={m.pick} className={row}><span>{m.name}</span><span className="shrink-0 tabular-nums text-zinc-500">{m.right}</span></button></li>
                ))}
              </ul>
            );
          }}
          fallback={(q, clear) => q.trim() && (
            <div className="flex gap-3 text-sm">
              {claude && <button type="button" onClick={() => { setMode({ kind: "claude", text: q }); clear(); }} className="text-emerald-600 hover:underline">Estimate with Claude</button>}
              <button type="button" onClick={() => { setMode({ kind: "manual", text: q }); clear(); }} className="text-zinc-500 hover:underline">Enter manually</button>
            </div>
          )}
        />
      )}
      {flash && (
        <p className="flex gap-3 text-sm text-emerald-600" role="status">
          <span className="min-w-0 truncate">✓ {flash.msg}</span>
          {flash.ids?.length ? <button type="button" onClick={undo} className="shrink-0 text-zinc-500 underline">Undo</button> : null}
        </p>
      )}
    </div>
  );
}

function ManualEntry({ name, onLog, onCancel }: { name: string; onLog: (item: QuickFood) => void; onCancel: () => void }) {
  const [v, setV] = useState({ name, calories: "", protein: "", carbs: "", fat: "" });
  const n = (s: string) => Number(s) || 0;
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onLog({ name: v.name, calories: Math.round(n(v.calories)), protein: n(v.protein), carbs: n(v.carbs), fat: n(v.fat), fiber: null, sugar: null, sodium: null }); }}
      className="flex flex-wrap items-center gap-1.5"
    >
      <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required className={`${fieldCls} min-w-0 basis-full`} aria-label="Food" />
      {(["calories", "protein", "carbs", "fat"] as const).map((k) => (
        <input key={k} type="number" min="0" step="any" inputMode="decimal" required={k === "calories"} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder={k === "calories" ? "kcal" : `${k[0].toUpperCase()}${k.slice(1)} g`} className={`${fieldCls} w-20`} aria-label={k} />
      ))}
      <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Add</button>
      <button type="button" onClick={onCancel} className="text-sm text-zinc-500 hover:underline">Cancel</button>
    </form>
  );
}

function ScanIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-label="Scanned before">
      <path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M17 8v8" />
    </svg>
  );
}

/** Phones: a button that jumps down to the food box while it's off screen. */
export function JumpToLog() {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const target = document.getElementById("log");
    if (!target) return;
    const io = new IntersectionObserver(([e]) => setHidden(e.isIntersecting || e.boundingClientRect.top < 0));
    io.observe(target);
    return () => io.disconnect();
  }, []);
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={() => document.getElementById("log")?.scrollIntoView({ behavior: "smooth", block: "start" })}
      className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex items-center gap-1 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg md:hidden"
    >
      <span aria-hidden className="text-lg leading-none">+</span> Food
    </button>
  );
}
