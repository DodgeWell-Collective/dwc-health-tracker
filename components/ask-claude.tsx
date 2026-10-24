"use client";

import { useEffect, useState, useTransition } from "react";
import { describeFood, logFoods } from "../app/actions";
import type { ParsedFood } from "../lib/claude";
import type { Slot } from "../lib/types";
import { fieldCls } from "./food-picker";

/** AI fallback: estimate what was typed, let the user adjust numbers, then log to `slot`. */
export function ClaudeEstimate({ date, slot, text, onDone }: { date: string; slot: Slot; text: string; onDone: (msg?: string) => void }) {
  const [items, setItems] = useState<ParsedFood[] | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string>();
  const [busy, start] = useTransition();

  useEffect(() => {
    const fd = new FormData();
    fd.set("description", text);
    start(async () => {
      const res = await describeFood({}, fd);
      if (res.error) setError(res.error);
      setItems(res.result?.items ?? []);
      setNotes(res.result?.notes ?? "");
    });
  }, [text]);

  const update = (i: number, patch: Partial<ParsedFood>) => setItems((l) => l!.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const total = (items ?? []).reduce((t, i) => t + (Number(i.calories) || 0), 0);

  function save() {
    const fd = new FormData();
    fd.set("date", date);
    fd.set("items", JSON.stringify(items!.map((i) => ({ ...i, slot }))));
    start(async () => {
      await logFoods(fd);
      onDone(`Added ${items!.length} item${items!.length === 1 ? "" : "s"}`);
    });
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!items) return <p className="text-sm text-zinc-500">Claude is estimating…</p>;
  if (items.length === 0) return <p className="text-sm text-zinc-500">Claude couldn't estimate that.</p>;

  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
      <p className="text-xs text-amber-700 dark:text-amber-400">AI estimate. Check the numbers.</p>
      {items.map((it, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5 text-sm">
          <input value={it.name} onChange={(e) => update(i, { name: e.target.value })} className={`${fieldCls} min-w-0 flex-1 basis-full sm:basis-auto`} aria-label="Food" />
          {(["calories", "protein", "carbs", "fat"] as const).map((k) => (
            <label key={k} className="flex items-center gap-0.5 text-xs text-zinc-500">
              <input type="number" min="0" inputMode="decimal" value={it[k]} onChange={(e) => update(i, { [k]: Number(e.target.value) })} className={`${fieldCls} w-16`} aria-label={k} />
              {k === "calories" ? "kcal" : k[0].toUpperCase()}
            </label>
          ))}
          <button type="button" onClick={() => setItems((l) => l!.filter((_, j) => j !== i))} className="px-1 text-zinc-400 hover:text-red-600" aria-label="Remove">×</button>
        </div>
      ))}
      {notes && <p className="text-xs text-zinc-500">{notes}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={save} disabled={busy} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          Add · {Math.round(total)} kcal
        </button>
        <button type="button" onClick={() => onDone()} className="text-sm text-zinc-500 hover:underline">Cancel</button>
      </div>
    </div>
  );
}
