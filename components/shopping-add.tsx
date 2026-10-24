"use client";

import { useState, useTransition } from "react";
import { addShoppingItem } from "../app/actions";
import { FoodPicker } from "./food-picker";

/**
 * Scan or search a product onto this trip's list. Its nutrition (for the amount
 * picked, usually one serving) is saved so it logs from Today in one tap.
 * Anything not in the databases (paper towels) goes on as plain text.
 */
export function ShoppingAdd({ trip }: { trip: string }) {
  const [, start] = useTransition();
  const [flash, setFlash] = useState<string>();

  function add(name: string, food?: object) {
    const fd = new FormData();
    fd.set("date", trip);
    fd.set("name", name);
    if (food) fd.set("food", JSON.stringify(food));
    start(async () => { await addShoppingItem(fd); setFlash(`Added ${name}`); });
  }

  return (
    <div className="space-y-2">
      <FoodPicker
        placeholder="Scan or search to add an item"
        addLabel="Add to list"
        onAdd={(f) => add(f.name, { name: `${f.name}, ${f.amount} ${f.unit}`, ...f.macros })}
        fallback={(q, clear) => q.trim() && !/^\d+$/.test(q.trim()) && (
          <button type="button" onClick={() => { add(q.trim()); clear(); }} className="text-sm text-emerald-600 hover:underline">
            Add “{q.trim()}” without nutrition
          </button>
        )}
      />
      {flash && <p className="text-sm text-emerald-600" role="status">✓ {flash}</p>}
    </div>
  );
}
