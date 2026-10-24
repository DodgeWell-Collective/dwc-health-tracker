import { all } from "../../lib/db";
import { claudeEnabled } from "../../lib/claude";
import { SLOTS, type Ingredient, type Recipe } from "../../lib/types";
import { Button, Card, Hidden, Info } from "../../components/ui";
import { SuggestRecipes } from "../../components/suggest-recipes";
import { RecipeBuilder } from "../../components/recipe-builder";
import { toggleDaily, toggleRecipe } from "../actions";

export const dynamic = "force-dynamic";

export default async function Recipes() {
  const recipes = await all<Recipe>("SELECT * FROM recipe ORDER BY name");
  const knownIngredients = [...new Set(recipes.flatMap((r) => (JSON.parse(r.ingredients) as Ingredient[]).map((i) => i.item)))].sort();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">
        Recipes
        <Info>The planner only uses active recipes; pause any you're tired of. ★ Daily plans a recipe in its meal every day (like a morning shake) and sizes the other meals around it.</Info>
      </h1>

      <Card title={<>Add your own<Info>Search or scan each ingredient and enter how much you use. Totals come from USDA FoodData Central and Open Food Facts, not estimates.</Info></>}>
        <RecipeBuilder knownIngredients={knownIngredients} />
      </Card>

      {(await claudeEnabled()) && (
        <details className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <summary className="cursor-pointer text-sm font-semibold">Ideas from Claude <span className="font-normal text-zinc-500">(AI)</span></summary>
          <div className="mt-3">
            <SuggestRecipes />
          </div>
        </details>
      )}

      {SLOTS.map((slot) => (
        <Card key={slot} title={<span className="capitalize">{slot}</span>}>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {recipes.filter((r) => r.meal_type === slot).map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 py-2">
                <details className={r.active ? "" : "opacity-50"}>
                  <summary className="cursor-pointer text-sm font-medium">
                    {r.name} <span className="font-normal tabular-nums text-zinc-500">· {r.calories} kcal · {r.protein}P / {r.carbs}C / {r.fat}F</span>
                  </summary>
                  <ul className="mt-1 list-inside list-disc text-xs text-zinc-500">
                    {(JSON.parse(r.ingredients) as Ingredient[]).map((i) => (
                      <li key={i.item}>{i.qty} {i.unit} {i.item}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-zinc-500">{r.instructions}</p>
                </details>
                <div className="flex shrink-0 gap-1">
                  <form action={toggleDaily}>
                    <Hidden id={r.id} />
                    <Button variant="ghost" className={`!px-2 !py-1 text-xs ${r.daily ? "!text-amber-600" : ""}`} title={r.daily ? "Planned every day. Click to rotate normally." : "Plan this every day"}>
                      {r.daily ? "★ Daily" : "☆ Daily"}
                    </Button>
                  </form>
                  <form action={toggleRecipe}>
                    <Hidden id={r.id} />
                    <Button variant="ghost" className="!px-2 !py-1 text-xs">{r.active ? "Pause" : "Activate"}</Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}

    </div>
  );
}
