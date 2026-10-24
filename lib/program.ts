// Rule-based weekly program from the equipment you have. No AI: each movement
// pattern has options in order of preference, and the first one your equipment
// allows is used. Pure module, so the Settings page can preview it live.

export interface ProgramDay {
  weekday: number; // 0 = Sunday
  name: string;
  exercises: { exercise: string; sets: number; reps: number }[];
}

type Pattern =
  | "squat" | "hinge" | "lunge" | "leg_curl" | "calf"
  | "h_push" | "incline" | "v_push" | "h_pull" | "v_pull"
  | "delts" | "rear_delts" | "biceps" | "triceps" | "core";

/** Options per pattern, best first. `needs` must all be owned ("full_gym" owns everything). */
const LIBRARY: Record<Pattern, { name: string; needs: string[] }[]> = {
  squat: [
    { name: "Barbell back squat", needs: ["barbell", "rack"] },
    { name: "Smith machine squat", needs: ["smith"] },
    { name: "Leg press", needs: ["machines"] },
    { name: "Goblet squat", needs: ["dumbbells"] },
    { name: "Kettlebell goblet squat", needs: ["kettlebells"] },
    { name: "Bodyweight squat", needs: [] },
  ],
  hinge: [
    { name: "Romanian deadlift", needs: ["barbell"] },
    { name: "Dumbbell Romanian deadlift", needs: ["dumbbells"] },
    { name: "Kettlebell swing", needs: ["kettlebells"] },
    { name: "Single-leg glute bridge", needs: [] },
  ],
  lunge: [
    { name: "Bulgarian split squat", needs: ["dumbbells", "bench"] },
    { name: "Dumbbell walking lunge", needs: ["dumbbells"] },
    { name: "Barbell reverse lunge", needs: ["barbell", "rack"] },
    { name: "Walking lunge", needs: [] },
  ],
  leg_curl: [
    { name: "Leg curl", needs: ["machines"] },
    { name: "Cable pull-through", needs: ["cables"] },
    { name: "Band leg curl", needs: ["bands"] },
    { name: "Sliding leg curl (towel on a smooth floor)", needs: [] },
  ],
  calf: [
    { name: "Standing calf raise", needs: ["machines"] },
    { name: "Dumbbell calf raise", needs: ["dumbbells"] },
    { name: "Single-leg calf raise", needs: [] },
  ],
  h_push: [
    { name: "Bench press", needs: ["barbell", "bench", "rack"] },
    { name: "Dumbbell bench press", needs: ["dumbbells", "bench"] },
    { name: "Machine chest press", needs: ["machines"] },
    { name: "Smith machine bench press", needs: ["smith", "bench"] },
    { name: "Dumbbell floor press", needs: ["dumbbells"] },
    { name: "Push-up", needs: [] },
  ],
  incline: [
    { name: "Incline dumbbell press", needs: ["dumbbells", "bench"] },
    { name: "Incline bench press", needs: ["barbell", "bench", "rack"] },
    { name: "Cable fly", needs: ["cables"] },
    { name: "Dip", needs: ["dip_station"] },
    { name: "Feet-elevated push-up", needs: [] },
  ],
  v_push: [
    { name: "Overhead press", needs: ["barbell", "rack"] },
    { name: "Dumbbell shoulder press", needs: ["dumbbells"] },
    { name: "Machine shoulder press", needs: ["machines"] },
    { name: "Kettlebell press", needs: ["kettlebells"] },
    { name: "Band overhead press", needs: ["bands"] },
    { name: "Pike push-up", needs: [] },
  ],
  h_pull: [
    { name: "Barbell row", needs: ["barbell"] },
    { name: "Seated cable row", needs: ["cables"] },
    { name: "One-arm dumbbell row", needs: ["dumbbells"] },
    { name: "Inverted row", needs: ["trx"] },
    { name: "Band row", needs: ["bands"] },
    { name: "Inverted row (under a sturdy table)", needs: [] },
  ],
  v_pull: [
    { name: "Pull-up", needs: ["pullup_bar"] },
    { name: "Lat pulldown", needs: ["cables"] },
    { name: "Lat pulldown", needs: ["machines"] },
    { name: "Band lat pulldown", needs: ["bands"] },
    { name: "Dumbbell pullover", needs: ["dumbbells", "bench"] },
  ],
  delts: [
    { name: "Dumbbell lateral raise", needs: ["dumbbells"] },
    { name: "Cable lateral raise", needs: ["cables"] },
    { name: "Band lateral raise", needs: ["bands"] },
  ],
  rear_delts: [
    { name: "Face pull", needs: ["cables"] },
    { name: "Band face pull", needs: ["bands"] },
    { name: "Dumbbell rear delt fly", needs: ["dumbbells"] },
  ],
  biceps: [
    { name: "Dumbbell curl", needs: ["dumbbells"] },
    { name: "Barbell curl", needs: ["barbell"] },
    { name: "Cable curl", needs: ["cables"] },
    { name: "Band curl", needs: ["bands"] },
    { name: "Chin-up", needs: ["pullup_bar"] },
  ],
  triceps: [
    { name: "Cable triceps pushdown", needs: ["cables"] },
    { name: "Dumbbell overhead triceps extension", needs: ["dumbbells"] },
    { name: "Dip", needs: ["dip_station"] },
    { name: "Band triceps pushdown", needs: ["bands"] },
    { name: "Diamond push-up", needs: [] },
  ],
  core: [
    { name: "Hanging leg raise", needs: ["pullup_bar"] },
    { name: "Cable crunch", needs: ["cables"] },
    { name: "Plank (seconds)", needs: [] },
  ],
};

/** Logged as "reps" = seconds held. */
const PLANK = "Plank (seconds)";

/** Cardio, logged as "reps" = minutes (see isCardio in loads.ts). */
export const ZONE2 = "Zone 2 cardio";
const INTERVALS = "Intervals 4×4";

/**
 * Weekly Zone 2 minutes. Guidelines call for 150+ min of moderate cardio;
 * Attia argues for ~180. Beginners build up from 120.
 */
const ZONE2_MINUTES: Record<Experience, number> = { beginner: 120, intermediate: 150, advanced: 180 };

const COMPOUND = new Set<Pattern>(["squat", "hinge", "h_push", "v_push", "h_pull", "v_pull"]);

const SESSIONS: Record<string, Pattern[]> = {
  "Full body A": ["squat", "h_push", "h_pull", "lunge", "delts", "core"],
  "Full body B": ["hinge", "v_push", "v_pull", "squat", "biceps", "triceps"],
  "Full body C": ["squat", "h_push", "v_pull", "hinge", "triceps", "core"],
  "Upper A": ["h_push", "h_pull", "v_push", "v_pull", "delts", "biceps", "triceps"],
  "Upper B": ["v_push", "v_pull", "h_push", "h_pull", "incline", "rear_delts", "triceps", "biceps"],
  "Lower A": ["squat", "hinge", "lunge", "leg_curl", "calf", "core"],
  "Lower B": ["hinge", "squat", "lunge", "leg_curl", "calf", "core"],
  Push: ["h_push", "v_push", "incline", "delts", "triceps", "core"],
  Pull: ["v_pull", "h_pull", "rear_delts", "biceps", "hinge", "core"],
  Legs: ["squat", "hinge", "lunge", "leg_curl", "calf", "core"],
};

/** Weekday layout per training frequency, keeping a day between sessions that share muscles. */
const SPLITS: Record<number, [number, string][]> = {
  1: [[1, "Full body A"]],
  2: [[1, "Full body A"], [4, "Full body B"]],
  3: [[1, "Full body A"], [3, "Full body B"], [5, "Full body C"]],
  4: [[1, "Upper A"], [2, "Lower A"], [4, "Upper B"], [5, "Lower B"]],
  5: [[1, "Upper A"], [2, "Lower A"], [4, "Push"], [5, "Pull"], [6, "Legs"]],
  6: [[1, "Push"], [2, "Pull"], [3, "Legs"], [4, "Push"], [5, "Pull"], [6, "Legs"]],
};

/** Words in a goal lift's name that tell us which pattern it trains. */
const GOAL_PATTERNS: [RegExp, Pattern][] = [
  [/incline/i, "incline"],
  [/bench|chest press|push-?up|floor press/i, "h_push"],
  [/squat|leg press/i, "squat"],
  [/deadlift|rdl|hinge|swing|hip thrust/i, "hinge"],
  [/overhead|ohp|shoulder press|military/i, "v_push"],
  [/pull-?up|chin-?up|pulldown/i, "v_pull"],
  [/row/i, "h_pull"],
  [/curl/i, "biceps"],
  [/dip|tricep/i, "triceps"],
];

export type Experience = "beginner" | "intermediate" | "advanced";

export interface ProgramOptions {
  daysPerWeek: number;
  minutes: number;
  experience: Experience;
  /** Owned EQUIPMENT keys. */
  equipment: string[];
  /** Strength-goal lifts; these replace the default pick for their pattern and train near the goal's reps. */
  goalLifts: { exercise: string; reps: number }[];
}

/** Primary muscle each pattern trains, for counting weekly hard sets. */
const MUSCLE: Record<Pattern, string> = {
  squat: "Quads", lunge: "Quads", hinge: "Hamstrings & glutes", leg_curl: "Hamstrings & glutes", calf: "Calves",
  h_push: "Chest", incline: "Chest", v_push: "Shoulders", delts: "Shoulders", rear_delts: "Shoulders",
  h_pull: "Back", v_pull: "Back", biceps: "Biceps", triceps: "Triceps", core: "Abs",
};
const MAJOR = ["Chest", "Back", "Quads", "Hamstrings & glutes", "Shoulders"];

/**
 * Weekly hard sets per major muscle. Meta-analyses show growth rising with weekly
 * sets with diminishing returns; ~10+ is a common evidence-based target for
 * trained lifters, and beginners grow well on less.
 */
const WEEKLY_SETS_TARGET: Record<Experience, number> = { beginner: 6, intermediate: 10, advanced: 12 };

/**
 * For a saved exercise the equipment no longer allows, the first option for the
 * same pattern that it does. Null when it's still doable or isn't a library exercise.
 */
export function substitute(exercise: string, equipment: string[]): string | null {
  const owned = new Set(equipment);
  const has = (needs: string[]) => owned.has("full_gym") || needs.every((n) => owned.has(n));
  const name = exercise.toLowerCase();
  const options = Object.values(LIBRARY).find((list) => list.some((o) => o.name.toLowerCase() === name));
  const current = options?.find((o) => o.name.toLowerCase() === name);
  if (!options || !current || has(current.needs)) return null;
  return options.find((o) => has(o.needs))?.name ?? null;
}

export function buildProgram(opts: ProgramOptions): { days: ProgramDay[]; notes: string[]; volume: { muscle: string; sets: number; target: number }[] } {
  const owned = new Set(opts.equipment);
  const has = (needs: string[]) => owned.has("full_gym") || needs.every((n) => owned.has(n));
  const notes: string[] = [];

  // Goal lifts take over their pattern everywhere it appears.
  const override = new Map<Pattern, string>();
  const goalReps = new Map<string, number>();
  for (const { exercise: lift, reps } of opts.goalLifts) {
    // Specificity: train a strength goal close to the reps it's measured at (3–6).
    goalReps.set(lift, Math.min(6, Math.max(3, Math.round(reps) || 5)));
    const known = (Object.entries(LIBRARY) as [Pattern, { name: string; needs: string[] }[]][])
      .flatMap(([p, list]) => list.map((o) => ({ p, ...o })))
      .find((o) => o.name.toLowerCase() === lift.toLowerCase());
    const pattern = known?.p ?? GOAL_PATTERNS.find(([re]) => re.test(lift))?.[1];
    if (!pattern) {
      notes.push(`"${lift}" wasn't placed. Add it to a day by hand.`);
      continue;
    }
    if (known && !has(known.needs)) notes.push(`"${lift}" needs ${known.needs.join(" + ")}.`);
    override.set(pattern, lift);
  }

  const pick = (p: Pattern) => {
    const name = override.get(p);
    return name ? { name, needs: ["external load"] } : LIBRARY[p].find((o) => has(o.needs));
  };
  const missing = new Set<Pattern>();
  const weekly = new Map<string, number>();

  const perSession = Math.max(3, Math.min(8, Math.round(opts.minutes / 12) + 1)); // 30 min → 4, 60 → 6, 90 → 8
  const compound = { beginner: [3, 8], intermediate: [4, 6], advanced: [5, 5] }[opts.experience];
  const accessory = { beginner: [2, 12], intermediate: [3, 10], advanced: [3, 12] }[opts.experience];
  // Bodyweight moves can't add plates, so progress them with reps instead.
  const bodyweight = { beginner: [3, 8], intermediate: [3, 12], advanced: [4, 15] }[opts.experience];

  const split = SPLITS[Math.min(6, Math.max(1, Math.round(opts.daysPerWeek)))];
  const days = split.map(([weekday, session]) => {
    const exercises: ProgramDay["exercises"] = [];
    for (const p of SESSIONS[session]) {
      if (exercises.length >= perSession) break;
      const option = pick(p);
      if (!option) { missing.add(p); continue; }
      if (exercises.some((e) => e.exercise === option.name)) continue;
      const isGoal = goalReps.has(option.name);
      const [sets, baseReps] =
        option.name === PLANK ? [3, 30] : option.needs.length === 0 && !isGoal ? bodyweight : (COMPOUND.has(p) && exercises.length < 3) || isGoal ? compound : accessory;
      const reps = isGoal ? goalReps.get(option.name)! : baseReps;
      exercises.push({ exercise: option.name, sets, reps });
      weekly.set(MUSCLE[p], (weekly.get(MUSCLE[p]) ?? 0) + sets);
    }
    return { weekday, name: session, exercises };
  });

  // Grip and stability finishers, once a week each: carries and dead hangs
  // (grip strength tracks with healthy aging). Not counted toward muscle volume.
  const carry = has(["dumbbells"]) ? "Farmer's carry (seconds)" : has(["kettlebells"]) ? "Kettlebell farmer's carry (seconds)" : null;
  const hang = has(["pullup_bar"]) ? "Dead hang (seconds)" : null;
  if (carry) days.at(-1)!.exercises.push({ exercise: carry, sets: 3, reps: 30 });
  if (hang) days[0].exercises.push({ exercise: hang, sets: 3, reps: 20 });

  // Cardio: weekly Zone 2 minutes plus one interval session for VO2 max.
  // Fills non-lifting days first, then tops up with short Zone 2 finishers after lifting.
  const zone2Target = ZONE2_MINUTES[opts.experience];
  const lifting = new Set(days.map((d) => d.weekday));
  // Sunday stays a full rest day.
  const free = [1, 2, 3, 4, 5, 6].filter((d) => !lifting.has(d));
  const cardioDays: ProgramDay[] = [];
  if (!free.length) notes.push("No free day for intervals: train 5 days or fewer to fit one.");
  if (free.length) cardioDays.push({ weekday: free.pop()!, name: "Intervals", exercises: [{ exercise: INTERVALS, sets: 1, reps: 30 }] });
  const per = free.length ? Math.min(60, Math.max(30, Math.ceil(zone2Target / free.length / 5) * 5)) : 0;
  for (const weekday of free) cardioDays.push({ weekday, name: "Zone 2", exercises: [{ exercise: ZONE2, sets: 1, reps: per }] });
  const left = zone2Target - per * free.length;
  if (left > 0) {
    const finisher = Math.min(30, Math.max(15, Math.ceil(left / days.length / 5) * 5));
    for (const d of days) d.exercises.push({ exercise: ZONE2, sets: 1, reps: finisher });
  }
  days.push(...cardioDays);
  days.sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7)); // Monday first
  const zone2 = days.reduce((t, d) => t + d.exercises.filter((e) => e.exercise === ZONE2).reduce((s, e) => s + e.reps, 0), 0);
  if (zone2 < zone2Target) notes.push(`Zone 2 is ${zone2} of ${zone2Target} min/week: add a day or longer sessions.`);

  if (missing.has("v_pull")) notes.push("No pull-up/pulldown option: a pull-up bar or bands would add one.");
  if (missing.has("delts") || missing.has("rear_delts")) notes.push("No shoulder isolation: light dumbbells or bands would add it.");
  if (!opts.equipment.length) notes.push("No equipment checked: bodyweight program.");

  const target = WEEKLY_SETS_TARGET[opts.experience];
  const volume = MAJOR.map((muscle) => ({ muscle, sets: weekly.get(muscle) ?? 0, target }));
  const low = volume.filter((v) => v.sets < target);
  if (low.length) {
    notes.push(`Low volume for ${low.map((v) => v.muscle.toLowerCase()).join(", ")}: add a day or longer sessions.`);
  }
  return { days, notes, volume };
}
