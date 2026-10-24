import Link from "next/link";
import { all, first } from "../../lib/db";
import { getTargets, getToday } from "../../lib/data";
import { addDays, formatDate } from "../../lib/dates";
import { estimated1RM, strengthStatus, suggestedTargets, vo2Median, waistToHeight, weightTrend } from "../../lib/nutrition";
import { ZONE2 } from "../../lib/program";
import type { StrengthGoal } from "../../lib/types";
import { Button, Card, fmt, Hidden, Info, Removable } from "../../components/ui";
import { LineChart, TargetBars } from "../../components/charts";
import { autoTargets, deleteMetric, deleteVo2, deleteWeight, logBalance, logLabs, logVo2 } from "../actions";
import { balanceNorm, bpStatus, LABS, labStatus, SLEEP_GOAL } from "../../lib/markers";

export const dynamic = "force-dynamic";

const short = (d: string) => formatDate(d, { month: "short", day: "numeric" });
const signed = (n: number, digits = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;

export default async function Progress() {
  const today = await getToday();
  const since = addDays(today, -89);
  const weekAgo = addDays(today, -7);
  const [{ profile, targets, pace, weight, measured, formula }, weights, days, sets, goals, plannedDays, zone2Plan, vo2, metrics] = await Promise.all([
    getTargets(today),
    all<{ date: string; weight_lb: number; waist_in: number | null }>("SELECT date, weight_lb, waist_in FROM weigh_in WHERE date >= ? ORDER BY date", since),
    all<{ date: string; calories: number; protein: number }>(
      "SELECT date, SUM(calories) AS calories, SUM(protein) AS protein FROM food_log WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date",
      addDays(today, -13), today,
    ),
    all<{ date: string; exercise: string; weight_lb: number; reps: number; rir: number | null }>(
      "SELECT date, exercise, weight_lb, reps, rir FROM set_log WHERE date >= ? ORDER BY date, id", since,
    ),
    all<StrengthGoal>("SELECT * FROM strength_goal ORDER BY target_date"),
    first<{ n: number }>("SELECT COUNT(*) AS n FROM workout_day"),
    first<{ min: number | null }>("SELECT SUM(reps) AS min FROM workout_exercise WHERE exercise = ?", ZONE2),
    all<{ date: string; value: number }>("SELECT date, value FROM vo2max ORDER BY date"),
    all<{ date: string; kind: string; value: number }>("SELECT date, kind, value FROM metric ORDER BY date"),
  ]);
  const metricsOf = (kind: string) => metrics.filter((m) => m.kind === kind);
  const sleepWeek = metricsOf("sleep").filter((m) => m.date > weekAgo);
  const avgSleep = sleepWeek.length ? sleepWeek.reduce((t, m) => t + m.value, 0) / sleepWeek.length : null;
  const balance = metricsOf("balance");
  const balanceNormAge = balanceNorm(Number(today.slice(0, 4)) - profile.birth_year);
  // Latest lab results, newest first per marker; blood pressure pairs by date.
  const labDates = [...new Set(metrics.filter((m) => !["sleep", "balance", "water"].includes(m.kind)).map((m) => m.date))].reverse();
  const bpSys = metricsOf("bp_sys"), bpDia = metricsOf("bp_dia");
  const age = Number(today.slice(0, 4)) - profile.birth_year;
  const vo2Norm = vo2Median(age, profile.sex);

  const trend = weightTrend(weights);
  const trendNow = trend.at(-1)?.value;
  const trendWeekAgo = [...trend].reverse().find((t) => t.date <= weekAgo)?.value;

  // Last 7 complete days (today is still in progress).
  const week = days.filter((d) => d.date >= weekAgo && d.date < today);
  const report = {
    workouts: new Set(sets.filter((s) => s.date > weekAgo).map((s) => s.date)).size,
    planned: plannedDays?.n ?? 0,
    proteinDays: week.filter((d) => d.protein >= targets.protein * 0.9).length,
    loggedDays: week.length,
    avgCalories: week.length ? week.reduce((t, d) => t + d.calories, 0) / week.length : null,
    weightChange: trendNow != null && trendWeekAgo != null ? trendNow - trendWeekAgo : null,
    zone2: sets.filter((s) => s.date > weekAgo && s.exercise === ZONE2).reduce((t, s) => t + s.reps, 0),
  };

  // Typed-in targets don't follow the measured burn; offer the automatic one in a tap.
  const autoCalories = suggestedTargets(profile, weight?.weight_lb ?? profile.goal_weight_lb, pace, measured).calories;

  // Per lift: best estimated max per day, best set ever (in range), recent sessions.
  const lifts = new Map<string, { byDate: Map<string, number>; best: { weight: number; reps: number; e1: number; date: string } | null }>();
  for (const s of sets) {
    if (s.weight_lb <= 0) continue;
    const lift = lifts.get(s.exercise) ?? { byDate: new Map(), best: null };
    const e1 = estimated1RM(s.weight_lb, s.reps, s.rir);
    lift.byDate.set(s.date, Math.max(lift.byDate.get(s.date) ?? 0, e1));
    if (!lift.best || e1 > lift.best.e1) lift.best = { weight: s.weight_lb, reps: s.reps, e1, date: s.date };
    lifts.set(s.exercise, lift);
  }
  const pointsFor = (exercise: string) => {
    const lift = [...lifts].find(([name]) => name.toLowerCase() === exercise.toLowerCase())?.[1];
    return lift ? [...lift.byDate].map(([date, value]) => ({ date, value })) : [];
  };

  const waists = weights.filter((w) => w.waist_in != null);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Progress</h1>

      <Card title={<>Last 7 days<Info>Green means on target. Your weight trend is compared to your goal pace; your calorie target adjusts itself as your measured burn changes.</Info></>}>
        <div className="grid grid-cols-3 gap-4 text-center sm:grid-cols-6">
          <Stat label="Workouts" value={`${report.workouts}${report.planned ? `/${report.planned}` : ""}`} />
          <Stat
            label="Sleep"
            value={avgSleep != null ? `${avgSleep.toFixed(1)} h` : "—"}
            sub={avgSleep != null ? `${sleepWeek.length} nights` : "tap on Today"}
            tone={avgSleep == null ? undefined : avgSleep >= SLEEP_GOAL ? "good" : "warn"}
          />
          <Stat
            label="Zone 2"
            value={`${report.zone2} min`}
            sub={zone2Plan?.min ? `goal ${zone2Plan.min}` : undefined}
            tone={zone2Plan?.min ? (report.zone2 >= zone2Plan.min ? "good" : "warn") : undefined}
          />
          <Stat label="Protein goal" value={`${report.proteinDays}/${report.loggedDays || 0}`} sub="days hit" />
          <Stat label="Avg kcal" value={report.avgCalories != null ? fmt(report.avgCalories) : "—"} sub={`target ${fmt(targets.calories)}`} />
          <Stat
            label="Weight trend"
            value={report.weightChange != null ? `${signed(report.weightChange)} lb` : "—"}
            sub={`goal ${signed(pace.rate)}/wk`}
            tone={report.weightChange == null ? undefined : Math.abs(report.weightChange - pace.rate) < 0.3 ? "good" : "warn"}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-3 text-sm dark:border-zinc-800">
          <span className="flex-1">
            {measured ? <>You burn about <b>{fmt(measured.kcal)}</b> kcal/day</> : <>Estimated burn {fmt(formula)} kcal/day</>}
            {targets.suggested ? <span className="text-zinc-500"> · target follows it</span> : <span className="text-zinc-500"> · your target is fixed at {fmt(targets.calories)}</span>}
            <Info>
              {measured
                ? `Measured from your last ${measured.days} fully logged days and the weight change over the same 3 weeks (3,500 kcal per lb). It updates daily, and your calorie target is this plus or minus your goal pace.`
                : "Estimated from your weight, height, age and activity, which is often 10–20% off. After about 2 weeks of full food logs and 6+ weigh-ins, it switches to what you actually burn."}
            </Info>
          </span>
          {!targets.suggested && autoCalories !== targets.calories && (
            <form action={autoTargets}>
              <Button variant="ghost">Use {fmt(autoCalories)} kcal</Button>
            </form>
          )}
        </div>
      </Card>

      <Card
        title={<>Weight{trendNow != null && <span className="ml-2 font-normal tabular-nums text-zinc-500">{trendNow} lb</span>}<Info>The line is your trend: each day it moves 10% of the way toward the scale, which smooths out water and food swings. Dots are individual weigh-ins.</Info></>}
        action={
          <span className="text-xs tabular-nums text-zinc-500">
            goal {profile.goal_weight_lb}{profile.goal_date && pace.projected && ` · ${short(pace.projected)}`}
            {pace.capped && <span className="text-amber-600"> (date too fast)</span>}
          </span>
        }
      >
        <LineChart points={weights.map((w) => ({ date: w.date, value: w.weight_lb }))} trend={trend} unit="lb" reference={profile.goal_weight_lb} referenceLabel="Goal" />
        {weights.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-xs text-zinc-500">Weigh-ins</summary>
            <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
              {[...weights].reverse().map((w) => (
                <li key={w.date} className="flex items-center justify-between py-1 tabular-nums">
                  <span>{short(w.date)}</span>
                  <Removable action={deleteWeight} fields={{ date: w.date }}>
                    <span>{w.weight_lb} lb{w.waist_in && <span className="text-zinc-500"> · {w.waist_in}″</span>}</span>
                  </Removable>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      {waists.length >= 2 && (
        <Card
          title={<>Waist<span className="ml-2 font-normal tabular-nums text-zinc-500">{waists.at(-1)!.waist_in}″ · ratio {waistToHeight(waists.at(-1)!.waist_in!, profile.height_in).toFixed(2)}</span><Info>Waist ÷ height under 0.5 is the healthy range. If your weight rises while your waist holds steady, the gain is mostly muscle.</Info></>}
        >
          <LineChart points={waists.map((w) => ({ date: w.date, value: w.waist_in! }))} unit="in" reference={Math.round(profile.height_in * 0.5 * 4) / 4} referenceLabel="0.5 ratio" />
        </Card>
      )}

      <Card
        title={<>VO2 max{vo2.length > 0 && <span className="ml-2 font-normal tabular-nums text-zinc-500">{vo2.at(-1)!.value}</span>}<Info>Aerobic fitness is one of the strongest predictors of a long life; the biggest gain comes from moving out of the bottom fitness group. Enter your watch's estimate, or run as far as you can in 12 minutes and enter the miles. Retest every 2–3 months. Attia aims for elite for your age, so you're still fit at 80. Median for your age is about {vo2Norm} (FRIEND registry).</Info></>}
        action={<span className="text-xs tabular-nums text-zinc-500">age median ~{vo2Norm}</span>}
      >
        {vo2.length > 0 && <LineChart points={vo2} unit="ml/kg/min" reference={vo2Norm} referenceLabel="Median" />}
        <form action={logVo2} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Hidden date={today} />
          <input name="vo2" type="number" step="0.1" min="10" max="90" inputMode="decimal" placeholder="VO2 max" className="w-24" aria-label="VO2 max (ml/kg/min)" />
          <span className="text-xs text-zinc-500">or</span>
          <input name="miles" type="number" step="0.01" min="0.3" max="3" inputMode="decimal" placeholder="12-min miles" className="w-28" aria-label="Miles run in 12 minutes" />
          <Button>Save</Button>
        </form>
        {vo2.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-xs text-zinc-500">Readings</summary>
            <ul className="mt-1 space-y-1 tabular-nums">
              {[...vo2].reverse().map((v) => (
                <li key={v.date} className="flex justify-between">
                  <span>{short(v.date)}</span>
                  <Removable action={deleteVo2} fields={{ date: v.date }}><span>{v.value}</span></Removable>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Card
        title={<>Balance{balance.length > 0 && <span className="ml-2 font-normal tabular-nums text-zinc-500">{balance.at(-1)!.value} s</span>}<Info>Stand on one leg, eyes open, hands on hips, and time how long you hold it (best of 3, stop at 60 s). Typical for your age is about {balanceNormAge} s. Not managing 10 seconds in mid-life or later is linked to a shorter life, and balance is what prevents falls later on. Retest monthly.</Info></>}
        action={<span className="text-xs tabular-nums text-zinc-500">typical ~{balanceNormAge} s</span>}
      >
        {balance.length > 1 && <LineChart points={balance} unit="s" reference={balanceNormAge} referenceLabel="Typical" />}
        <form action={logBalance} className="mt-2 flex items-center gap-2 text-sm">
          <Hidden date={today} />
          <input name="seconds" type="number" min="0" max="300" inputMode="numeric" placeholder="Seconds" required className="w-24" aria-label="Single-leg stand (seconds)" />
          <Button>Save</Button>
        </form>
      </Card>

      <Card title={<>Labs<Info>The blood markers most tied to heart disease and diabetes, plus blood pressure. Green is the optimal range, which is stricter than a lab&apos;s &ldquo;normal&rdquo;. Amber is normal but not optimal, and red is above normal. Go over results with your doctor.</Info></>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {LABS.map((lab) => {
            const list = metricsOf(lab.kind);
            const last = list.at(-1), prev = list.at(-2);
            return (
              <MarkerTile
                key={lab.kind}
                label={<>{lab.label}<Info label={`About ${lab.label}`}>{lab.why} Retest {lab.retest}.</Info></>}
                value={last ? `${last.value}` : null}
                unit={lab.unit}
                status={last ? labStatus(last.value, lab) : null}
                sub={last ? `${short(last.date)}${prev ? ` · was ${prev.value}` : ""}` : `optimal ≤ ${lab.optimal}`}
              />
            );
          })}
          {(() => {
            const s = bpSys.at(-1), d = s && bpDia.find((x) => x.date === s.date);
            return (
              <MarkerTile
                label={<>Blood pressure<Info label="About blood pressure">Under 120/80 is optimal; 120–129 over under 80 is elevated; 130+ or 80+ is high. Measure seated after 5 quiet minutes, arm at heart level, and average a few readings.</Info></>}
                value={s && d ? `${s.value}/${d.value}` : null}
                unit="mmHg"
                status={s && d ? bpStatus(s.value, d.value) : null}
                sub={s ? short(s.date) : "optimal < 120/80"}
              />
            );
          })()}
        </div>
        <details className="mt-3 text-sm" open={labDates.length === 0}>
          <summary className="cursor-pointer text-xs text-zinc-500">Add results</summary>
          <form action={logLabs} className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <input name="date" type="date" max={today} defaultValue={today} required aria-label="Test date" />
              {LABS.map((lab) => (
                <input key={lab.kind} name={lab.kind} type="number" step="any" min="0" inputMode="decimal" placeholder={`${lab.label} ${lab.unit}`} aria-label={`${lab.label} (${lab.unit})`} />
              ))}
              <input name="bp" placeholder="BP 120/80" inputMode="numeric" pattern="\d{2,3}\s*/\s*\d{2,3}" aria-label="Blood pressure, e.g. 120/80" />
            </div>
            <Button>Save</Button>
          </form>
        </details>
        {labDates.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-xs text-zinc-500">All results</summary>
            <ul className="mt-1 space-y-1 tabular-nums">
              {labDates.map((d) => {
                const rows = metrics.filter((m) => m.date === d && !["sleep", "balance", "water"].includes(m.kind));
                const name = (k: string) => LABS.find((l) => l.kind === k)?.label;
                const sys = rows.find((r) => r.kind === "bp_sys"), dia = rows.find((r) => r.kind === "bp_dia");
                const text = [
                  ...rows.filter((r) => name(r.kind)).map((r) => `${name(r.kind)} ${r.value}`),
                  ...(sys && dia ? [`BP ${sys.value}/${dia.value}`] : []),
                ].join(" · ");
                return (
                  <li key={d} className="flex justify-between gap-2">
                    <span className="shrink-0">{short(d)}</span>
                    <Removable action={deleteMetric} fields={{ date: d, kind: rows.map((r) => r.kind).join(",") }}><span className="text-right">{text}</span></Removable>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </Card>

      <Card title="Calories · 14 days">
        <TargetBars points={days.map((c) => ({ date: c.date, value: c.calories }))} target={targets.calories} unit="kcal" />
      </Card>

      {goals.length > 0 && (
        <Card title="Strength goals" action={<Link href="/train" className="text-xs text-zinc-500 underline">edit</Link>}>
          <ul className="space-y-3">
            {goals.map((g) => {
              const s = strengthStatus(pointsFor(g.exercise), Math.round(estimated1RM(g.target_lb, g.target_reps)), g.target_date, today);
              const pct = s.current ? Math.min(100, (s.current / s.target) * 100) : 0;
              const label = {
                achieved: <span className="text-emerald-600">✓ Reached</span>,
                on_pace: <span className="text-emerald-600">On pace</span>,
                behind: <span className="text-amber-600">Behind</span>,
                past: <span className="text-zinc-500">Date passed</span>,
                no_data: <span className="text-zinc-500">Keep logging</span>,
              }[s.status];
              return (
                <li key={g.id} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span><span className="font-medium">{g.exercise}</span> {g.target_lb}×{g.target_reps} <span className="text-zinc-500">by {short(g.target_date)}</span></span>
                    {label}
                  </div>
                  <div className="my-1 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs tabular-nums text-zinc-500">
                    {s.current == null ? `Target max ≈ ${s.target} lb` : `Max ${s.current}/${s.target} lb`}
                    {s.status !== "achieved" && s.neededPerWeek != null && ` · need +${s.neededPerWeek}/wk`}
                    {s.status !== "achieved" && s.weeklyGain != null && `, doing ${signed(s.weeklyGain)}`}
                    {s.status !== "achieved" && s.projected && ` · ETA ${short(s.projected)}`}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card title={<>Lifts<Info>Estimated one-rep max from your best set each session, counting reps you had left. Tap a lift for its records.</Info></>}>
        {lifts.size === 0 ? (
          <p className="text-sm text-zinc-500">Log sets with a weight to see your lifts here.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {[...lifts].map(([exercise, lift]) => {
              const points = [...lift.byDate].map(([date, value]) => ({ date, value: Math.round(value) }));
              const gain = points.at(-1)!.value - points[0].value;
              const recent = [...new Set(sets.filter((s) => s.exercise === exercise).map((s) => s.date))].slice(-4).reverse();
              return (
                <details key={exercise} className="group">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">{exercise}</span>
                      <span className="tabular-nums text-zinc-500">{points.at(-1)!.value} lb{points.length > 1 && ` (${gain >= 0 ? "+" : ""}${gain})`}</span>
                    </div>
                    <LineChart points={points} unit="lb max" />
                  </summary>
                  <div className="mt-1 space-y-1 text-xs tabular-nums text-zinc-500">
                    {lift.best && <p>🏆 Best set {lift.best.weight}×{lift.best.reps} on {short(lift.best.date)} (max ≈ {Math.round(lift.best.e1)})</p>}
                    {recent.map((d) => (
                      <p key={d}>{short(d)}: {sets.filter((s) => s.exercise === exercise && s.date === d).map((s) => `${s.weight_lb}×${s.reps}`).join(", ")}</p>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

const STATUS = {
  optimal: { word: "optimal", cls: "text-emerald-600" },
  normal: { word: "normal", cls: "text-amber-600" },
  high: { word: "high", cls: "text-red-600" },
};

function MarkerTile({ label, value, unit, status, sub }: { label: React.ReactNode; value: string | null; unit: string; status: keyof typeof STATUS | null; sub: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className={`text-lg font-semibold tabular-nums ${status ? STATUS[status].cls : "text-zinc-400"}`}>{value ?? "—"}</span>
        {value && <span className="text-xs text-zinc-500">{unit}</span>}
        {status && <span className={`ml-auto text-xs ${STATUS[status].cls}`}>{STATUS[status].word}</span>}
      </div>
      <div className="text-xs tabular-nums text-zinc-500">{sub}</div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}
