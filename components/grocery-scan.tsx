"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { addGroceryCode, addGroceryName } from "../app/actions";
import { BarcodeScan } from "./barcode-scan";
import { fieldCls } from "./food-picker";

/** Scan a grocery haul item after item (or type names); each one counts as on hand. */
export function GroceryScan() {
  const [status, setStatus] = useState<string>();
  const [name, setName] = useState("");
  const [, start] = useTransition();
  const count = useRef(0);

  // Stable, so the open camera isn't restarted by each update.
  const onCode = useCallback((code: string) => {
    setStatus("Looking up…");
    addGroceryCode(code).then(
      (res) => setStatus(res.name ? `✓ ${res.name} (${++count.current} this time)` : res.error),
      () => setStatus("Couldn't save that one. Try again."),
    );
  }, []);

  function addTyped(e: React.FormEvent) {
    e.preventDefault();
    const typed = name.trim();
    if (!typed) return;
    const fd = new FormData();
    fd.set("name", typed);
    setName("");
    start(async () => { await addGroceryName(fd); setStatus(`✓ ${typed}`); });
  }

  return (
    <div className="space-y-2">
      <form onSubmit={addTyped} className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Scan your groceries, or type one" enterKeyHint="done" className={`${fieldCls} min-w-0 flex-1`} aria-label="Grocery" />
        <BarcodeScan onCode={onCode} continuous status={status} />
        <button disabled={!name.trim()} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Add</button>
      </form>
      {status && <p className="text-sm text-emerald-600" role="status">{status}</p>}
    </div>
  );
}
