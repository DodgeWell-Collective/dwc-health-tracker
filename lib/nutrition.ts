import { addDays } from "./dates";
import type { Profile } from "./types";

function daysBetween(from: string, to: string) {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

const ACTIVITY: Record<Profile["activity"], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_ADJUST: Record<Profile["goal_type"], number> = { gain: 300, lose: -500, maintain: 0 };

export function bmi(weightLb: number, heightIn: number) {
  return (703 * weightLb) / (heightIn * heightIn);
}

export function bmiCategory(value: number) {
  if (value < 18.5) return "Underweight";
  if (value < 25) return "Healthy";
  if (value < 30) return "Overweight";
  return "Obese";
}

export interface Targets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  suggested: boolean;
}

/** Fastest pace we'll plan for: ~1 lb/week gaining, 1% of body weight (1–2 lb) losing. */
const MAX_GAIN_RATE = 1;
const maxLossRate = (weightLb: number) => Math.max(1, Math.min(2, weightLb * 0.01));

export interface GoalPace {
  /** Weekly weight change the targets are built for, in lb. */
  rate: number;
  /** Pace the goal date would need, or null when there is no usable goal date. */
  needed: number | null;
  /** The goal date needs a faster pace than is safe, so `rate` is capped. */
  capped: boolean;
  /** When the goal is reached at `rate`, if a goal date is in use. */
  projected: string | null;
}

/** Weekly pace toward goal weight: from the goal date when one is set, else the default for the goal type. */
export function goalPace(p: Profile, weightLb: number | null, today: string): GoalPace {
  const fallback = { rate: GOAL_RATE[p.goal_type], needed: null, capped: false, projected: null };
  if (!p.goal_date || weightLb == null || p.goal_date <= today) return fallback;
  const diff = p.goal_weight_lb - weightLb;
  if (Math.abs(diff) < 0.5) return { rate: 0, needed: 0, capped: false, projected: null };
  const weeks = daysBetween(today, p.goal_date) / 7;
  const needed = diff / weeks;
  const cap = needed > 0 ? MAX_GAIN_RATE : -maxLossRate(weightLb);
  const capped = Math.abs(needed) > Math.abs(cap);
  const rate = Math.round((capped ? cap : needed) * 100) / 100;
  return { rate, needed: Math.round(needed * 100) / 100, capped, projected: capped ? addDays(today, Math.ceil((diff / rate) * 7)) : p.goal_date };
}

/** Maintenance calories from the Mifflin-St Jeor BMR × activity level. */
export function formulaMaintenance(p: Profile, weightLb: number) {
  const kg = weightLb * 0.453592;
  const cm = p.height_in * 2.54;
  const age = new Date().getFullYear() - p.birth_year;
  const bmr = 10 * kg + 6.25 * cm - 5 * age + (p.sex === "male" ? 5 : -161);
  return bmr * ACTIVITY[p.activity];
}

export interface Measured {
  /** Calories you burn per day, measured from intake and weight change. */
  kcal: number;
  /** Days with complete food logs behind the number. */
  days: number;
}

/** Window and minimum data for a measured maintenance. */
export const MEASURE_DAYS = 21;
const MIN_LOGGED_DAYS = 10;
const MIN_WEIGH_INS = 6;
const MIN_SPAN_DAYS = 14;

/**
 * Maintenance measured from your own data (energy balance): average intake
 * minus the energy in your weight change. Over the last 21 days before `today`,
 * a pound of change is ~3,500 kcal, and weight change is the least-squares slope
 * of the weigh-ins so single readings barely matter. Days logged under half of
 * the formula estimate count as incomplete and are skipped. Returns null with
 * too little data, or when the result is more than 35% off the formula, which
 * points to missed logging rather than an unusual metabolism.
 */
export function measuredMaintenance(
  intake: { date: string; calories: number }[],
  weighIns: { date: string; weight_lb: number }[],
  today: string,
  formula: number,
): Measured | null {
  const from = addDays(today, -MEASURE_DAYS);
  const inWindow = (d: string) => d >= from && d < today;
  const logged = intake.filter((d) => inWindow(d.date) && d.calories >= formula * 0.5);
  const weights = weighIns.filter((w) => inWindow(w.date));
  if (logged.length < MIN_LOGGED_DAYS || weights.length < MIN_WEIGH_INS) return null;
  if (daysBetween(weights[0].date, weights.at(-1)!.date) < MIN_SPAN_DAYS) return null;

  const xs = weights.map((w) => daysBetween(from, w.date));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = weights.reduce((a, w) => a + w.weight_lb, 0) / weights.length;
  const lbPerDay = xs.reduce((a, x, i) => a + (x - mx) * (weights[i].weight_lb - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const avgIntake = logged.reduce((a, d) => a + d.calories, 0) / logged.length;
  const kcal = avgIntake - lbPerDay * 3500;
  if (Math.abs(kcal - formula) > formula * 0.35) return null;
  return { kcal: Math.round(kcal / 10) * 10, days: logged.length };
}

/**
 * Daily targets: maintenance (measured when there's enough data, else the
 * formula) adjusted for goal pace; 25% of calories from fat.
 */
export function suggestedTargets(p: Profile, weightLb: number, pace?: GoalPace, measured?: Measured | null): Omit<Targets, "suggested"> {
  // 1 lb/week ≈ 500 kcal/day. Without a goal date, keep the standard surplus/deficit.
  const adjust = pace?.needed != null ? pace.rate * 500 : GOAL_ADJUST[p.goal_type];
  const calories = Math.round(((measured?.kcal ?? formulaMaintenance(p, weightLb)) + adjust) / 10) * 10;
  const losing = pace?.needed != null ? pace.rate < 0 : p.goal_type === "lose";
  const protein = Math.round(0.9 * (losing ? p.goal_weight_lb : weightLb));
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories, protein, carbs, fat };
}

export function targetsFor(p: Profile, weightLb: number, pace?: GoalPace, measured?: Measured | null): Targets {
  const s = suggestedTargets(p, weightLb, pace, measured);
  return {
    calories: p.calorie_target ?? s.calories,
    protein: p.protein_g ?? s.protein,
    carbs: p.carbs_g ?? s.carbs,
    fat: p.fat_g ?? s.fat,
    suggested: p.calorie_target == null,
  };
}

/**
 * Smoothed weight: each day the trend moves 10% of the way toward the scale
 * reading (an exponential moving average), so water and food swings mostly
 * cancel out. Gaps between weigh-ins count as multiple days.
 */
export function weightTrend(points: { date: string; weight_lb: number }[]): { date: string; value: number }[] {
  let trend: number | null = null;
  let prev: string | null = null;
  return points.map((p) => {
    if (trend == null || prev == null) trend = p.weight_lb;
    else {
      const days = Math.max(1, daysBetween(prev, p.date));
      trend += (1 - 0.9 ** days) * (p.weight_lb - trend);
    }
    prev = p.date;
    return { date: p.date, value: Math.round(trend * 10) / 10 };
  });
}

/** Waist ÷ height. Under 0.5 is the usual healthy cutoff. */
export function waistToHeight(waistIn: number, heightIn: number) {
  return waistIn / heightIn;
}

/** Target weekly weight change in lb for each goal. */
export const GOAL_RATE: Record<Profile["goal_type"], number> = { gain: 0.5, lose: -1, maintain: 0 };


/**
 * Approximate median VO2 max (ml/kg/min) for age and sex: FRIEND registry
 * treadmill medians (Kaminsky 2015) at ages 20–29 and 70–79, interpolated at
 * the ~10%/decade decline it reports between them.
 */
export function vo2Median(age: number, sex: "male" | "female") {
  const [young, old] = sex === "female" ? [37.6, 18.3] : [48.0, 24.4];
  const t = Math.min(1, Math.max(0, (age - 25) / 50));
  return Math.round(young * (old / young) ** t);
}

/**
 * Epley estimated one-rep max. With reps in reserve, the set could have gone
 * reps + rir, which estimates the max better than reps alone.
 */
export function estimated1RM(weight: number, reps: number, rir?: number | null) {
  const total = reps + Math.min(5, Math.max(0, rir ?? 0));
  return total <= 1 ? weight : weight * (1 + total / 30);
}

export interface StrengthStatus {
  /** Best e1RM of the last three sessions. */
  current: number | null;
  target: number;
  /** Recent trend from the last 8 weeks, lb e1RM per week. */
  weeklyGain: number | null;
  neededPerWeek: number | null;
  /** When the trend reaches the target, if it's rising. */
  projected: string | null;
  status: "achieved" | "on_pace" | "behind" | "no_data" | "past";
}

/** Compare an exercise's e1RM history (one point per session, date-sorted) to a dated target. */
export function strengthStatus(points: { date: string; value: number }[], target: number, targetDate: string, today: string): StrengthStatus {
  const base = { target, weeklyGain: null, neededPerWeek: null, projected: null };
  if (points.length === 0) return { ...base, current: null, status: "no_data" };
  const current = Math.round(Math.max(...points.slice(-3).map((p) => p.value)));
  if (current >= target) return { ...base, current, status: "achieved" };

  // Least-squares slope over the last 8 weeks, if there's enough spread to mean anything.
  const recent = points.filter((p) => daysBetween(p.date, today) <= 56);
  let weeklyGain: number | null = null;
  if (recent.length >= 3 && daysBetween(recent[0].date, recent.at(-1)!.date) >= 14) {
    const xs = recent.map((p) => daysBetween(recent[0].date, p.date));
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = recent.reduce((a, p) => a + p.value, 0) / recent.length;
    const slope = xs.reduce((a, x, i) => a + (x - mx) * (recent[i].value - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    weeklyGain = Math.round(slope * 7 * 10) / 10;
  }
  const projected = weeklyGain && weeklyGain > 0 ? addDays(today, Math.ceil(((target - current) / weeklyGain) * 7)) : null;
  if (targetDate <= today) return { ...base, current, weeklyGain, projected, status: "past" };
  const neededPerWeek = Math.round(((target - current) / (daysBetween(today, targetDate) / 7)) * 10) / 10;
  const status = weeklyGain == null ? "no_data" : weeklyGain >= neededPerWeek * 0.9 ? "on_pace" : "behind";
  return { target, current, weeklyGain, neededPerWeek, projected, status };
}
