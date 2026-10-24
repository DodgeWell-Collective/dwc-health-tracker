export type Slot = "breakfast" | "lunch" | "dinner" | "snack";
export const SLOTS: Slot[] = ["breakfast", "lunch", "dinner", "snack"];

export type Aisle = "produce" | "meat & seafood" | "dairy & eggs" | "bakery" | "pantry" | "frozen";

export interface Ingredient {
  item: string;
  qty: number;
  unit: string;
  aisle: Aisle;
}

export interface Recipe {
  id: number;
  name: string;
  meal_type: Slot;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: string; // JSON Ingredient[], quantities for one serving
  instructions: string;
  active: number;
  /** 1 = planned in its slot every day (e.g. a daily protein shake) instead of rotating. */
  daily: number;
}

export interface Profile {
  sex: "male" | "female";
  birth_year: number;
  height_in: number;
  goal_weight_lb: number;
  goal_type: "gain" | "lose" | "maintain";
  /** Date to reach goal_weight_lb by; null = use the default pace for goal_type. */
  goal_date: string | null;
  /** Comma-separated EQUIPMENT keys. */
  equipment: string;
  equipment_notes: string;
  experience: "beginner" | "intermediate" | "advanced";
  /** Days between grocery trips. */
  shop_every: number;
  /** A shopping day; trips repeat every shop_every days from it. null = Mondays. */
  shop_anchor: string | null;
  /** Comma-separated staples always on hand; left off the shopping list. */
  pantry: string;
  profile_done: number;
  activity: "sedentary" | "light" | "moderate" | "active" | "very_active";
  calorie_target: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  timezone: string;
  avoid_foods: string;
}

export interface FoodLog {
  id: number;
  date: string;
  slot: Slot;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  recipe_id: number | null;
  fiber: number | null;
  sugar: number | null;
  sodium: number | null;
}

export interface WorkoutExercise {
  id: number;
  weekday: number;
  exercise: string;
  sets: number;
  reps: number;
  sort: number;
}

export interface StrengthGoal {
  id: number;
  exercise: string;
  target_lb: number;
  target_reps: number;
  target_date: string;
}

export const EQUIPMENT = [
  ["full_gym", "Full commercial gym"],
  ["barbell", "Barbell & plates"],
  ["rack", "Squat rack / power cage"],
  ["bench", "Adjustable bench"],
  ["dumbbells", "Dumbbells"],
  ["kettlebells", "Kettlebells"],
  ["cables", "Cable machine"],
  ["machines", "Weight machines"],
  ["smith", "Smith machine"],
  ["pullup_bar", "Pull-up bar"],
  ["dip_station", "Dip station"],
  ["bands", "Resistance bands"],
  ["trx", "Suspension trainer (TRX)"],
  ["cardio", "Cardio machine (treadmill, bike, rower)"],
  ["bodyweight", "Bodyweight only"],
] as const;

export interface SetLog {
  id: number;
  date: string;
  exercise: string;
  weight_lb: number;
  reps: number;
  /** Reps in reserve (0 = failure), null if not rated. */
  rir: number | null;
}
