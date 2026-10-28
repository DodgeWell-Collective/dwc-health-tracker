import Link from "next/link";
import { getTargets, getToday, tripFor } from "../../lib/data";
import { addDays, formatDate, isDate } from "../../lib/dates";
import { getPlan, ingredientCount } from "../../lib/planner";
import { householdServings } from "../../lib/groceries";
import { SLOTS } from "../../lib/types";
import { Button, Card, fmt, Hidden, Info } from "../../components/ui";
import { generateTripAction, regenerateDay, swap } from "../actions";

export const dynamic = "force-dynamic";

const short = (d: string) => formatDate(d, { month: "short", day: "numeric" });

export default async function Plan({ searchParams }: { searchParams: Promise<{ trip?: string }> }) {
  const today = await getToday();
  const { trip: requested } = await searchParams;
  const { profile, targets } = await getTargets(today);
  const trip = tripFor(profile, isDate(requested) ? requested : today);
  const plan = await getPlan(trip.start, trip.days);
  const days = Array.from({ length: trip.days }, (_, i) => addDays(trip.start, i));
  const current = today >= trip.start && today <= trip.end;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/plan?trip=${addDays(trip.start, -trip.days)}`} className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Previous trip">←</Link>
          <div>
            <h1 className="text-xl font-semibold">{short(trip.start)} – {short(trip.end)}</h1>
            <p className="text-xs text-zinc-500">{trip.days}-day grocery trip{current && " · current"}</p>
          </div>
          <Link href={`/plan?trip=${addDays(trip.start, trip.days)}`} className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Next trip">→</Link>
        </div>
        <div className="flex gap-2">
          <Link href="/recipes" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">Recipes</Link>
          <Link href={`/shopping?trip=${trip.start}`} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">Shopping list</Link>
          <form action={generateTripAction}>
            <Hidden date={trip.start} />
            <Button>{plan.length ? (current && today > trip.start ? "Re-plan rest of trip" : "Re-plan trip") : "Plan this trip"}</Button>
          </form>
        </div>
      </div>

      <p className="text-sm text-zinc-500">
        {fmt(targets.calories)} kcal · {targets.protein}g protein a day
        {plan.length > 0 && <> · <span className="font-medium text-zinc-900 dark:text-zinc-100">{ingredientCount(plan)} ingredients</span></>}
        <Info>
          Each plan covers one shopping trip and picks the meal combination that needs the fewest ingredients. Meals don't repeat within 3 days, and portions are sized to your calories.
          {" "}<Link href="/settings?tab=food" className="underline">Change how often you shop</Link>.
        </Info>
      </p>

      {plan.length === 0 ? (
        <Card><p className="text-sm text-zinc-500">No meals planned for this trip yet.</p></Card>
      ) : (
        <div className="space-y-3">
          {days.map((d) => {
            const meals = plan.filter((p) => p.date === d);
            const total = meals.reduce(
              (t, m) => ({ cal: t.cal + m.recipe.calories * m.servings, protein: t.protein + m.recipe.protein * m.servings }),
              { cal: 0, protein: 0 },
            );
            return (
              <Card
                key={d}
                title={<>{formatDate(d)}{d === today && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">today</span>}</>}
                action={
                  <div className="flex items-center gap-3">
                    <span className="text-sm tabular-nums text-zinc-500">{fmt(total.cal)} kcal · {fmt(total.protein)}g P</span>
                    <form action={regenerateDay}>
                      <Hidden date={d} />
                      <Button variant="ghost" className="!px-2 !py-1 text-xs">Reshuffle day</Button>
                    </form>
                  </div>
                }
              >
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {SLOTS.map((slot) => {
                    const m = meals.find((x) => x.slot === slot);
                    return (
                      <div key={slot} className="flex flex-col justify-between rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{slot}</div>
                          {m ? (
                            <details>
                              <summary className="cursor-pointer text-sm font-medium">
                                {m.recipe.name}{m.servings !== 1 && <span className="font-normal text-zinc-500"> ×{m.servings}</span>}
                              </summary>
                              <p className="mt-1 text-xs text-zinc-500">{m.recipe.instructions}</p>
                            </details>
                          ) : (
                            <p className="text-sm text-zinc-500">—</p>
                          )}
                          {m && (
                            <p className="text-xs tabular-nums text-zinc-500">
                              {fmt(m.recipe.calories * m.servings)} kcal · {fmt(m.recipe.protein * m.servings)}P / {fmt(m.recipe.carbs * m.servings)}C / {fmt(m.recipe.fat * m.servings)}F
                            </p>
                          )}
                          {m && householdServings(profile, slot, !!m.recipe.daily) > 0 && (
                            <p className="text-xs text-zinc-500">Cook {m.servings + householdServings(profile, slot, !!m.recipe.daily)} servings ({m.servings} yours)</p>
                          )}
                        </div>
                        <form action={swap} className="mt-2">
                          <Hidden date={d} slot={slot} />
                          <button className="text-xs text-emerald-600 hover:underline">↻ Swap</button>
                        </form>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
