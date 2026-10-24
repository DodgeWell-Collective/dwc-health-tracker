import { describe, expect, it } from "vitest";
import { addDays } from "../lib/dates";
import { dedupeFoods, sameFood } from "../lib/food-match";
import { bpStatus, labStatus, LABS } from "../lib/markers";
import { measuredMaintenance, vo2Median } from "../lib/nutrition";

describe("measured maintenance", () => {
  const today = "2026-10-19";
  const days = (n: number, kcal: number) => Array.from({ length: n }, (_, i) => ({ date: addDays(today, -1 - i), calories: kcal }));
  // Weigh-ins every other day over 3 weeks, changing `perWeek` lb a week.
  const weighIns = (perWeek: number, start = 180) =>
    Array.from({ length: 10 }, (_, i) => ({ date: addDays(today, -20 + i * 2), weight_lb: start + (perWeek / 7) * i * 2 }));

  it("equals intake when weight is steady", () => {
    expect(measuredMaintenance(days(20, 2600), weighIns(0), today, 2500)?.kcal).toBe(2600);
  });

  it("adds 500 kcal/day per lb/week lost, subtracts per lb/week gained", () => {
    expect(measuredMaintenance(days(20, 2200), weighIns(-1), today, 2500)?.kcal).toBe(2700);
    expect(measuredMaintenance(days(20, 3000), weighIns(0.5), today, 2700)?.kcal).toBe(2750);
  });

  it("skips partly logged days and needs enough data", () => {
    const partial = [...days(12, 2600), { date: addDays(today, -15), calories: 400 }];
    expect(measuredMaintenance(partial, weighIns(0), today, 2500)?.days).toBe(12);
    expect(measuredMaintenance(days(8, 2600), weighIns(0), today, 2500)).toBeNull();
    expect(measuredMaintenance(days(20, 2600), weighIns(0).slice(0, 4), today, 2500)).toBeNull();
  });

  it("rejects results far from the formula (likely missed logging)", () => {
    expect(measuredMaintenance(days(20, 1200), weighIns(0), today, 2600)).toBeNull();
  });
});

describe("duplicate foods", () => {
  it("merges the same food named differently, keeps portions and flavors apart", () => {
    expect(sameFood({ name: "Scrambled eggs, 3 large", calories: 270 }, { name: "3 scrambled eggs", calories: 280 })).toBe(true);
    expect(sameFood({ name: "Spaghetti, cooked, 2 cups", calories: 440 }, { name: "Spaghetti, cooked, 1 cup", calories: 220 })).toBe(false);
    expect(sameFood({ name: "Protein shake, chocolate", calories: 160 }, { name: "Protein shake, vanilla", calories: 160 })).toBe(false);
    expect(sameFood({ name: "Raisin Bran Clusters Cereal (Trader Joe's)", calories: 420 }, { name: "Raisin Bran Clusters (Trader Joe's)", calories: 420 })).toBe(true);
  });

  it("keeps the first (most used) name and adds up uses", () => {
    const out = dedupeFoods([
      { name: "Brewed coffee with 2% milk", calories: 33, uses: 10 },
      { name: "Brewed coffee, 12 oz, with 2% milk", calories: 35, uses: 3 },
    ]);
    expect(out).toEqual([{ name: "Brewed coffee with 2% milk", calories: 33, uses: 13 }]);
  });
});

describe("markers", () => {
  it("grades labs against optimal and normal ranges", () => {
    const apob = LABS.find((l) => l.kind === "apob")!;
    expect(labStatus(55, apob)).toBe("optimal");
    expect(labStatus(80, apob)).toBe("normal");
    expect(labStatus(110, apob)).toBe("high");
  });

  it("grades blood pressure by the worse number", () => {
    expect(bpStatus(115, 75)).toBe("optimal");
    expect(bpStatus(125, 75)).toBe("normal");
    expect(bpStatus(118, 85)).toBe("high");
  });

  it("VO2 max medians fall with age", () => {
    expect(vo2Median(38, "male")).toBe(40);
    expect(vo2Median(38, "female")).toBeLessThan(vo2Median(38, "male"));
  });
});
