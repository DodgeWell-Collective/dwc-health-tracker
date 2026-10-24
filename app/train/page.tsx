import { all } from "../../lib/db";
import { getTargets, getToday, lifterFor } from "../../lib/data";
import { addDays, formatDate, WEEKDAYS, weekday } from "../../lib/dates";
import { formTip } from "../../lib/form-tips";
import { formatTarget, prescribeFrom, shortLoad } from "../../lib/loads";
import { EQUIPMENT, type StrengthGoal, type WorkoutExercise } from "../../lib/types";
import { AutoSave, Button, Card, ExclusiveChecks, Hidden, Info, Removable } from "../../components/ui";
import { ProgramBuilder } from "../../components/program-builder";
import { addStrengthGoal, deleteStrengthGoal, saveProfile, saveWorkoutDay } from "../actions";

export const dynamic = "force-dynamic";

/** "Full gym" means everything and "Bodyweight only" means nothing, so neither combines with specific items. */
const EXCLUSIVE_EQUIPMENT = ["full_gym", "bodyweight"];

const short = (d: string) => formatDate(d, { month: "short", day: "numeric", year: "numeric" });

export default async function Train() {
  const today = await getToday();
  const { profile: p, weight } = await getTargets(today);
  const [days, exercises, goals, logged, history] = await Promise.all([
    all<{ weekday: number; name: string }>("SELECT * FROM workout_day"),
    all<WorkoutExercise>("SELECT * FROM workout_exercise ORDER BY weekday, sort"),
    all<StrengthGoal>("SELECT * FROM strength_goal ORDER BY target_date"),
    all<{ exercise: string }>("SELECT DISTINCT exercise FROM set_log"),
    // Recent sets → each day's prescribed weight, same rules as Today.
    all<{ exercise: string; date: string; weight_lb: number; reps: number; rir: number | null }>(
      "SELECT exercise, date, weight_lb, reps, rir FROM set_log WHERE date >= ? ORDER BY date, id",
      addDays(today, -120),
    ),
  ]);
  const owned = p.equipment.split(",").filter(Boolean);
  const lifter = lifterFor(p, weight?.weight_lb ?? null, today);
  const exerciseNames = [...new Set([...exercises.map((e) => e.exercise), ...logged.map((l) => l.exercise)])].sort();
  const todayWd = weekday(today);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Train</h1>

      {days.length > 0 && (
        <Card title={<>This week<Info>Weights are what to use next time, per hand for dumbbells. They start from your profile and adjust from what you log. Tap ⓘ next to an exercise for form cues. “edit” changes a day by hand: one exercise per line as “name SETSxREPS”, and a day with no name is a rest day.</Info></>}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
              const day = days.find((d) => d.weekday === wd);
              const list = exercises.filter((e) => e.weekday === wd);
              const isToday = wd === todayWd;
              const on = addDays(today, (wd - todayWd + 7) % 7);
              return (
                <div key={wd} className={`rounded-lg border p-3 text-sm ${isToday ? "border-emerald-500" : "border-zinc-200 dark:border-zinc-800"}`}>
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold">{WEEKDAYS[wd].slice(0, 3)}{day && <span className="font-normal text-zinc-500"> · {day.name}</span>}</span>
                    {isToday && <span className="text-xs text-emerald-600">Today</span>}
                  </div>
                  {list.length === 0 ? (
                    <p className="mt-1 text-zinc-500">Rest</p>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {list.map((e) => {
                        const tip = formTip(e.exercise);
                        const load = shortLoad(prescribeFrom(history, e, on, lifter), e.exercise);
                        return (
                          <li key={e.id} className="flex justify-between gap-2">
                            <span>{e.exercise}{tip && <Info label={`How to do ${e.exercise}`}>{tip}</Info>}</span>
                            <span className="shrink-0 tabular-nums text-zinc-500">{load && <span className="font-medium text-zinc-700 dark:text-zinc-300">{load} · </span>}{formatTarget(e.exercise, e.sets, e.reps)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-zinc-500">edit</summary>
                    <AutoSave key={`${wd}:${day?.name}:${list.length}`} action={saveWorkoutDay} className="mt-2 space-y-2">
                      <Hidden weekday={wd} />
                      <input name="name" placeholder="Rest" defaultValue={day?.name ?? ""} className="w-full" aria-label={`${WEEKDAYS[wd]} workout name`} />
                      <textarea
                        name="exercises"
                        rows={Math.max(2, list.length)}
                        placeholder="Squat 3x5"
                        className="w-full font-mono text-sm"
                        defaultValue={list.map((e) => `${e.exercise} ${e.sets}x${e.reps}`).join("\n")}
                        aria-label={`${WEEKDAYS[wd]} exercises`}
                      />
                    </AutoSave>
                  </details>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title={<>{days.length ? "Rebuild plan" : "Build your plan"}<Info>Built from your equipment, experience and strength goals, with Zone 2 cardio, one interval session, and carries and hangs for grip. Starting weights come from beginner strength standards scaled to your sex, age and body weight, set so each set ends with 2–3 reps left; after that, every lift adjusts from what you log. If you have an injury or medical condition, check with your doctor first.</Info></>}>
        <details open={days.length === 0}>
          <summary className="cursor-pointer text-sm text-zinc-500">{days.length ? "Show options" : "Options"}</summary>
          <div className="mt-3">
            <ProgramBuilder
              equipment={owned}
              goalLifts={goals.map((g) => ({ exercise: g.exercise, reps: g.target_reps }))}
              hasSchedule={days.length > 0}
              lifter={lifter}
            />
          </div>
        </details>
      </Card>

      <Card title={<>Strength goals<Info>Use the same exercise name you log sets under. Progress compares your estimated max to the target and the pace you need.</Info></>}>
        {goals.length > 0 && (
          <ul className="mb-3 space-y-1 text-sm">
            {goals.map((g) => (
              <li key={g.id}>
                <Removable action={deleteStrengthGoal} fields={{ id: g.id }}>
                  <span><span className="font-medium">{g.exercise}</span> {g.target_lb} × {g.target_reps} <span className="text-zinc-500">by {short(g.target_date)}</span></span>
                </Removable>
              </li>
            ))}
          </ul>
        )}
        <form action={addStrengthGoal} className="flex flex-wrap gap-2">
          <input name="exercise" list="exercise-names" placeholder="Exercise" required className="min-w-0 flex-1 basis-40" aria-label="Exercise" />
          <input name="target_lb" type="number" inputMode="decimal" min="1" step="2.5" placeholder="lb" required className="w-20" aria-label="Target weight (lb)" />
          <input name="target_reps" type="number" inputMode="numeric" min="1" defaultValue={5} className="w-16" aria-label="Reps" title="Reps at that weight" />
          <input name="target_date" type="date" min={today} defaultValue={addDays(today, 168)} required aria-label="Target date" />
          <Button>Add</Button>
        </form>
        <datalist id="exercise-names">{exerciseNames.map((n) => <option key={n} value={n} />)}</datalist>
      </Card>

      <Card title="Equipment & experience">
        <AutoSave action={saveProfile} className="space-y-3">
          <input type="hidden" name="equipment_present" value="1" />
          <ExclusiveChecks exclusive={EXCLUSIVE_EQUIPMENT} className="flex flex-wrap gap-1.5">
            {EQUIPMENT.map(([key, label]) => (
              <label key={key} className="cursor-pointer">
                <input type="checkbox" name="equipment" value={key} defaultChecked={owned.includes(key)} className="peer sr-only" />
                <span className="inline-block rounded-full border border-zinc-300 px-3 py-1 text-sm text-zinc-600 peer-checked:border-emerald-600 peer-checked:bg-emerald-600 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 dark:border-zinc-700 dark:text-zinc-300">
                  {label}
                </span>
              </label>
            ))}
          </ExclusiveChecks>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input name="equipment_notes" defaultValue={p.equipment_notes} placeholder="Notes, e.g. dumbbells go up to 50 lb" aria-label="Equipment notes" />
            <select name="experience" defaultValue={p.experience} aria-label="Lifting experience">
              <option value="beginner">Beginner lifter</option>
              <option value="intermediate">Intermediate (1–3 yrs)</option>
              <option value="advanced">Advanced (3+ yrs)</option>
            </select>
          </div>
        </AutoSave>
      </Card>
    </div>
  );
}
