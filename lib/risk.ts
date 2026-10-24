import { all, first } from "./db";
import { getTargets } from "./data";
import { addDays, daysBetween, formatDate } from "./dates";
import { estimated1RM, strengthStatus, weightTrend } from "./nutrition";
import { SLEEP_GOAL } from "./markers";
import type { StrengthGoal } from "./types";

/**
 * Early warnings that a dated goal won't be met, with the likely cause
 * (missed workouts, unlogged days, eating off target). Silent unless
 * something is actually off, and only once there's enough history to judge.
 */
export interface Risk {
  text: string;
  why: string;
}

const short = (d: string) => formatDate(d, { month: "short", day: "numeric" });

export async function goalRisks(today: string): Promise<Risk[]> {
  const weekAgo = addDays(today, -7);
  const [{ profile, targets, pace }, weighIns, days, sets, goals, planned, started, sleep] = await Promise.all([
    getTargets(today),
    all<{ date: string; weight_lb: number }>("SELECT date, weight_lb FROM weigh_in WHERE date BETWEEN ? AND ? ORDER BY date", addDays(today, -120), today),
    all<{ date: string; calories: number }>("SELECT date, SUM(calories) AS calories FROM food_log WHERE date >= ? AND date < ? GROUP BY date", weekAgo, today),
    all<{ date: string; exercise: string; weight_lb: number; reps: number; rir: number | null }>(
      "SELECT date, exercise, weight_lb, reps, rir FROM set_log WHERE date BETWEEN ? AND ?", addDays(today, -90), today,
    ),
    all<StrengthGoal>("SELECT * FROM strength_goal WHERE target_date > ? ORDER BY target_date", today),
    first<{ n: number }>("SELECT COUNT(*) AS n FROM workout_day"),
    first<{ food: string | null; lifts: string | null }>("SELECT (SELECT MIN(date) FROM food_log) AS food, (SELECT MIN(date) FROM set_log) AS lifts"),
    first<{ avg: number | null; n: number }>("SELECT AVG(value) AS avg, COUNT(*) AS n FROM metric WHERE kind = 'sleep' AND date > ?", weekAgo),
  ]);
  const risks: Risk[] = [];
  // Short sleep as a cause, once there are enough nights to say so.
  const shortSleep = sleep && sleep.n >= 4 && sleep.avg != null && sleep.avg < SLEEP_GOAL ? `${sleep.avg.toFixed(1)} h avg sleep` : null;

  // Last 7 complete days; a workout done today counts too.
  const plannedPerWeek = planned?.n ?? 0;
  const workouts = Math.min(plannedPerWeek || 7, new Set(sets.filter((s) => s.date >= weekAgo).map((s) => s.date)).size);
  const fewWorkouts = plannedPerWeek > 0 && !!started?.lifts && started.lifts < weekAgo && workouts < plannedPerWeek * 0.75;
  const workoutCause = `${workouts} of ${plannedPerWeek} workouts this week`;

  // Weight: dated goal, trend over the last 2 weeks vs the pace the targets are built for.
  if (pace.needed != null && pace.needed !== 0 && profile.goal_date) {
    const trend = weightTrend(weighIns);
    const now = trend.at(-1);
    const then = [...trend].reverse().find((t) => t.date <= addDays(today, -14));
    const recent = weighIns.filter((w) => w.date > addDays(today, -14)).length;
    const logged = days.length;
    const avg = logged ? Math.round(days.reduce((t, d) => t + d.calories, 0) / logged) : null;
    const offTarget = avg != null && logged >= 4 && Math.abs(avg - targets.calories) > 200;
    const unlogged = logged < 4 && !!started?.food && started.food < weekAgo;
    const cause = unlogged
      ? `${logged} of 7 days logged`
      : offTarget
        ? `avg ${avg!.toLocaleString()} vs ${targets.calories.toLocaleString()} kcal`
        : null;

    let behind = false;
    let eta: string | null = null;
    if (now && then && recent >= 4) {
      const actual = ((now.value - then.value) / daysBetween(then.date, now.date)) * 7;
      const remaining = profile.goal_weight_lb - now.value;
      // Behind = moving toward the goal at least 0.25 lb/week slower than planned (or away from it).
      behind = Math.sign(pace.rate) * (pace.rate - actual) > 0.25;
      if (behind && Math.sign(actual) === Math.sign(remaining) && Math.abs(actual) >= 0.05) eta = addDays(today, Math.ceil((remaining / actual) * 7));
    }
    if (behind || unlogged) {
      const when = eta && eta > profile.goal_date ? `ETA ${short(eta)} vs ${short(profile.goal_date)}` : null;
      risks.push({
        text: `Weight goal ${behind ? "behind" : "at risk"}: ${[cause ?? (behind ? "eating on target, see Progress" : null), when].filter(Boolean).join(" · ")}`,
        why: unlogged
          ? "Fewer than 4 of the last 7 days have food logged, so the app can't tell whether calories are on target. Log meals (one tap on a chip or “Ate this”) to keep the goal date honest."
          : offTarget
            ? `Your 2-week weight trend is slower than the ${Math.abs(pace.rate)} lb/week your goal date needs, and you averaged ${avg!.toLocaleString()} kcal against a ${targets.calories.toLocaleString()} target. Hitting the target is the fix before changing it.`
            : `Your 2-week weight trend is slower than the ${Math.abs(pace.rate)} lb/week your goal date needs, even eating to target. Your calorie target follows your measured burn (Progress), so keep logging and weighing in and it will correct itself.`,
      });
    }
  }

  // Strength: the soonest goal that's behind pace, else a missed-workouts warning if any goal is active.
  if (goals.length > 0) {
    const pointsFor = (exercise: string) => {
      const byDate = new Map<string, number>();
      for (const s of sets) {
        if (s.weight_lb <= 0 || s.exercise.toLowerCase() !== exercise.toLowerCase()) continue;
        byDate.set(s.date, Math.max(byDate.get(s.date) ?? 0, estimated1RM(s.weight_lb, s.reps, s.rir)));
      }
      return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
    };
    const lagging = goals
      .map((g) => ({ g, s: strengthStatus(pointsFor(g.exercise), Math.round(estimated1RM(g.target_lb, g.target_reps)), g.target_date, today) }))
      .find((x) => x.s.status === "behind");
    if (lagging) {
      const { g, s } = lagging;
      const when = s.projected ? `ETA ${short(s.projected)} vs ${short(g.target_date)}` : null;
      risks.push({
        text: `${g.exercise} goal behind: ${[fewWorkouts ? workoutCause : shortSleep, when ?? `need +${s.neededPerWeek}/wk`].filter(Boolean).join(" · ")}`,
        why: `Your estimated max is rising ${s.weeklyGain! >= 0 ? "+" : ""}${s.weeklyGain} lb/week; ${g.target_lb}×${g.target_reps} by ${short(g.target_date)} needs +${s.neededPerWeek}.${
          fewWorkouts ? " Missed sessions are the likely cause."
          : shortSleep ? ` You've averaged ${sleep!.avg!.toFixed(1)} hours of sleep this week; under 7 slows recovery and strength gains.`
          : " If you're training as planned, eat at target, sleep 7+ hours, and log honest effort so weights progress."}`,
      });
    } else if (fewWorkouts) {
      risks.push({
        text: `Strength goals at risk: ${workoutCause}`,
        why: `Your program has ${plannedPerWeek} sessions a week. Progress comes from training each lift about twice a week; missing sessions slows it and can push your goal dates back.`,
      });
    }
  }

  return risks;
}
