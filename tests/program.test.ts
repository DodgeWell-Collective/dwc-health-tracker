import { describe, expect, it } from "vitest";
import { buildProgram, substitute } from "../lib/program";
import { formTip } from "../lib/form-tips";

const names = (equipment: string[], daysPerWeek = 3) =>
  buildProgram({ daysPerWeek, minutes: 60, experience: "beginner", equipment, goalLifts: [] })
    .days.flatMap((d) => d.exercises.map((e) => e.exercise));

describe("program matches equipment", () => {
  it("bodyweight only: no equipment-based exercises", () => {
    for (const n of names(["bodyweight"])) expect(n).not.toMatch(/barbell|dumbbell|cable|machine|kettlebell|smith|leg press|leg curl$/i);
  });

  it("dumbbells only: no barbell, cable or machine work", () => {
    for (const n of names(["dumbbells"])) expect(n).not.toMatch(/barbell|cable|machine|smith|leg press|kettlebell/i);
  });

  it("no cable exercises without a cable machine", () => {
    for (const days of [2, 3, 4, 5, 6]) {
      for (const n of names(["barbell", "rack", "bench", "dumbbells", "pullup_bar"], days)) expect(n).not.toMatch(/cable/i);
    }
  });

  it("substitutes an exercise you can't do with one you can", () => {
    expect(substitute("Cable triceps pushdown", ["dumbbells"])).not.toMatch(/cable/i);
  });
});

describe("program shape", () => {
  it("keeps Sunday as rest and includes Zone 2", () => {
    for (const days of [2, 3, 4, 5, 6]) {
      const p = buildProgram({ daysPerWeek: days, minutes: 60, experience: "beginner", equipment: ["full_gym"], goalLifts: [] });
      expect(p.days.some((d) => d.weekday === 0)).toBe(false);
      expect(p.days.flatMap((d) => d.exercises).some((e) => /zone 2/i.test(e.exercise))).toBe(true);
    }
  });

  it("has a form tip for every exercise it can schedule", () => {
    const all = new Set<string>();
    for (const eq of [["full_gym"], ["bodyweight"], ["dumbbells", "bench", "pullup_bar"], ["kettlebells", "bands"]]) {
      for (const days of [2, 3, 4, 5, 6]) for (const n of names(eq, days)) all.add(n);
    }
    for (const n of all) expect(formTip(n), n).not.toBeNull();
  });
});
