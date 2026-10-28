import { describe, expect, it } from "vitest";
import { groceryMatcher, householdServings } from "../lib/groceries";

describe("groceries", () => {
  const have = groceryMatcher(["Kirkland Boneless Skinless Chicken Breasts", "Fage Total 0% Greek Yogurt", "Large White Eggs", "Fresh Blueberries"]);

  it("matches recipe ingredients to products bought, plurals aside", () => {
    expect(have("chicken breast")).toBe(true);
    expect(have("Greek yogurt")).toBe(true);
    expect(have("eggs")).toBe(true);
    expect(have("blueberry")).toBe(true);
  });

  it("needs every word of the ingredient", () => {
    expect(have("chicken thighs")).toBe(false);
    expect(have("yogurt dressing")).toBe(false);
    expect(have("rice")).toBe(false);
  });
});

describe("household servings", () => {
  const profile = { household: 2, household_slots: "dinner,lunch" };

  it("adds the others at shared meals only", () => {
    expect(householdServings(profile, "dinner", false)).toBe(2);
    expect(householdServings(profile, "breakfast", false)).toBe(0);
  });

  it("leaves your daily recipes (a protein shake) to you", () => {
    expect(householdServings(profile, "dinner", true)).toBe(0);
    expect(householdServings({ household: 0, household_slots: "dinner" }, "dinner", false)).toBe(0);
  });
});
