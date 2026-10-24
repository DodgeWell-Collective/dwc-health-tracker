// Longevity markers stored in the `metric` table: blood work, blood pressure,
// balance and sleep. Ranges are written here from published guidance (no AI).

export type Status = "optimal" | "normal" | "high";

export interface Lab {
  kind: string;
  label: string;
  unit: string;
  /** At or under this is the optimal range (the stricter, Attia-style target). */
  optimal: number;
  /** At or under this is the standard lab "normal" range. */
  normal: number;
  /** How often to retest, in plain words. */
  retest: string;
  why: string;
}

export const LABS: Lab[] = [
  {
    kind: "apob", label: "ApoB", unit: "mg/dL", optimal: 60, normal: 90, retest: "yearly",
    why: "Counts the particles that cause plaque in arteries; the best single cholesterol marker. Labs flag 90–100+; Attia aims under 60, and lower is better.",
  },
  {
    kind: "ldl", label: "LDL-C", unit: "mg/dL", optimal: 70, normal: 100, retest: "yearly",
    why: "The usual cholesterol number. Under 100 is standard; under 70 is the target used for people serious about heart risk. ApoB is the better marker if you can get it.",
  },
  {
    kind: "lpa", label: "Lp(a)", unit: "nmol/L", optimal: 75, normal: 125, retest: "once",
    why: "Mostly genetic and doesn't change with diet or exercise, so test it once. Above 125 nmol/L (about 50 mg/dL) raises heart risk and makes keeping apoB low more important.",
  },
  {
    kind: "a1c", label: "A1c", unit: "%", optimal: 5.4, normal: 5.6, retest: "yearly",
    why: "Average blood sugar over about 3 months. Under 5.7% is normal and 5.7–6.4% is prediabetes; under about 5.4% is the optimal range.",
  },
  {
    kind: "glucose", label: "Fasting glucose", unit: "mg/dL", optimal: 90, normal: 99, retest: "yearly",
    why: "Blood sugar after an overnight fast. Under 100 is normal and 100–125 is prediabetes; under 90 is optimal.",
  },
  {
    kind: "tg", label: "Triglycerides", unit: "mg/dL", optimal: 100, normal: 149, retest: "yearly",
    why: "Blood fats that rise with excess carbs, alcohol and insulin resistance. Under 150 is normal; under 100 is optimal.",
  },
];

/** Blood pressure is stored as two kinds; status uses the worse of the two. */
export const BP = { sys: { optimal: 119, normal: 129 }, dia: { optimal: 79, normal: 79 } };

export function labStatus(value: number, lab: { optimal: number; normal: number }): Status {
  return value <= lab.optimal ? "optimal" : value <= lab.normal ? "normal" : "high";
}

export function bpStatus(sys: number, dia: number): Status {
  const order: Status[] = ["optimal", "normal", "high"];
  return order[Math.max(order.indexOf(labStatus(sys, BP.sys)), order.indexOf(labStatus(dia, BP.dia)))];
}

/**
 * Typical single-leg stand time, eyes open, best of three (Springer et al. 2007),
 * by age. Being unable to hold 10 seconds in mid-life and later is linked to
 * higher mortality (Araujo et al. 2022).
 */
export function balanceNorm(age: number) {
  return age < 40 ? 43 : age < 50 ? 40 : age < 60 ? 37 : age < 70 ? 27 : 15;
}

/** Sleep chips on Today; 7+ hours is the adult recommendation. */
export const SLEEP_CHOICES = [5, 6, 7, 8, 9];
export const SLEEP_GOAL = 7;

/** Water taps on Today, in fl oz. Goal is the common half-your-body-weight rule, kept to 64–128 oz. */
export const WATER_STEPS = [8, 16];
export function waterGoal(weightLb: number) {
  return Math.min(128, Math.max(64, Math.round(weightLb / 2 / 8) * 8));
}
