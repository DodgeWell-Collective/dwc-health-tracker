"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { logFoods, logRecipe, repeatMeal, undoLog } from "../app/actions";
import { addDays, formatDate } from "../lib/dates";
import { SLOTS, type Slot } from "../lib/types";
import { ClaudeEstimate } from "./ask-claude";
import { fieldCls, FoodPicker, rememberAmount, type PickedFood } from "./food-picker";
import { LOG_BACK_KEY } from "./nav";
import { hitName, type FoodHit, type Macros } from "../lib/food-math";

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


/** Step for the −/+ on a just-added food: halves near 1, ones, then tens. */
const stepFor = (amount: number) => (amount < 2 ? 0.5 : amount < 20 ? 1 : 10);
const r1 = (n: number) => Math.round(n * 10) / 10;
function scaled(f: PickedFood, amount: number): PickedFood {
  const k = amount / f.amount;
  const m = f.macros;
  const opt = (v?: number | null) => (v == null ? v : r1(v * k));
  const macros: Macros = { calories: Math.round(m.calories * k), protein: r1(m.protein * k), carbs: r1(m.carbs * k), fat: r1(m.fat * k), fiber: opt(m.fiber), sugar: opt(m.sugar), sodium: opt(m.sodium) };
  return { ...f, amount, grams: r1(f.grams * k), macros };
}

/**
 * One box for all food logging: frequent foods and saved recipes log in one tap,
 * anything else comes from the nutrition databases (search or barcode), with
 * Claude and manual entry as fallbacks that reuse what was typed. With `panel`, it
 * fills the screen with the camera already scanning on top (the tab bar's Log button).
 */
export function LogFood({ date, defaultSlot, frequent, recipes, scanned, previous, claude, panel }: { date: string; defaultSlot: Slot; frequent: QuickFood[]; recipes: QuickRecipe[]; scanned: FoodHit[]; previous: PreviousMeal[]; claude: boolean; panel?: boolean }) {
  const [slot, setSlot] = useState<Slot>(defaultSlot);
  const [, start] = useTransition();
  // Logging, undoing and re-sizing run one after another, so each sees the rows the last one left.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  function run(fn: () => Promise<unknown>) {
    const p = chain.current.then(fn, fn);
    chain.current = p.catch(() => {});
    start(async () => { await p; });
  }
  // The last thing added and the rows to take back if it was a mis-tap; a database food can be re-sized.
  const ids = useRef<number[]>([]);
  const [flash, setFlashState] = useState<{ msg: string; undo: boolean; food?: PickedFood & { slot: Slot } }>();
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function keepFlash() {
    clearTimeout(flashTimer.current);
    // The panel keeps it until the next thing; the box on Today clears it after a while.
    if (!panel) flashTimer.current = setTimeout(() => setFlashState(undefined), 8000);
  }
  function setFlash(msg?: string, food?: PickedFood & { slot: Slot }) {
    setFlashState(msg ? { msg, undo: ids.current.length > 0, food } : undefined);
    keepFlash();
  }
  function logged(msg: string, newIds: number[], food?: PickedFood & { slot: Slot }) {
    ids.current = newIds;
    setFlash(msg, food);
  }
  async function takeBack() {
    const was = ids.current;
    ids.current = [];
    if (was.length) await undoLog(was);
  }
  // A re-size waits for the taps to stop, then swaps the row; closing the panel sends it at once.
  const resize = useRef<() => void>(undefined);
  const resizeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function flushResize() {
    clearTimeout(resizeTimer.current);
    resize.current?.();
    resize.current = undefined;
  }
  useEffect(() => () => { clearTimeout(flashTimer.current); flushResize(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function undo() {
    clearTimeout(resizeTimer.current);
    resize.current = undefined;
    setFlash();
    run(takeBack);
  }
  function adjust(sign: 1 | -1) {
    const f = flash?.food;
    if (!f) return;
    const amount = r1(f.amount + sign * stepFor(f.amount));
    if (amount <= 0) return;
    const food = { ...scaled(f, amount), slot: f.slot };
    setFlashState({ ...flash, food });
    keepFlash();
    rememberAmount(f.id, amount);
    clearTimeout(resizeTimer.current);
    resize.current = () => run(async () => {
      await takeBack();
      ids.current = await logFoods(foodForm(food, food.slot));
    });
    resizeTimer.current = setTimeout(flushResize, 700);
  }
  const [mode, setMode] = useState<{ kind: "claude" | "manual"; text: string } | null>(null);

  // "Use Claude" switch: describe a meal in words instead of searching the databases. Remembered per
  // device; the panel always opens on the camera.
  const [useClaude, setUseClaude] = useState(false);
  // What's typed, shared by the search box and the Claude box so switching keeps it.
  const [text, setText] = useState("");
  useEffect(() => { try { setUseClaude(!panel && claude && localStorage.getItem("logWithClaude") === "1"); } catch {} }, [claude, panel]);
  const [camera, setCamera] = useState<HTMLDivElement | null>(null);
  // A scanned barcode passes through the search box; the camera stays on for that.
  const typing = text.trim() !== "" && !/^\d{8,14}$/.test(text.trim());
  function toggleClaude() {
    setUseClaude((on) => {
      try { localStorage.setItem("logWithClaude", on ? "0" : "1"); } catch {}
      return !on;
    });
    setMode(null);
  }

  const done = (msg?: string) => { setMode(null); if (msg) logged(msg, []); };

  function itemForm(item: QuickFood | (Macros & { name: string }), at: Slot) {
    const fd = new FormData();
    fd.set("date", date);
    fd.set("items", JSON.stringify([{ ...item, slot: at }]));
    return fd;
  }
  const foodForm = (f: PickedFood, at: Slot) => itemForm({ name: `${f.name}, ${f.amount} ${f.unit}`, ...f.macros }, at);

  function logItem(item: QuickFood | (Macros & { name: string })) {
    const fd = itemForm(item, slot);
    run(async () => logged(`Added ${item.name}`, await logFoods(fd)));
  }

  function logPicked(f: PickedFood) {
    const at = slot;
    flushResize();
    run(async () => logged(`Added ${f.name}`, await logFoods(foodForm(f, at)), { ...f, slot: at }));
  }

  function logSaved(r: QuickRecipe) {
    const fd = new FormData();
    fd.set("date", date);
    fd.set("slot", slot);
    fd.set("recipe_id", String(r.id));
    fd.set("servings", "1");
    run(async () => logged(`Added ${r.name}`, (await logRecipe(fd)) ?? []));
  }

  const last = previous.find((p) => p.slot === slot);
  // "yesterday", "Tue" within the week, else "Oct 14".
  const lastDay = last && (last.date === addDays(date, -1) ? "yesterday" : formatDate(last.date, last.date > addDays(date, -7) ? { weekday: "short" } : { month: "short", day: "numeric" }));
  function logRepeat(p: PreviousMeal) {
    const fd = new FormData();
    fd.set("date", date);
    fd.set("slot", p.slot);
    fd.set("from", p.date);
    run(async () => logged(`Added ${p.slot} from ${lastDay}`, await repeatMeal(fd)));
  }

  const chipCls = panel ? `${chip} py-2` : chip;
  const body = (
    <div className={panel ? "space-y-3" : "space-y-2"}>
      <div className="flex gap-1" role="radiogroup" aria-label="Meal">
        {SLOTS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={slot === s}
            onClick={() => setSlot(s)}
            className={`rounded-full font-medium capitalize ${panel ? "flex-1 py-2 text-sm" : "px-3 py-1 text-xs"} ${slot === s ? "bg-emerald-600 text-white" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
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
          camera={panel ? (typing ? null : camera) : undefined}
          cameraHint={`Point at a barcode · logs to ${slot}`}
          addLabel={`Add to ${slot}`}
          onAdd={logPicked}
          quick={(q, clear, choose) => {
            const term = q.trim().toLowerCase();
            if (!term) {
              // One tap: repeat this meal's last day, or one of the foods you usually have at it (logged 2+ times).
              const staples = matchesFor(frequent, "", slot).filter((f) => f.slot === slot && (f.uses ?? 0) >= 2).slice(0, 6);
              return (staples.length > 0 || last) && (
                <div className="flex flex-wrap gap-1.5">
                  {last && (
                    <button type="button" onClick={() => logRepeat(last)} className={`${chipCls} border-emerald-300 dark:border-emerald-800`} title={last.items}>
                      ↻ Same as {lastDay} <span className="text-zinc-500">{last.calories}</span>
                    </button>
                  )}
                  {staples.map((f) => (
                    <button key={f.name} type="button" onClick={() => logItem(f)} className={chipCls} title={f.name}>
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
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${panel ? "rounded-xl border border-emerald-200 bg-white p-3 dark:border-emerald-900 dark:bg-zinc-900" : ""}`} role="status">
          <span className="min-w-0 flex-1 truncate text-emerald-600">✓ {flash.food ? `${flash.food.name} · ${flash.food.slot}` : flash.msg}</span>
          {flash.undo && <button type="button" onClick={undo} className={`shrink-0 text-zinc-500 underline ${panel ? "px-2 py-1" : ""}`}>Undo</button>}
          {flash.food && (
            <span className="flex basis-full items-center gap-2 text-zinc-500">
              <button type="button" onClick={() => adjust(-1)} aria-label="Less" className={`${stepBtn} ${panel ? "h-10 w-10" : "h-8 w-8"}`}>−</button>
              <span className="tabular-nums text-zinc-900 dark:text-zinc-100">{flash.food.amount} {flash.food.unit}</span>
              <button type="button" onClick={() => adjust(1)} aria-label="More" className={`${stepBtn} ${panel ? "h-10 w-10" : "h-8 w-8"}`}>+</button>
              <span className="ml-auto tabular-nums">{flash.food.macros.calories} kcal · {flash.food.macros.protein}g protein</span>
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (!panel) return body;
  return <Panel camera={setCamera} typing={typing}>{body}</Panel>;
}

const stepBtn = "shrink-0 rounded-full border border-zinc-300 text-base leading-none text-zinc-700 dark:border-zinc-700 dark:text-zinc-200";

/** Full screen on phones (a sheet under the camera), a dialog on wider screens. Closing goes back to where Log was tapped. */
function Panel({ camera, typing, children }: { camera: (el: HTMLDivElement | null) => void; typing: boolean; children: ReactNode }) {
  const router = useRouter();
  function close() {
    let back = false;
    try { back = sessionStorage.getItem(LOG_BACK_KEY) === "1"; sessionStorage.removeItem(LOG_BACK_KEY); } catch {}
    if (back) return router.back();
    const u = new URL(location.href);
    u.searchParams.delete("log");
    router.replace(u.pathname + u.search, { scroll: false });
  }
  const closeLatest = useRef(close);
  closeLatest.current = close;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeLatest.current(); };
    addEventListener("keydown", onKey);
    // The page underneath stays put.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, []);
  return (
    <div role="dialog" aria-modal="true" aria-label="Log food" className="fixed inset-0 z-40 flex flex-col overscroll-contain bg-black md:items-center md:justify-center md:bg-black/60 md:p-6">
      <div className="flex min-h-0 w-full flex-1 flex-col md:max-h-[90vh] md:max-w-md md:flex-none md:overflow-hidden md:rounded-2xl">
        <div className={`relative shrink-0 overflow-hidden bg-zinc-900 transition-[height] ${typing ? "h-[calc(3.75rem+env(safe-area-inset-top))]" : "h-[42vh] md:h-80"}`}>
          <div ref={camera} className="absolute inset-0" />
          <button type="button" onClick={close} aria-label="Close" className="absolute top-[calc(0.5rem+env(safe-area-inset-top))] left-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="-mt-4 min-h-0 flex-1 overflow-y-auto rounded-t-2xl bg-zinc-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:mt-0 md:rounded-none dark:bg-zinc-950">
          {children}
          <button type="button" onClick={close} className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-base font-medium text-white hover:bg-emerald-700">Done</button>
        </div>
      </div>
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

