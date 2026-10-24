import type { Ingredient, Slot } from "./types";

interface SeedRecipe {
  name: string;
  meal_type: Slot;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: Ingredient[];
  instructions: string;
}

const P = "produce" as const;
const M = "meat & seafood" as const;
const D = "dairy & eggs" as const;
const B = "bakery" as const;
const N = "pantry" as const;
const F = "frozen" as const;

// Macros and ingredient quantities are per single serving.
export const SEED_RECIPES: SeedRecipe[] = [
  // Breakfast
  {
    name: "Greek yogurt berry bowl",
    meal_type: "breakfast",
    calories: 420, protein: 32, carbs: 52, fat: 10,
    ingredients: [
      { item: "Plain Greek yogurt (nonfat)", qty: 1.5, unit: "cup", aisle: D },
      { item: "Mixed berries", qty: 1, unit: "cup", aisle: F },
      { item: "Granola", qty: 0.33, unit: "cup", aisle: N },
      { item: "Honey", qty: 1, unit: "tbsp", aisle: N },
    ],
    instructions: "Layer yogurt, berries and granola. Drizzle with honey.",
  },
  {
    name: "Veggie egg scramble with toast",
    meal_type: "breakfast",
    calories: 480, protein: 30, carbs: 34, fat: 24,
    ingredients: [
      { item: "Eggs", qty: 3, unit: "each", aisle: D },
      { item: "Spinach", qty: 1, unit: "cup", aisle: P },
      { item: "Bell pepper", qty: 0.5, unit: "each", aisle: P },
      { item: "Shredded cheddar", qty: 0.25, unit: "cup", aisle: D },
      { item: "Whole wheat bread", qty: 2, unit: "slice", aisle: B },
    ],
    instructions: "Sauté pepper and spinach, add beaten eggs and cheese, scramble. Serve with toast.",
  },
  {
    name: "Peanut butter banana oatmeal",
    meal_type: "breakfast",
    calories: 520, protein: 22, carbs: 72, fat: 18,
    ingredients: [
      { item: "Rolled oats", qty: 0.75, unit: "cup", aisle: N },
      { item: "Milk (2%)", qty: 1, unit: "cup", aisle: D },
      { item: "Banana", qty: 1, unit: "each", aisle: P },
      { item: "Peanut butter", qty: 1.5, unit: "tbsp", aisle: N },
    ],
    instructions: "Cook oats in milk. Top with sliced banana and peanut butter.",
  },
  {
    name: "Protein pancakes",
    meal_type: "breakfast",
    calories: 450, protein: 36, carbs: 50, fat: 11,
    ingredients: [
      { item: "Pancake mix", qty: 0.5, unit: "cup", aisle: N },
      { item: "Protein powder", qty: 1, unit: "scoop", aisle: N },
      { item: "Eggs", qty: 1, unit: "each", aisle: D },
      { item: "Milk (2%)", qty: 0.5, unit: "cup", aisle: D },
      { item: "Maple syrup", qty: 1, unit: "tbsp", aisle: N },
    ],
    instructions: "Whisk mix, protein, egg and milk. Cook on a griddle. Top with syrup.",
  },
  {
    name: "Breakfast burrito",
    meal_type: "breakfast",
    calories: 560, protein: 34, carbs: 44, fat: 26,
    ingredients: [
      { item: "Large flour tortilla", qty: 1, unit: "each", aisle: B },
      { item: "Eggs", qty: 3, unit: "each", aisle: D },
      { item: "Turkey sausage", qty: 2, unit: "oz", aisle: M },
      { item: "Black beans", qty: 0.25, unit: "cup", aisle: N },
      { item: "Salsa", qty: 2, unit: "tbsp", aisle: N },
    ],
    instructions: "Brown sausage, scramble eggs, warm beans. Wrap in tortilla with salsa.",
  },
  {
    name: "Cottage cheese & fruit plate",
    meal_type: "breakfast",
    calories: 380, protein: 30, carbs: 40, fat: 10,
    ingredients: [
      { item: "Cottage cheese (2%)", qty: 1, unit: "cup", aisle: D },
      { item: "Pineapple chunks", qty: 1, unit: "cup", aisle: P },
      { item: "Almonds", qty: 0.5, unit: "oz", aisle: N },
    ],
    instructions: "Serve cottage cheese topped with pineapple and almonds.",
  },
  {
    name: "Smoked salmon bagel",
    meal_type: "breakfast",
    calories: 470, protein: 28, carbs: 52, fat: 15,
    ingredients: [
      { item: "Whole wheat bagel", qty: 1, unit: "each", aisle: B },
      { item: "Smoked salmon", qty: 3, unit: "oz", aisle: M },
      { item: "Light cream cheese", qty: 2, unit: "tbsp", aisle: D },
      { item: "Cucumber", qty: 0.25, unit: "each", aisle: P },
    ],
    instructions: "Toast bagel, spread cream cheese, top with salmon and cucumber.",
  },

  // Lunch
  {
    name: "Grilled chicken rice bowl",
    meal_type: "lunch",
    calories: 620, protein: 48, carbs: 70, fat: 14,
    ingredients: [
      { item: "Chicken breast", qty: 6, unit: "oz", aisle: M },
      { item: "Jasmine rice (dry)", qty: 0.5, unit: "cup", aisle: N },
      { item: "Broccoli", qty: 1, unit: "cup", aisle: P },
      { item: "Teriyaki sauce", qty: 2, unit: "tbsp", aisle: N },
    ],
    instructions: "Grill chicken, cook rice, steam broccoli. Combine and drizzle with teriyaki.",
  },
  {
    name: "Turkey avocado wrap",
    meal_type: "lunch",
    calories: 540, protein: 38, carbs: 42, fat: 24,
    ingredients: [
      { item: "Large flour tortilla", qty: 1, unit: "each", aisle: B },
      { item: "Deli turkey", qty: 5, unit: "oz", aisle: M },
      { item: "Avocado", qty: 0.5, unit: "each", aisle: P },
      { item: "Romaine lettuce", qty: 1, unit: "cup", aisle: P },
      { item: "Tomato", qty: 0.5, unit: "each", aisle: P },
    ],
    instructions: "Layer turkey, avocado, lettuce and tomato in tortilla and roll.",
  },
  {
    name: "Tuna salad stuffed pita",
    meal_type: "lunch",
    calories: 480, protein: 40, carbs: 44, fat: 14,
    ingredients: [
      { item: "Canned tuna", qty: 1, unit: "can", aisle: N },
      { item: "Whole wheat pita", qty: 1, unit: "each", aisle: B },
      { item: "Light mayo", qty: 1, unit: "tbsp", aisle: N },
      { item: "Celery", qty: 1, unit: "stalk", aisle: P },
      { item: "Mixed greens", qty: 1, unit: "cup", aisle: P },
    ],
    instructions: "Mix tuna, mayo and diced celery. Stuff pita with greens and tuna.",
  },
  {
    name: "Beef & bean chili",
    meal_type: "lunch",
    calories: 590, protein: 44, carbs: 52, fat: 20,
    ingredients: [
      { item: "Lean ground beef (93%)", qty: 5, unit: "oz", aisle: M },
      { item: "Kidney beans", qty: 0.5, unit: "cup", aisle: N },
      { item: "Diced tomatoes (canned)", qty: 0.5, unit: "can", aisle: N },
      { item: "Onion", qty: 0.25, unit: "each", aisle: P },
      { item: "Chili seasoning", qty: 1, unit: "tbsp", aisle: N },
    ],
    instructions: "Brown beef with onion, add tomatoes, beans and seasoning. Simmer 20 min. Batch-cook friendly.",
  },
  {
    name: "Chicken Caesar salad",
    meal_type: "lunch",
    calories: 520, protein: 46, carbs: 20, fat: 28,
    ingredients: [
      { item: "Chicken breast", qty: 6, unit: "oz", aisle: M },
      { item: "Romaine lettuce", qty: 3, unit: "cup", aisle: P },
      { item: "Parmesan", qty: 2, unit: "tbsp", aisle: D },
      { item: "Croutons", qty: 0.5, unit: "cup", aisle: B },
      { item: "Caesar dressing", qty: 2, unit: "tbsp", aisle: N },
    ],
    instructions: "Grill and slice chicken. Toss romaine with dressing, top with chicken, parmesan, croutons.",
  },
  {
    name: "Quinoa chickpea power bowl",
    meal_type: "lunch",
    calories: 560, protein: 24, carbs: 74, fat: 19,
    ingredients: [
      { item: "Quinoa (dry)", qty: 0.33, unit: "cup", aisle: N },
      { item: "Chickpeas", qty: 0.75, unit: "cup", aisle: N },
      { item: "Cucumber", qty: 0.5, unit: "each", aisle: P },
      { item: "Cherry tomatoes", qty: 0.5, unit: "cup", aisle: P },
      { item: "Feta", qty: 1, unit: "oz", aisle: D },
      { item: "Olive oil", qty: 1, unit: "tsp", aisle: N },
    ],
    instructions: "Cook quinoa. Combine with chickpeas, vegetables and feta. Dress with oil and lemon.",
  },
  {
    name: "Shrimp fried rice",
    meal_type: "lunch",
    calories: 580, protein: 38, carbs: 68, fat: 16,
    ingredients: [
      { item: "Shrimp", qty: 6, unit: "oz", aisle: F },
      { item: "Jasmine rice (dry)", qty: 0.5, unit: "cup", aisle: N },
      { item: "Frozen peas & carrots", qty: 0.75, unit: "cup", aisle: F },
      { item: "Eggs", qty: 1, unit: "each", aisle: D },
      { item: "Soy sauce", qty: 1, unit: "tbsp", aisle: N },
    ],
    instructions: "Use day-old rice. Stir-fry shrimp, vegetables and egg, add rice and soy sauce.",
  },
  {
    name: "Turkey burger & sweet potato",
    meal_type: "lunch",
    calories: 600, protein: 40, carbs: 58, fat: 22,
    ingredients: [
      { item: "Ground turkey", qty: 6, unit: "oz", aisle: M },
      { item: "Whole wheat bun", qty: 1, unit: "each", aisle: B },
      { item: "Sweet potato", qty: 1, unit: "each", aisle: P },
      { item: "Romaine lettuce", qty: 0.5, unit: "cup", aisle: P },
    ],
    instructions: "Grill patty, roast sweet potato wedges at 425°F for 25 min.",
  },

  // Dinner
  {
    name: "Salmon, rice & asparagus",
    meal_type: "dinner",
    calories: 680, protein: 44, carbs: 58, fat: 28,
    ingredients: [
      { item: "Salmon fillet", qty: 6, unit: "oz", aisle: M },
      { item: "Brown rice (dry)", qty: 0.5, unit: "cup", aisle: N },
      { item: "Asparagus", qty: 6, unit: "spear", aisle: P },
      { item: "Lemon", qty: 0.5, unit: "each", aisle: P },
    ],
    instructions: "Bake salmon and asparagus at 400°F for 12–15 min. Serve over rice with lemon.",
  },
  {
    name: "Steak, potatoes & green beans",
    meal_type: "dinner",
    calories: 720, protein: 52, carbs: 50, fat: 32,
    ingredients: [
      { item: "Sirloin steak", qty: 7, unit: "oz", aisle: M },
      { item: "Baby potatoes", qty: 8, unit: "oz", aisle: P },
      { item: "Green beans", qty: 1, unit: "cup", aisle: P },
      { item: "Butter", qty: 1, unit: "tbsp", aisle: D },
    ],
    instructions: "Sear steak to taste and rest. Roast potatoes, sauté green beans in butter.",
  },
  {
    name: "Chicken stir-fry with noodles",
    meal_type: "dinner",
    calories: 650, protein: 46, carbs: 72, fat: 17,
    ingredients: [
      { item: "Chicken thigh (boneless)", qty: 6, unit: "oz", aisle: M },
      { item: "Lo mein noodles", qty: 3, unit: "oz", aisle: N },
      { item: "Stir-fry vegetable mix", qty: 1.5, unit: "cup", aisle: F },
      { item: "Stir-fry sauce", qty: 2, unit: "tbsp", aisle: N },
    ],
    instructions: "Cook noodles. Stir-fry chicken, add vegetables and sauce, toss with noodles.",
  },
  {
    name: "Turkey meatball marinara pasta",
    meal_type: "dinner",
    calories: 700, protein: 46, carbs: 80, fat: 20,
    ingredients: [
      { item: "Ground turkey", qty: 5, unit: "oz", aisle: M },
      { item: "Whole wheat spaghetti", qty: 3, unit: "oz", aisle: N },
      { item: "Marinara sauce", qty: 0.75, unit: "cup", aisle: N },
      { item: "Parmesan", qty: 1, unit: "tbsp", aisle: D },
    ],
    instructions: "Roll meatballs, bake at 400°F for 18 min, simmer in marinara, serve over pasta.",
  },
  {
    name: "Pork tenderloin & roasted veg",
    meal_type: "dinner",
    calories: 610, protein: 48, carbs: 46, fat: 24,
    ingredients: [
      { item: "Pork tenderloin", qty: 6, unit: "oz", aisle: M },
      { item: "Butternut squash", qty: 1, unit: "cup", aisle: P },
      { item: "Brussels sprouts", qty: 1, unit: "cup", aisle: P },
      { item: "Olive oil", qty: 1, unit: "tbsp", aisle: N },
    ],
    instructions: "Roast tenderloin and vegetables at 425°F for 20–25 min until pork reaches 145°F.",
  },
  {
    name: "Chicken fajitas",
    meal_type: "dinner",
    calories: 660, protein: 48, carbs: 56, fat: 26,
    ingredients: [
      { item: "Chicken breast", qty: 6, unit: "oz", aisle: M },
      { item: "Corn tortillas", qty: 3, unit: "each", aisle: B },
      { item: "Bell pepper", qty: 1, unit: "each", aisle: P },
      { item: "Onion", qty: 0.5, unit: "each", aisle: P },
      { item: "Sour cream (light)", qty: 2, unit: "tbsp", aisle: D },
      { item: "Fajita seasoning", qty: 1, unit: "tbsp", aisle: N },
    ],
    instructions: "Slice and sear chicken with seasoning, add peppers and onion. Serve in warm tortillas.",
  },
  {
    name: "Cod tacos with slaw",
    meal_type: "dinner",
    calories: 560, protein: 40, carbs: 54, fat: 18,
    ingredients: [
      { item: "Cod fillet", qty: 6, unit: "oz", aisle: M },
      { item: "Corn tortillas", qty: 3, unit: "each", aisle: B },
      { item: "Coleslaw mix", qty: 1, unit: "cup", aisle: P },
      { item: "Lime", qty: 1, unit: "each", aisle: P },
      { item: "Light mayo", qty: 1, unit: "tbsp", aisle: N },
    ],
    instructions: "Season and pan-sear cod. Toss slaw with mayo and lime. Assemble tacos.",
  },
  {
    name: "Beef & broccoli with rice",
    meal_type: "dinner",
    calories: 690, protein: 46, carbs: 70, fat: 22,
    ingredients: [
      { item: "Flank steak", qty: 6, unit: "oz", aisle: M },
      { item: "Broccoli", qty: 1.5, unit: "cup", aisle: P },
      { item: "Jasmine rice (dry)", qty: 0.5, unit: "cup", aisle: N },
      { item: "Soy sauce", qty: 1, unit: "tbsp", aisle: N },
      { item: "Garlic", qty: 2, unit: "clove", aisle: P },
    ],
    instructions: "Thinly slice steak, sear, add broccoli, garlic and soy sauce. Serve over rice.",
  },

  // Snacks
  {
    name: "Protein shake",
    meal_type: "snack",
    calories: 260, protein: 32, carbs: 20, fat: 5,
    ingredients: [
      { item: "Protein powder", qty: 1, unit: "scoop", aisle: N },
      { item: "Milk (2%)", qty: 1, unit: "cup", aisle: D },
    ],
    instructions: "Shake or blend.",
  },
  {
    name: "Apple & peanut butter",
    meal_type: "snack",
    calories: 280, protein: 8, carbs: 32, fat: 16,
    ingredients: [
      { item: "Apple", qty: 1, unit: "each", aisle: P },
      { item: "Peanut butter", qty: 2, unit: "tbsp", aisle: N },
    ],
    instructions: "Slice apple, dip in peanut butter.",
  },
  {
    name: "Hard-boiled eggs & string cheese",
    meal_type: "snack",
    calories: 240, protein: 20, carbs: 2, fat: 17,
    ingredients: [
      { item: "Eggs", qty: 2, unit: "each", aisle: D },
      { item: "String cheese", qty: 1, unit: "each", aisle: D },
    ],
    instructions: "Boil eggs 10 min, cool, peel. Batch a dozen at a time.",
  },
  {
    name: "Trail mix",
    meal_type: "snack",
    calories: 300, protein: 9, carbs: 26, fat: 19,
    ingredients: [{ item: "Trail mix", qty: 0.33, unit: "cup", aisle: N }],
    instructions: "Portion into a small container.",
  },
  {
    name: "Beef jerky & grapes",
    meal_type: "snack",
    calories: 220, protein: 18, carbs: 26, fat: 3,
    ingredients: [
      { item: "Beef jerky", qty: 1.5, unit: "oz", aisle: N },
      { item: "Grapes", qty: 1, unit: "cup", aisle: P },
    ],
    instructions: "Grab and go.",
  },
  {
    name: "Hummus & veggies with pita chips",
    meal_type: "snack",
    calories: 270, protein: 8, carbs: 30, fat: 13,
    ingredients: [
      { item: "Hummus", qty: 0.25, unit: "cup", aisle: P },
      { item: "Baby carrots", qty: 1, unit: "cup", aisle: P },
      { item: "Pita chips", qty: 0.5, unit: "oz", aisle: N },
    ],
    instructions: "Dip and enjoy.",
  },
];
