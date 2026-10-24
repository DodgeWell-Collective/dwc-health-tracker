import Link from "next/link";
import { all } from "../../lib/db";
import { getProfile, getToday, tripFor } from "../../lib/data";
import { addDays, formatDate, isDate } from "../../lib/dates";
import { FRESH_DAYS, getPlan, shoppingList } from "../../lib/planner";
import { Card, Hidden, Info, Removable } from "../../components/ui";
import { ShoppingAdd } from "../../components/shopping-add";
import { addStaple, deleteShoppingItem, toggleShopping } from "../actions";

export const dynamic = "force-dynamic";

const short = (d: string) => formatDate(d, { month: "short", day: "numeric" });

function formatQty(qty: number, unit: string) {
  const rounded = unit === "each" || unit === "can" || unit === "slice" ? Math.ceil(qty) : Math.round(qty * 4) / 4;
  return `${rounded} ${unit === "each" ? "" : unit}`.trim();
}

export default async function Shopping({ searchParams }: { searchParams: Promise<{ trip?: string }> }) {
  const today = await getToday();
  const { trip: requested } = await searchParams;
  const profile = await getProfile();
  const trip = tripFor(profile, isDate(requested) ? requested : today);
  const [plan, checked, extras] = await Promise.all([
    getPlan(trip.start, trip.days),
    // Checked items are keyed by the trip's first day.
    all<{ item_key: string }>("SELECT item_key FROM shopping_check WHERE week_start = ?", trip.start),
    all<{ id: number; name: string; aisle: string; qty: number; calories: number | null }>(
      "SELECT e.id, e.name, e.aisle, e.qty, f.calories FROM shopping_extra e LEFT JOIN saved_food f ON f.id = e.food_id WHERE e.trip_start = ? ORDER BY e.id",
      trip.start,
    ),
  ]);
  const done = new Set(checked.map((c) => c.item_key));
  // Staples ("always on hand") stay off the list; matched as whole words, so "olive oil" covers "Extra virgin olive oil".
  const staples = profile.pantry.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const isStaple = (item: string) => staples.some((s) => new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(item));
  const all_ = shoppingList(plan, trip.start);
  const items = all_.filter((i) => !isStaple(i.item));
  const onHand = all_.filter((i) => isStaple(i.item));
  const aisles = [...new Set([...items.map((i) => i.aisle), ...extras.map((e) => e.aisle)])];
  const total = items.length + extras.length;
  const remaining = items.filter((i) => !done.has(i.key)).length + extras.filter((e) => !done.has(`x:${e.id}`)).length;
  const spoilers = items.filter((i) => i.spoils);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href={`/shopping?trip=${addDays(trip.start, -trip.days)}`} className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Previous trip">←</Link>
          <div>
            <h1 className="text-xl font-semibold">Shopping · {short(trip.start)}</h1>
            <p className="text-xs text-zinc-500">Covers {short(trip.start)} – {short(trip.end)} ({trip.days} days)</p>
          </div>
          <Link href={`/shopping?trip=${addDays(trip.start, trip.days)}`} className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Next trip">→</Link>
        </div>
        {total > 0 && <span className="text-sm text-zinc-500">{remaining} of {total} items left</span>}
      </div>

      <Card title={<>Add items<Info>Scan a barcode or search. Nutrition for the amount you pick (usually one serving) is saved, so the item shows up as a one-tap chip when you log food on Today.</Info></>}>
        <ShoppingAdd trip={trip.start} />
      </Card>

      {spoilers.length > 0 && (
        <p className="text-sm text-amber-600">
          ❄ {spoilers.length} fresh item{spoilers.length === 1 ? "" : "s"} used {FRESH_DAYS}+ days after shopping
          <Info>Freeze meat and fish in meal-size portions the day you buy them. For produce, buy frozen or pick it up mid-trip.</Info>
        </p>
      )}

      {total === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500">
            No meal plan for this trip. <Link href={`/plan?trip=${trip.start}`} className="text-emerald-600 underline">Plan it</Link> to build a list.
          </p>
        </Card>
      ) : (
        <div className="columns-1 gap-4 md:columns-2">
          {aisles.map((aisle) => (
            <Card key={aisle} title={<span className="capitalize">{aisle}</span>} className="mb-4 break-inside-avoid">
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {items.filter((i) => i.aisle === aisle).map((i) => {
                  const isDone = done.has(i.key);
                  return (
                    <li key={i.key} className="flex items-start">
                      <form action={toggleShopping} className="flex-1">
                        <Hidden date={trip.start} item_key={i.key} />
                        <button className="flex w-full items-start gap-3 py-2 text-left" title={i.meals.join(", ")}>
                          <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${isDone ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-400"}`}>
                            {isDone && "✓"}
                          </span>
                          <span className={`flex-1 text-sm ${isDone ? "text-zinc-400 line-through" : ""}`}>
                            {i.item}
                            {i.spoils && (
                              <span className="block text-xs text-amber-600">
                                ❄ until {formatDate(addDays(trip.start, i.lastDay), { weekday: "short" })}{i.aisle === "meat & seafood" ? ": freeze some" : ""}
                              </span>
                            )}
                          </span>
                          <span className="text-sm tabular-nums text-zinc-500">{formatQty(i.qty, i.unit)}</span>
                        </button>
                      </form>
                      <form action={addStaple}>
                        <Hidden item={i.item} />
                        <button className="px-2 py-2 text-sm text-zinc-300 hover:text-emerald-600 dark:text-zinc-600" title="Always have this (stop listing it)" aria-label={`Always have ${i.item}`}>⌂</button>
                      </form>
                    </li>
                  );
                })}
                {extras.filter((e) => e.aisle === aisle).map((e) => {
                  const isDone = done.has(`x:${e.id}`);
                  return (
                    <li key={`x${e.id}`} className="flex items-start">
                      <form action={toggleShopping} className="flex-1">
                        <Hidden date={trip.start} item_key={`x:${e.id}`} />
                        <button className="flex w-full items-start gap-3 py-2 text-left">
                          <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${isDone ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-400"}`}>
                            {isDone && "✓"}
                          </span>
                          <span className={`flex-1 text-sm ${isDone ? "text-zinc-400 line-through" : ""}`}>
                            {e.name}
                            {e.calories != null && <span className="text-xs text-zinc-500"> · {e.calories} kcal</span>}
                          </span>
                        </button>
                      </form>
                      <Removable action={deleteShoppingItem} fields={{ id: e.id }} className="py-2 text-sm tabular-nums text-zinc-500">
                        {e.qty > 1 ? `×${e.qty}` : ""}
                      </Removable>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
      {onHand.length > 0 && (
        <p className="text-xs text-zinc-500">
          On hand: {onHand.map((i) => i.item).join(", ")} · <Link href="/settings?tab=food" className="underline">edit</Link>
        </p>
      )}
    </div>
  );
}
