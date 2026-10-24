import { describe, expect, it } from "vitest";
import { describeLoad, formatTarget, prescribe, prescribeFrom, roundLoad, shortLoad, startingWeight, type Lifter } from "../lib/loads";

const lifter: Lifter = { sex: "male", age: 38, heightIn: 70, weightLb: 190, experience: "beginner", maxDumbbell: null };
const sets = (date: string, weight: number, reps: number, n = 3, rir: number | null = 2) =>
  Array.from({ length: n }, () => ({ exercise: "Barbell back squat", date, weight_lb: weight, reps, rir }));

describe("starting weights", () => {
  it("never puts less than the empty bar on a barbell", () => {
    const p = startingWeight("Barbell back squat", 5, { ...lifter, weightLb: 110, sex: "female", age: 70 });
    expect(p.weight).toBeGreaterThanOrEqual(45);
  });

  it("rounds dumbbells down to real sizes and respects the heaviest owned", () => {
    expect(roundLoad(23, "dumbbell")).toBe(22.5);
    expect(roundLoad(80, "dumbbell", 50)).toBe(50);
    expect(roundLoad(30, "kettlebell")).toBe(26);
  });

  it("gives bodyweight moves no load and cardio minutes", () => {
    expect(startingWeight("Push-up", 10, lifter).weight).toBeNull();
    expect(startingWeight("Zone 2 cardio", 45, lifter).kind).toBe("cardio");
  });
});

describe("progression", () => {
  const today = "2026-10-19";

  it("adds weight after hitting every set", () => {
    const p = prescribeFrom(sets("2026-10-16", 135, 5), { exercise: "Barbell back squat", sets: 3, reps: 5 }, today, lifter);
    expect(p.kind).toBe("increase");
    expect(p.weight).toBe(145); // lower body, beginner under 50: +10
  });

  it("repeats after a miss, and drops 10% after two misses at the same weight", () => {
    const miss1 = [...sets("2026-10-12", 135, 5, 2), { exercise: "Barbell back squat", date: "2026-10-12", weight_lb: 135, reps: 3, rir: 0 }];
    const miss2 = [...sets("2026-10-16", 135, 5, 2), { exercise: "Barbell back squat", date: "2026-10-16", weight_lb: 135, reps: 3, rir: 0 }];
    const e = { exercise: "Barbell back squat", sets: 3, reps: 5 };
    expect(prescribeFrom(miss2, e, today, lifter).kind).toBe("repeat");
    const p = prescribeFrom([...miss1, ...miss2], e, today, lifter);
    expect(p.kind).toBe("deload");
    expect(p.weight).toBe(120);
  });

  it("comes back 10% lighter after two weeks off", () => {
    const p = prescribe("Barbell back squat", 3, 5, [{ date: "2026-09-20", sets: sets("2026-09-20", 200, 5) }], today, lifter);
    expect(p.kind).toBe("return");
    expect(p.weight).toBe(180);
  });

  it("ignores sets logged on or after the session date", () => {
    const p = prescribeFrom(sets(today, 300, 5), { exercise: "Barbell back squat", sets: 3, reps: 5 }, today, lifter);
    expect(p.kind).toBe("start");
  });
});

describe("labels", () => {
  it("says 'each' only when holding one in each hand", () => {
    const db = { weight: 40, reps: 10, kind: "start" as const, note: "", implement: "dumbbell" as const };
    expect(shortLoad(db, "Dumbbell bench press")).toBe("40 lb each");
    expect(shortLoad(db, "Goblet squat")).toBe("40 lb");
    expect(describeLoad(40, "dumbbell", "Goblet squat")).toBe("40 lb dumbbell");
    expect(describeLoad(26, "kettlebell", "Kettlebell farmer's carry (seconds)")).toBe("26 lb kettlebells");
  });

  it("formats targets for lifts, cardio and timed holds", () => {
    expect(formatTarget("Bench press", 3, 8)).toBe("3×8");
    expect(formatTarget("Zone 2 cardio", 1, 45)).toBe("45 min");
    expect(formatTarget("Dead hang (seconds)", 3, 20)).toBe("3×20 s");
  });
});
