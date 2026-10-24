// Starting weights and session-to-session progression. Deterministic, no AI.
//
// Starting point: beginner strength standards expressed as a one-rep max per
// pound of body weight (roughly the "beginner" tier of common lifting
// standards), scaled by sex, age and experience. Body weight above a BMI of 25
// only counts at 25%, so fat mass doesn't inflate loads. The prescribed weight
// is what that 1RM allows for the target reps with ~3 reps in reserve, rounded
// DOWN to loads you can actually make. Pure module: used by server pages and
// the Settings program preview.

export type Implement = "barbell" | "dumbbell" | "kettlebell" | "machine" | "cable" | "bodyweight";
type Region = "upper" | "lower";

interface LoadModel {
  implement: Implement;
  region: Region;
  /** Male beginner 1RM ÷ body weight. Dumbbells: per hand (or the one bell for goblet/overhead moves). */
  ratio: number;
}

const MODELS: Record<string, LoadModel> = {
  "barbell back squat": { implement: "barbell", region: "lower", ratio: 0.75 },
  "smith machine squat": { implement: "machine", region: "lower", ratio: 0.7 },
  "leg press": { implement: "machine", region: "lower", ratio: 1.5 },
  "goblet squat": { implement: "dumbbell", region: "lower", ratio: 0.25 },
  "kettlebell goblet squat": { implement: "kettlebell", region: "lower", ratio: 0.25 },
  "deadlift": { implement: "barbell", region: "lower", ratio: 1.0 },
  "romanian deadlift": { implement: "barbell", region: "lower", ratio: 0.75 },
  "dumbbell romanian deadlift": { implement: "dumbbell", region: "lower", ratio: 0.25 },
  "kettlebell swing": { implement: "kettlebell", region: "lower", ratio: 0.25 },
  "bulgarian split squat": { implement: "dumbbell", region: "lower", ratio: 0.12 },
  "dumbbell walking lunge": { implement: "dumbbell", region: "lower", ratio: 0.15 },
  "barbell reverse lunge": { implement: "barbell", region: "lower", ratio: 0.4 },
  "leg curl": { implement: "machine", region: "lower", ratio: 0.4 },
  "leg extension": { implement: "machine", region: "lower", ratio: 0.5 },
  "cable pull-through": { implement: "cable", region: "lower", ratio: 0.3 },
  "standing calf raise": { implement: "machine", region: "lower", ratio: 0.75 },
  "dumbbell calf raise": { implement: "dumbbell", region: "lower", ratio: 0.2 },
  "bench press": { implement: "barbell", region: "upper", ratio: 0.5 },
  "dumbbell bench press": { implement: "dumbbell", region: "upper", ratio: 0.2 },
  "machine chest press": { implement: "machine", region: "upper", ratio: 0.5 },
  "smith machine bench press": { implement: "machine", region: "upper", ratio: 0.45 },
  "dumbbell floor press": { implement: "dumbbell", region: "upper", ratio: 0.18 },
  "incline dumbbell press": { implement: "dumbbell", region: "upper", ratio: 0.17 },
  "incline bench press": { implement: "barbell", region: "upper", ratio: 0.4 },
  "cable fly": { implement: "cable", region: "upper", ratio: 0.08 },
  "overhead press": { implement: "barbell", region: "upper", ratio: 0.35 },
  "dumbbell shoulder press": { implement: "dumbbell", region: "upper", ratio: 0.14 },
  "machine shoulder press": { implement: "machine", region: "upper", ratio: 0.3 },
  "kettlebell press": { implement: "kettlebell", region: "upper", ratio: 0.12 },
  "barbell row": { implement: "barbell", region: "upper", ratio: 0.4 },
  "seated cable row": { implement: "cable", region: "upper", ratio: 0.45 },
  "one-arm dumbbell row": { implement: "dumbbell", region: "upper", ratio: 0.2 },
  "lat pulldown": { implement: "cable", region: "upper", ratio: 0.45 },
  "dumbbell pullover": { implement: "dumbbell", region: "upper", ratio: 0.15 },
  "dumbbell lateral raise": { implement: "dumbbell", region: "upper", ratio: 0.05 },
  "cable lateral raise": { implement: "cable", region: "upper", ratio: 0.04 },
  "face pull": { implement: "cable", region: "upper", ratio: 0.15 },
  "dumbbell rear delt fly": { implement: "dumbbell", region: "upper", ratio: 0.05 },
  "dumbbell curl": { implement: "dumbbell", region: "upper", ratio: 0.1 },
  "barbell curl": { implement: "barbell", region: "upper", ratio: 0.25 },
  "cable curl": { implement: "cable", region: "upper", ratio: 0.2 },
  "cable triceps pushdown": { implement: "cable", region: "upper", ratio: 0.25 },
  "dumbbell overhead triceps extension": { implement: "dumbbell", region: "upper", ratio: 0.12 },
  "cable crunch": { implement: "cable", region: "upper", ratio: 0.3 },
  // Carries are timed ("reps" = seconds). Ratio is set so the 30-second start is
  // about a quarter of body weight per hand, a common beginner carry load.
  "farmer's carry (seconds)": { implement: "dumbbell", region: "lower", ratio: 0.5 },
  "kettlebell farmer's carry (seconds)": { implement: "kettlebell", region: "lower", ratio: 0.5 },
};

/** Cardio is logged as minutes in "reps" and isn't progressed by load. */
export const isCardio = (exercise: string) => /^(zone 2|intervals)/i.test(exercise.trim());

/** "3×8", "45 min" for cardio, "3×30 s" for timed holds. */
export function formatTarget(exercise: string, sets: number, reps: number) {
  if (isCardio(exercise)) return `${reps} min`;
  return `${sets}×${reps}${/\(seconds\)/i.test(exercise) ? " s" : ""}`;
}

/** Age-predicted max heart rate (Tanaka: 208 − 0.7 × age). */
export const maxHeartRate = (age: number) => Math.round(208 - 0.7 * age);

function cardioPrescription(exercise: string, minutes: number, age: number): Prescription {
  const max = maxHeartRate(age);
  const pct = (p: number) => Math.round((max * p) / 5) * 5;
  const intervals = /^intervals/i.test(exercise.trim());
  return {
    weight: null, reps: minutes, kind: "cardio", implement: null,
    note: intervals
      ? `4 × 4 min hard (HR ${pct(0.85)}+), 3 min easy between`
      : `HR ~${pct(0.6)}–${pct(0.7)}, or as hard as you can go while still talking in sentences`,
  };
}

/** Exercises with no external load: progress by reps. */
const BODYWEIGHT = /push-up|pull-up|chin-up|inverted row|\bdip\b|bodyweight|glute bridge|walking lunge$|plank|leg raise|sliding leg curl|pike|calf raise$|band |dead hang/i;

/** Common names people log lifts under → the model's name. */
const ALIASES: [RegExp, string][] = [
  [/^(barbell )?(back )?squats?$/, "barbell back squat"],
  [/^(flat )?(barbell )?bench( press)?$/, "bench press"],
  [/^incline (barbell )?bench( press)?$/, "incline bench press"],
  [/^(conventional |barbell )?deadlifts?$/, "deadlift"],
  [/^(rdls?|stiff[- ]leg(ged)? deadlifts?)$/, "romanian deadlift"],
  [/^(ohp|military press|(standing )?(barbell )?overhead press|barbell shoulder press)$/, "overhead press"],
  [/^(bent[- ]over )?(barbell )?rows?$/, "barbell row"],
  [/^(seated )?cable rows?$/, "seated cable row"],
  [/^(lat )?pull-?downs?$/, "lat pulldown"],
  [/^(dumbbell )?curls?$/, "dumbbell curl"],
  [/^triceps? push-?downs?$/, "cable triceps pushdown"],
  [/^(dumbbell )?lateral raises?$/, "dumbbell lateral raise"],
  [/^(machine )?leg curls?$/, "leg curl"],
  [/^(machine )?leg extensions?$/, "leg extension"],
  [/^chest press$/, "machine chest press"],
  [/^(dumbbell )?(one[- ]arm |single[- ]arm )?rows?$/, "one-arm dumbbell row"],
];

function canonical(exercise: string) {
  let key = exercise.trim().toLowerCase().replace(/\s+/g, " ").replace(/^db /, "dumbbell ").replace(/^bb /, "barbell ");
  for (const [re, name] of ALIASES) if (re.test(key)) { key = name; break; }
  return key;
}

export function loadModel(exercise: string): LoadModel | "bodyweight" | null {
  const key = canonical(exercise);
  if (MODELS[key]) return MODELS[key];
  if (BODYWEIGHT.test(key)) return "bodyweight";
  return null;
}

export type Experience = "beginner" | "intermediate" | "advanced";

export interface Lifter {
  sex: "male" | "female";
  age: number;
  heightIn: number;
  weightLb: number;
  experience: Experience;
  /** Heaviest dumbbell available, from equipment notes, if known. */
  maxDumbbell: number | null;
}

/** Body weight used for strength standards: weight above BMI 25 counts at 25%. */
export function strengthBodyweight(weightLb: number, heightIn: number) {
  const atBmi25 = (25 * heightIn * heightIn) / 703;
  return weightLb <= atBmi25 ? weightLb : atBmi25 + 0.25 * (weightLb - atBmi25);
}

const EXPERIENCE_FACTOR: Record<Experience, number> = { beginner: 1, intermediate: 1.3, advanced: 1.6 };

/** Masters lifters: about 1% less per year past 35, never below 65%. */
export function ageFactor(age: number) {
  return age <= 35 ? 1 : Math.max(0.65, 1 - 0.01 * (age - 35));
}

const DUMBBELLS = [5, 8, 10, 12, 15, 17.5, 20, 22.5, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100];
const KETTLEBELLS = [9, 13, 18, 26, 35, 44, 53, 62, 70, 80, 88]; // 4–40 kg bells in lb

/** Round down to a load you can actually set up. */
export function roundLoad(lb: number, implement: Implement, maxDumbbell: number | null = null): number {
  if (implement === "barbell") return Math.max(45, Math.floor(lb / 5) * 5); // empty bar is the floor
  if (implement === "machine" || implement === "cable") return Math.max(5, Math.floor(lb / 5) * 5);
  const sizes = implement === "kettlebell" ? KETTLEBELLS : DUMBBELLS.filter((d) => maxDumbbell == null || d <= maxDumbbell);
  return [...sizes].reverse().find((s) => s <= lb) ?? sizes[0] ?? 5;
}

function nextSize(lb: number, implement: Implement, maxDumbbell: number | null) {
  const sizes = implement === "kettlebell" ? KETTLEBELLS : DUMBBELLS.filter((d) => maxDumbbell == null || d <= maxDumbbell);
  return sizes.find((s) => s > lb) ?? null;
}

/** Estimated beginner-safe 1RM for a modeled lift. */
export function estimated1RMFor(model: LoadModel, l: Lifter) {
  const sexFactor = l.sex === "female" ? (model.region === "lower" ? 0.7 : 0.55) : 1;
  return model.ratio * strengthBodyweight(l.weightLb, l.heightIn) * sexFactor * ageFactor(l.age) * EXPERIENCE_FACTOR[l.experience];
}

export interface Prescription {
  /** Weight to use, lb (per hand for dumbbells). null = bodyweight or unknown exercise. */
  weight: number | null;
  /** Target reps for each set (may be raised for bodyweight work). */
  reps: number;
  kind: "start" | "increase" | "repeat" | "deload" | "return" | "reps" | "unknown" | "cardio";
  /** One-line instruction for the lifter. */
  note: string;
  implement: Implement | null;
}

/** Dumbbell/kettlebell lifts done holding one weight, so the load isn't per hand. */
const ONE_WEIGHT = /goblet|swing|pullover|triceps extension|one-arm|single-arm/i;

export const describeLoad = (weight: number, implement: Implement | null, exercise = "") =>
  implement === "dumbbell" ? `${weight} lb dumbbell${ONE_WEIGHT.test(exercise) ? "" : "s"}`
  : implement === "kettlebell" ? `${weight} lb kettlebell${/farmer/i.test(exercise) ? "s" : ""}` : `${weight} lb`;

/** First-session weight: target reps with ~3 left in reserve. */
export function startingWeight(exercise: string, targetReps: number, l: Lifter): Prescription {
  if (isCardio(exercise)) return cardioPrescription(exercise, targetReps, l.age);
  const model = loadModel(exercise);
  if (model === "bodyweight") {
    return { weight: null, reps: targetReps, kind: "reps", implement: "bodyweight", note: "Bodyweight" };
  }
  if (!model) {
    return { weight: null, reps: targetReps, kind: "unknown", implement: null, note: `Use a weight you could do ${targetReps + 3} times` };
  }
  const oneRm = estimated1RMFor(model, l);
  const raw = oneRm / (1 + (targetReps + 3) / 30);
  const weight = roundLoad(raw, model.implement, l.maxDumbbell);
  const emptyBar = model.implement === "barbell" && raw < 45;
  return {
    weight,
    reps: targetReps,
    kind: "start",
    implement: model.implement,
    note: emptyBar
      ? "Empty bar: learn the movement"
      : "Starting weight",
  };
}

export interface SessionSets {
  date: string;
  /** rir = reps in reserve (0 = failure); null/undefined if not rated. */
  sets: { weight_lb: number; reps: number; rir?: number | null }[];
}

/** Reps-in-reserve ratings of a session's top-weight sets. */
function workingRir(s: SessionSets): number[] {
  const top = Math.max(...s.sets.map((x) => x.weight_lb));
  return s.sets.filter((x) => x.weight_lb === top && x.rir != null).map((x) => x.rir!);
}

function daysBetween(a: string, b: string) {
  return Math.abs(Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
}

/** Did a session hit every planned set at the target reps, at its top weight? */
function hitAll(s: SessionSets, plannedSets: number, targetReps: number) {
  const top = Math.max(...s.sets.map((x) => x.weight_lb));
  const working = s.sets.filter((x) => x.weight_lb === top);
  return working.length >= plannedSets && working.every((x) => x.reps >= targetReps);
}

/**
 * Next session's prescription from history (most recent session last).
 * Add weight after a clean session, repeat after a miss, drop 10% after two
 * misses in a row at the same weight, and come back 10% lighter after 14+ days off.
 */
export function prescribe(exercise: string, plannedSets: number, targetReps: number, history: SessionSets[], today: string, l: Lifter): Prescription {
  if (isCardio(exercise)) return cardioPrescription(exercise, targetReps, l.age);
  const last = history.at(-1);
  if (!last || last.sets.length === 0) return startingWeight(exercise, targetReps, l);

  const model = loadModel(exercise);
  const top = Math.max(...last.sets.map((s) => s.weight_lb));
  const implement: Implement | null = model === "bodyweight" ? "bodyweight" : model?.implement ?? (top > 0 ? "machine" : null);

  // Bodyweight (or logged at 0 lb): progress by reps, up to 20 a set.
  if (implement === "bodyweight" || top <= 0) {
    const bestReps = Math.min(...last.sets.slice(0, plannedSets).map((s) => s.reps));
    if (hitAll(last, plannedSets, targetReps)) {
      // Timed holds ("(seconds)") step by 5 s up to 2 minutes; reps by 1 up to 20.
      const timed = /\(seconds\)/i.test(exercise);
      const [step, cap] = timed ? [5, 120] : [1, 20];
      const next = Math.min(cap, Math.max(targetReps, bestReps) + step);
      return {
        weight: null, reps: next, kind: "reps", implement,
        note: next >= cap ? (timed ? "2 min: add weight or a harder version" : "20 reps: try a harder version") : timed ? "↑ +5 s" : "↑ +1 rep",
      };
    }
    return { weight: null, reps: targetReps, kind: "repeat", implement, note: "Same reps" };
  }

  const round = (w: number) => roundLoad(w, implement ?? "machine", l.maxDumbbell);
  const gap = daysBetween(last.date, today);
  if (gap >= 14) {
    const w = round(top * 0.9);
    return { weight: w, reps: targetReps, kind: "return", implement, note: `−10% after ${Math.round(gap)} days off` };
  }

  if (hitAll(last, plannedSets, targetReps)) {
    // Effort ratings refine the jump: reps hit at failure aren't owned yet;
    // reps hit with 4+ in the tank mean the weight was too light.
    const rir = workingRir(last);
    const avgRir = rir.length ? rir.reduce((a, b) => a + b, 0) / rir.length : null;
    if (rir.length && Math.min(...rir) === 0) {
      return { weight: top, reps: targetReps, kind: "repeat", implement, note: "Repeat: a set hit failure" };
    }
    const easy = avgRir != null && avgRir >= 4;

    let next: number | null;
    if (implement === "dumbbell" || implement === "kettlebell") {
      next = nextSize(top, implement, l.maxDumbbell);
      if (next != null && easy) next = nextSize(next, implement, l.maxDumbbell) ?? next;
      if (next == null) {
        return { weight: top, reps: Math.min(20, targetReps + 2), kind: "reps", implement, note: `Heaviest ${implement}: +2 reps` };
      }
    } else {
      // Lower body moves bigger loads; beginners under 50 can add 10 lb there.
      const lower = model && model !== "bodyweight" && model.region === "lower";
      const step = lower && l.experience === "beginner" && l.age < 50 ? 10 : 5;
      next = top + step * (easy ? 2 : 1);
    }
    return {
      weight: next, reps: targetReps, kind: "increase", implement,
      note: easy
        ? `↑ +${next - top} lb (felt easy)`
        : `↑ +${next - top} lb`,
    };
  }

  const prev = history.at(-2);
  const stalled = prev && Math.max(...prev.sets.map((s) => s.weight_lb)) === top && !hitAll(prev, plannedSets, targetReps);
  if (stalled) {
    const w = round(top * 0.9);
    return { weight: w, reps: targetReps, kind: "deload", implement, note: "−10% after two misses" };
  }
  return { weight: top, reps: targetReps, kind: "repeat", implement, note: "Same weight until all reps" };
}

/** Prescription for a session on `date`, from logged sets (any order) before that date. */
export function prescribeFrom(
  rows: { exercise: string; date: string; weight_lb: number; reps: number; rir: number | null }[],
  e: { exercise: string; sets: number; reps: number },
  date: string,
  l: Lifter,
): Prescription {
  const mine = rows.filter((r) => r.date < date && r.exercise.toLowerCase() === e.exercise.toLowerCase());
  const dates = [...new Set(mine.map((r) => r.date))].sort().slice(-2);
  return prescribe(e.exercise, e.sets, e.reps, dates.map((d) => ({ date: d, sets: mine.filter((r) => r.date === d) })), date, l);
}

/** Compact load for lists: "135 lb", "25 lb each" when holding one in each hand, or null. */
export const shortLoad = (p: Prescription, exercise: string) =>
  p.weight == null ? null
  : `${p.weight} lb${(p.implement === "dumbbell" && !ONE_WEIGHT.test(exercise)) || (p.implement === "kettlebell" && /farmer/i.test(exercise)) ? " each" : ""}`;

/**
 * Advice for the next set today, from the last set logged. Aims for each set to
 * end with 1–3 reps left: adjust when a set is clearly too easy or too hard.
 */
export function nextSetHint(last: { weight_lb: number; reps: number; rir: number | null } | undefined, targetReps: number, implement: Implement | null, maxDumbbell: number | null): { weight: number; note: string } | null {
  if (!last || last.rir == null || last.weight_lb <= 0 || !implement || implement === "bodyweight") return null;
  const w = last.weight_lb;
  if (last.rir >= 4 && last.reps >= targetReps) {
    const up = implement === "dumbbell" || implement === "kettlebell" ? nextSize(w, implement, maxDumbbell) : w + 5;
    return up ? { weight: up, note: "↑ felt easy" } : null;
  }
  if (last.rir === 0 && last.reps < targetReps) {
    const down = roundLoad(w * 0.9, implement, maxDumbbell);
    return down < w ? { weight: down, note: "↓ hit failure early" } : null;
  }
  return null;
}

/** Ramp-up sets before the first heavy barbell lift: empty bar, then ~50% and ~75%. */
export function warmupSets(weight: number | null, implement: Implement | null): { weight: number; reps: number }[] {
  if (implement !== "barbell" || weight == null || weight < 95) return [];
  const sets = [{ weight: 45, reps: 10 }, { weight: roundLoad(weight * 0.5, "barbell"), reps: 5 }, { weight: roundLoad(weight * 0.75, "barbell"), reps: 3 }];
  return sets.filter((s, i) => i === 0 || (s.weight > sets[i - 1].weight && s.weight < weight));
}

/** "dumbbells go up to 50 lb" → 50 */
export function parseMaxDumbbell(notes: string): number | null {
  const m = notes.match(/dumbbells?[^.\d]{0,30}?(\d{1,3}(?:\.\d)?)\s*(?:lb|lbs|pounds)?/i);
  return m ? Number(m[1]) : null;
}
