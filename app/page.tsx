import Link from "next/link";
import { all, first } from "../lib/db";
import { dailyRecipes, getTargets, getToday, lifterFor, tripFor } from "../lib/data";
import { addDays, formatDate, isDate, weekday } from "../lib/dates";
import { describeLoad, formatTarget, isCardio, nextSetHint, prescribeFrom, shortLoad, warmupSets } from "../lib/loads";
import { formTip } from "../lib/form-tips";
import { bmi, estimated1RM, waistToHeight, weightTrend } from "../lib/nutrition";
import { getPlan, slotBudgets } from "../lib/planner";
import { goalRisks } from "../lib/risk";
import { SLOTS, type FoodLog, type Recipe, type SetLog, type Slot, type WorkoutExercise } from "../lib/types";
import { Bar, Button, Card, fmt, Hidden, Info, Removable, Ring } from "../components/ui";
import { LogFood, type QuickFood } from "../components/log-food";
import { dedupeFoods } from "../lib/food-match";
import { RestTimer } from "../components/rest-timer";
import { PendingLink } from "../components/pending-link";
import { deleteFood, deleteSet, eatPlanned, logSet, logSleep, logWater, logWeight } from "./actions";
import { SLEEP_CHOICES, SLEEP_GOAL, WATER_STEPS, waterGoal } from "../lib/markers";
import { claudeEnabled } from "../lib/claude";

export const dynamic = "force-dynamic";

/** Days live at /day/<date>: vinext refetches any same-path ?query change, but reuses prefetched paths. */
const dayHref = (d: string, today: string) => (d === today ? "/" : `/day/${d}`);

/** Protein per main meal worth hitting for muscle (roughly 0.4 g/kg; 30 g is the common floor). */
const MEAL_PROTEIN = 30;

export default async function Today({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const today = await getToday();
  const { date: requested } = await searchParams;
  const date = isDate(requested) ? requested : today;

  const [{ profile, targets, weight }, food, plan, day, exercises, sets, weighIns, week, sleep, water] = await Promise.all([
    getTargets(date),
    all<FoodLog>("SELECT * FROM food_log WHERE date = ? ORDER BY id", date),
    getPlan(date, 1),
    first<{ name: string }>("SELECT name FROM workout_day WHERE weekday = ?", weekday(date)),
    all<WorkoutExercise>("SELECT * FROM workout_exercise WHERE weekday = ? ORDER BY sort", weekday(date)),
    all<SetLog & { created_at: string }>("SELECT * FROM set_log WHERE date = ? ORDER BY id", date),
    all<{ date: string; weight_lb: number; waist_in: number | null }>("SELECT date, weight_lb, waist_in FROM weigh_in WHERE date <= ? AND date >= ? ORDER BY date", date, addDays(date, -120)),
    // The whole week's schedule, for "next up" on rest days.
    all<{ weekday: number; name: string; exercise: string; sets: number; reps: number }>(
      "SELECT d.weekday, d.name, e.exercise, e.sets, e.reps FROM workout_day d JOIN workout_exercise e ON e.weekday = d.weekday ORDER BY e.sort",
    ),
    first<{ value: number }>("SELECT value FROM metric WHERE date = ? AND kind = 'sleep'", date),
    first<{ value: number }>("SELECT value FROM metric WHERE date = ? AND kind = 'water'", date),
  ]);
  const waterTarget = waterGoal(weight?.weight_lb ?? profile.goal_weight_lb);
  const nextUp = exercises.length === 0
    ? [1, 2, 3, 4, 5, 6, 7].map((n) => addDays(date, n)).find((d) => week.some((w) => w.weekday === weekday(d)))
    : undefined;
  const nextList = nextUp ? week.filter((w) => w.weekday === weekday(nextUp)) : [];

  const names = exercises.map((e) => e.exercise.toLowerCase());
  const trip = tripFor(profile, today);
  const [history, bests, recipes, logged, setup, risks, bought] = await Promise.all([
    // Recent earlier sessions per exercise → today's prescribed weight (lib/loads.ts).
    all<{ exercise: string; date: string; weight_lb: number; reps: number; rir: number | null }>(
      "SELECT exercise, date, weight_lb, reps, rir FROM set_log WHERE date < ? AND date >= ? ORDER BY date, id",
      date, addDays(date, -120),
    ),
    // All-time best estimated max per exercise, for PR badges.
    all<{ ex: string; best: number }>(
      `SELECT lower(exercise) AS ex, MAX(weight_lb * (1 + (reps + MIN(COALESCE(rir, 0), 5)) / 30.0)) AS best
       FROM set_log WHERE date < ? AND weight_lb > 0 GROUP BY lower(exercise)`,
      date,
    ),
    all<Recipe>("SELECT * FROM recipe WHERE active = 1 ORDER BY daily DESC, name"),
    all<QuickFood>(
      // Most-logged foods with the meal they're usually eaten at, so chips can follow the selected meal.
      `SELECT name, calories, protein, carbs, fat, fiber, sugar, sodium, COUNT(*) AS uses,
              (SELECT f2.slot FROM food_log f2 WHERE f2.name = food_log.name GROUP BY f2.slot ORDER BY COUNT(*) DESC LIMIT 1) AS slot
       FROM food_log WHERE date >= ? AND recipe_id IS NULL GROUP BY name ORDER BY COUNT(*) DESC, MAX(id) DESC LIMIT 200`,
      addDays(today, -180),
    ),
    first<{ weighed: number; program: number; meals: number }>(
      `SELECT (SELECT COUNT(*) FROM weigh_in) AS weighed, (SELECT COUNT(*) FROM workout_day) AS program,
              (SELECT COUNT(*) FROM meal_plan WHERE date BETWEEN ? AND ?) AS meals`,
      trip.start, trip.end,
    ),
    date === today ? goalRisks(today) : Promise.resolve([]),
    // Foods scanned onto recent shopping lists, with their saved nutrition.
    all<QuickFood>(
      `SELECT f.name, f.calories, f.protein, f.carbs, f.fat, f.fiber, f.sugar, f.sodium FROM shopping_extra e
       JOIN saved_food f ON f.id = e.food_id WHERE e.trip_start >= ? GROUP BY f.id ORDER BY MAX(e.id) DESC LIMIT 8`,
      addDays(trip.start, -trip.days),
    ),
  ]);
  // Bought items first, then what you log most; no duplicates.
  // Most-used first so near-duplicates (lib/food-match.ts) collapse into the name you use most.
  const frequent = dedupeFoods([...logged, ...bought]);

  const budgets = slotBudgets(targets.calories, dailyRecipes(recipes));
  const hour = Number(new Date().toLocaleString("en-US", { timeZone: profile.timezone, hour: "numeric", hourCycle: "h23" }));
  const defaultSlot: Slot = date !== today ? "snack" : hour < 11 ? "breakfast" : hour < 16 ? "lunch" : hour < 21 ? "dinner" : "snack";

  const lifter = lifterFor(profile, weight?.weight_lb, today);
  const bestBefore = new Map(bests.map((b) => [b.ex, b.best]));
  const progression = new Map(exercises.map((e) => [e.exercise, prescribeFrom(history, e, date, lifter)]));

  const eaten = food.reduce(
    (t, f) => ({ calories: t.calories + f.calories, protein: t.protein + f.protein, carbs: t.carbs + f.carbs, fat: t.fat + f.fat, fiber: t.fiber + (f.fiber ?? 0), sodium: t.sodium + (f.sodium ?? 0) }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 },
  );
  const tracksFiber = food.some((f) => f.fiber != null);
  const caloriesLeft = targets.calories - eaten.calories;

  const setsDone = exercises.reduce((t, e) => t + Math.min(e.sets, sets.filter((s) => s.exercise === e.exercise).length), 0);
  const setsTotal = exercises.reduce((t, e) => t + e.sets, 0);
  const activeIdx = exercises.findIndex((e) => sets.filter((s) => s.exercise === e.exercise).length < e.sets);
  const lastSet = sets.at(-1);
  const lastIndex = lastSet ? names.indexOf(lastSet.exercise.toLowerCase()) : -1;

  const trend = weightTrend(weighIns).at(-1)?.value;
  const weighIn = weighIns.find((w) => w.date === date);
  const lastWaist = [...weighIns].reverse().find((w) => w.waist_in)?.waist_in ?? null;
  const toGoal = trend != null ? profile.goal_weight_lb - trend : null;

  const steps = [
    { done: !!profile.profile_done, label: "Profile", href: "/settings" },
    { done: !!setup?.weighed, label: "Weigh in", href: "#body" },
    { done: !!setup?.program, label: "Program", href: "/train" },
    { done: !!setup?.meals, label: "Meal plan", href: "/plan" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PendingLink href={dayHref(addDays(date, -1), today)} className="rounded-md px-3 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Previous day">←</PendingLink>
        <div className="text-center">
          <h1 className="text-xl font-semibold">{date === today ? "Today" : formatDate(date)}</h1>
          {date === today ? <p className="text-sm text-zinc-500">{formatDate(date)}</p> : <PendingLink href="/" className="text-sm text-emerald-600">Back to today</PendingLink>}
        </div>
        <PendingLink href={dayHref(addDays(date, 1), today)} className="rounded-md px-3 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Next day">→</PendingLink>
      </div>

      {steps.some((s) => !s.done) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
          <span className="font-medium">Get set up</span>
          {steps.map((s, i) =>
            s.done ? (
              <span key={s.label} className="text-zinc-400 line-through">{s.label}</span>
            ) : (
              <Link key={s.label} href={s.href} className="rounded-full bg-emerald-600 px-3 py-0.5 text-white hover:bg-emerald-700">{i + 1}. {s.label}</Link>
            ),
          )}
        </div>
      )}

      {risks.map((r) => (
        <p key={r.text} className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          ⚠ <Link href="/progress" className="hover:underline">{r.text}</Link>
          <Info>{r.why}</Info>
        </p>
      ))}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="What's left">
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <Ring value={eaten.calories} max={targets.calories}>
              <span className="text-2xl font-bold tabular-nums">{fmt(Math.abs(caloriesLeft))}</span>
              <span className="text-xs text-zinc-500">{caloriesLeft >= 0 ? "kcal left" : "kcal over"}</span>
            </Ring>
            <div className="w-full flex-1 space-y-3">
              <Bar label="Protein" value={eaten.protein} max={targets.protein} />
              <Bar label="Carbs" value={eaten.carbs} max={targets.carbs} />
              <Bar label="Fat" value={eaten.fat} max={targets.fat} />
              {tracksFiber && <Bar label="Fiber" value={eaten.fiber} max={Math.round((targets.calories / 1000) * 14)} />}
              {eaten.sodium > 2300 && <p className="text-xs text-amber-600">Sodium {fmt(eaten.sodium)} mg, over the 2,300 mg daily limit</p>}
            </div>
          </div>
        </Card>

        <Card
          title={<>{day ? day.name : "Workout"}<Info>Weights start from your profile and adjust from what you log. After a set, tap <b>✓</b> if you had about 2 reps left, <b>Easy</b> if 4 or more, <b>Barely</b> if you just made it. A rest timer starts after each set.</Info></>}
          action={setsTotal > 0 && (
            <span className="flex items-center gap-2 text-sm tabular-nums text-zinc-500">
              {date === today && lastSet && setsDone < setsTotal && !isCardio(lastSet.exercise) && (
                <RestTimer since={Date.parse(`${lastSet.created_at.replace(" ", "T")}Z`)} seconds={lastIndex >= 0 && lastIndex < 3 ? 150 : 90} />
              )}
              {setsDone}/{setsTotal}
            </span>
          )}
        >
          {exercises.length === 0 ? (
            <div className="text-sm">
              <p className="text-zinc-500">Rest day.{!setup?.program && <> <Link href="/train" className="text-emerald-600 underline">Build a program</Link></>}</p>
              {nextUp && (
                <div className="mt-2">
                  <p className="font-medium">
                    Next: {formatDate(nextUp, { weekday: "long" })} · {nextList[0].name}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-zinc-600 dark:text-zinc-400">
                    {nextList.map((e) => {
                      const tip = formTip(e.exercise);
                      const load = shortLoad(prescribeFrom(history, e, nextUp, lifter), e.exercise);
                      return (
                        <li key={e.exercise} className="flex justify-between gap-2">
                          <span>{e.exercise}{tip && <Info label={`How to do ${e.exercise}`}>{tip}</Info>}</span>
                          <span className="shrink-0 tabular-nums text-zinc-500">{load && <span className="font-medium text-zinc-700 dark:text-zinc-300">{load} · </span>}{formatTarget(e.exercise, e.sets, e.reps)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {exercises.map((e, idx) => {
                const done = sets.filter((s) => s.exercise === e.exercise);
                const next = progression.get(e.exercise)!;
                const complete = done.length >= e.sets;
                const hint = nextSetHint(done.at(-1), next.reps, next.implement, lifter.maxDumbbell);
                const weightNow = hint?.weight ?? done.at(-1)?.weight_lb ?? next.weight ?? 0;
                const warmups = idx === 0 && done.length === 0 ? warmupSets(next.weight, next.implement) : [];
                // PRs only count against earlier sessions; a first-ever session sets the baseline.
                const hadHistory = bestBefore.has(e.exercise.toLowerCase());
                let best = bestBefore.get(e.exercise.toLowerCase()) ?? 0;
                const cardio = isCardio(e.exercise);
                const timed = /\(seconds\)/i.test(e.exercise);
                const load = next.weight != null ? `${describeLoad(weightNow, next.implement, e.exercise)} × ${next.reps}${timed ? " s" : ""}` : cardio ? `${next.reps} min` : `${next.reps} ${timed ? "s" : "reps"}`;
                const body = (
                  <>
                    {!complete && (
                      <p className="text-sm">
                        <span className="font-semibold tabular-nums">{load}</span>
                        <span className={`ml-2 text-xs ${hint || next.kind === "deload" || next.kind === "return" ? "text-amber-600" : next.kind === "increase" ? "text-emerald-600" : "text-zinc-500"}`}>
                          {/* A plain starting weight speaks for itself; other notes (↑, −10%, empty bar) are worth showing. */}
                          {hint?.note ?? (done.length === 0 && next.note !== "Starting weight" ? next.note : "")}
                        </span>
                      </p>
                    )}
                    {warmups.length > 0 && (
                      <p className="text-xs tabular-nums text-zinc-500">Warm up: {warmups.map((w) => `${w.weight}×${w.reps}`).join(" · ")}</p>
                    )}
                    {done.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {done.map((s) => {
                          const e1 = s.weight_lb > 0 ? estimated1RM(s.weight_lb, s.reps, s.rir) : 0;
                          const pr = hadHistory && e1 > best + 0.5;
                          if (e1 > best) best = e1;
                          return (
                            <Removable key={s.id} action={deleteSet} fields={{ id: s.id }} className="rounded bg-zinc-100 px-2 py-0.5 text-xs tabular-nums dark:bg-zinc-800">
                              {s.weight_lb > 0 && `${s.weight_lb} × `}{s.reps}{cardio ? " min" : timed ? " s" : ""}
                              {s.rir != null && <span className="text-zinc-500">{s.rir === 0 ? " · barely" : s.rir >= 4 ? " · easy" : ""}</span>}
                              {pr && <span title="New personal record"> 🏆</span>}
                            </Removable>
                          );
                        })}
                      </div>
                    )}
                    {!complete && cardio && (
                      <form action={logSet} className="mt-2 flex items-center gap-2">
                        <Hidden date={date} exercise={e.exercise} weight_lb={0} />
                        <input name="reps" type="number" min="1" inputMode="numeric" defaultValue={next.reps} className="w-16" aria-label="Minutes" />
                        <span className="text-xs text-zinc-500">min</span>
                        <Button className="flex-1">✓ Done</Button>
                      </form>
                    )}
                    {!complete && !cardio && (
                      // One tap logs the prescribed weight × reps with an effort rating; "edit" for anything else.
                      <form key={done.length} action={logSet} className="mt-2">
                        <Hidden date={date} exercise={e.exercise} />
                        <div className="flex gap-1.5">
                          <Button name="rir" value="4" variant="ghost" className="flex-1">Easy</Button>
                          <Button name="rir" value="2" className="flex-[2]">✓ Done</Button>
                          <Button name="rir" value="0" variant="ghost" className="flex-1">Barely</Button>
                        </div>
                        <details className="mt-1 text-xs text-zinc-500">
                          <summary className="cursor-pointer">edit</summary>
                          <div className="mt-1 flex items-center gap-1.5">
                            <input name="weight_lb" type="number" step="0.5" min="0" inputMode="decimal" defaultValue={weightNow} className="w-20" aria-label="Weight (lb)" />
                            <span>lb ×</span>
                            <input name="reps" type="number" min="1" inputMode="numeric" defaultValue={next.reps} className="w-16" aria-label="Reps" />
                            <span>reps, then tap a button above</span>
                          </div>
                        </details>
                      </form>
                    )}
                  </>
                );
                // Only the exercise in progress stays open; the rest fold to one line and open on tap.
                if (idx !== activeIdx) {
                  return (
                    <li key={e.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800">
                      <details>
                        <summary className="flex cursor-pointer list-none items-baseline justify-between gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                          <span className={`font-medium ${complete ? "text-emerald-600" : ""}`}>{complete && "✓ "}{e.exercise}</span>
                          <span className="shrink-0 tabular-nums text-zinc-500">
                            {!complete && <span className="text-zinc-700 dark:text-zinc-300">{load} · </span>}
                            {done.length}/{e.sets}
                          </span>
                        </summary>
                        <div className="px-3 pb-3">{body}</div>
                      </details>
                    </li>
                  );
                }
                return (
                  <li key={e.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`font-medium ${complete ? "text-emerald-600" : ""}`}>
                        {complete && "✓ "}{e.exercise}
                        {formTip(e.exercise) && <Info label={`How to do ${e.exercise}`}>{formTip(e.exercise)}</Info>}
                      </span>
                      <span className="text-sm tabular-nums text-zinc-500">{done.length}/{e.sets}</span>
                    </div>
                    {body}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Meals" action={<Link href="/plan" className="text-sm text-emerald-600">Plan →</Link>}>
        <div className="mb-4">
          <LogFood
            date={date}
            defaultSlot={defaultSlot}
            frequent={frequent}
            recipes={recipes.map((r) => ({ id: r.id, name: r.name, calories: r.calories }))}
            claude={claudeEnabled()}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SLOTS.map((slot) => {
            const logged = food.filter((f) => f.slot === slot);
            const planned = plan.find((p) => p.slot === slot);
            // Main meals aim for 30 g+ protein each; muscle building responds per meal, not just per day.
            const protein = Math.round(logged.reduce((t, f) => t + f.protein, 0));
            const lowProtein = slot !== "snack" && protein < MEAL_PROTEIN;
            return (
              <div key={slot} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold capitalize">{slot}</h3>
                  <span className="text-xs tabular-nums text-zinc-500">
                    {logged.length > 0 && <span className={lowProtein ? "text-amber-600" : "text-emerald-600"} title={`Protein this meal${slot !== "snack" ? `; aim for ${MEAL_PROTEIN} g+` : ""}`}>{protein}g P · </span>}
                    ~{fmt(budgets[slot])} kcal
                  </span>
                </div>
                {logged.map((f) => (
                  <div key={f.id} className="text-sm">
                    <Removable action={deleteFood} fields={{ id: f.id }}>
                      <span>{f.name} <span className="text-zinc-500">· {fmt(f.calories)}</span></span>
                    </Removable>
                  </div>
                ))}
                {logged.length === 0 && planned && (
                  <form action={eatPlanned} className="space-y-2">
                    <Hidden date={date} slot={slot} />
                    <p className="text-sm">
                      {planned.recipe.name}
                      {planned.servings !== 1 && <span className="text-zinc-500"> ×{planned.servings}</span>}
                      <span className="block text-xs text-zinc-500">{fmt(planned.recipe.calories * planned.servings)} kcal · {fmt(planned.recipe.protein * planned.servings)}g protein</span>
                    </p>
                    <Button variant="ghost" className="w-full">Ate this</Button>
                  </form>
                )}
                {logged.length === 0 && !planned && <p className="text-sm text-zinc-500">—</p>}
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title={<span id="body">Body<Info>Trend smooths out day-to-day water and food swings, so it's the number to watch. Weigh in most mornings. Waist ÷ height under 0.5 is the healthy range, and it's a better guide than BMI when you're building muscle.</Info></span>}
      >
        <div className="grid grid-cols-3 gap-4 text-center">
          <Stat label="Trend" value={trend != null ? `${trend} lb` : "—"} sub={weighIn ? `today ${weighIn.weight_lb}` : undefined} />
          <Stat
            label="To goal"
            value={toGoal == null ? "—" : Math.abs(toGoal) < 0.5 ? "At goal" : `${toGoal > 0 ? "+" : "−"}${Math.abs(toGoal).toFixed(1)} lb`}
            sub={`goal ${profile.goal_weight_lb}`}
          />
          {lastWaist ? (
            <Stat label="Waist ÷ height" value={waistToHeight(lastWaist, profile.height_in).toFixed(2)} sub={`${lastWaist} in`} />
          ) : (
            <Stat label="BMI" value={trend != null ? bmi(trend, profile.height_in).toFixed(1) : "—"} />
          )}
        </div>
        <form key={weighIn?.weight_lb ?? "new"} action={logWeight} className="mt-4 flex items-center justify-center gap-2">
          <Hidden date={date} />
          <input name="weight_lb" type="number" step="0.1" min="50" inputMode="decimal" defaultValue={weighIn?.weight_lb ?? ""} placeholder="Weight lb" className="w-28" required aria-label="Weight (lb)" />
          <input name="waist_in" type="number" step="0.25" min="15" inputMode="decimal" defaultValue={weighIn?.waist_in ?? ""} placeholder="Waist in" className="w-24" aria-label="Waist (in), optional" />
          <Button>{weighIn ? "Update" : "Save"}</Button>
        </form>
        <div className="mt-3 flex items-center justify-center gap-1.5 text-sm">
          <span className="mr-1 text-zinc-500">Slept<Info>Hours of sleep last night. One tap saves it; tap again to clear. Adults need 7+ hours, and short sleep slows strength gains, raises hunger and hurts blood-sugar control.</Info></span>
          {SLEEP_CHOICES.map((h) => (
            <form key={h} action={logSleep}>
              <Hidden date={date} hours={h} />
              <button
                aria-pressed={sleep?.value === h}
                className={`h-8 w-9 rounded-full border text-sm tabular-nums ${sleep?.value === h ? (h >= SLEEP_GOAL ? "border-emerald-600 bg-emerald-600 text-white" : "border-amber-500 bg-amber-500 text-white") : "border-zinc-300 text-zinc-600 hover:border-emerald-500 dark:border-zinc-700 dark:text-zinc-300"}`}
              >
                {h}{h === SLEEP_CHOICES.at(-1) && "+"}
              </button>
            </form>
          ))}
          <span className="ml-1 text-zinc-500">h</span>
        </div>
        <div className="mt-2 flex items-center justify-center gap-1.5 text-sm">
          <span className="mr-1 text-zinc-500">Water<Info>Tap each time you drink. The goal is about half your body weight in ounces; drink more on training and hot days.</Info></span>
          <span className={`mr-1 tabular-nums ${(water?.value ?? 0) >= waterTarget ? "text-emerald-600" : ""}`}>{water?.value ?? 0}/{waterTarget} oz</span>
          {WATER_STEPS.map((oz) => (
            <form key={oz} action={logWater}>
              <Hidden date={date} oz={oz} />
              <button className="h-8 rounded-full border border-zinc-300 px-2.5 text-sm tabular-nums text-zinc-600 hover:border-emerald-500 dark:border-zinc-700 dark:text-zinc-300">+{oz}</button>
            </form>
          ))}
          {(water?.value ?? 0) > 0 && (
            <form action={logWater}>
              <Hidden date={date} oz={-WATER_STEPS[0]} />
              <button aria-label={`Undo ${WATER_STEPS[0]} oz`} className="h-8 rounded-full px-2 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">−{WATER_STEPS[0]}</button>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}
