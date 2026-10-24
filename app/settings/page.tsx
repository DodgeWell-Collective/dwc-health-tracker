import Link from "next/link";
import { redirect } from "next/navigation";
import { getTargets, getToday, tripFor } from "../../lib/data";
import { addDays, formatDate } from "../../lib/dates";
import { suggestedTargets, type GoalPace, type Measured } from "../../lib/nutrition";
import { AutoSave, Button, Card, Info } from "../../components/ui";
import { saveProfile } from "../actions";
import { authOff, MIN_PASSWORD } from "../../lib/auth";
import { getSecret, setting } from "../../lib/secrets";
import { changePassword, removeApiKey, saveApiKey } from "./account-actions";

export const dynamic = "force-dynamic";

const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];

const TABS = [
  ["profile", "Profile"],
  ["food", "Food & shopping"],
  ["account", "Sign-in & keys"],
] as const;

const short = (d: string) => formatDate(d, { month: "short", day: "numeric", year: "numeric" });

export default async function Settings({ searchParams }: { searchParams: Promise<{ tab?: string; pw?: string; key?: string }> }) {
  const { tab: requested, pw, key } = await searchParams;
  if (requested === "training") redirect("/train"); // training moved to its own page
  const tab = TABS.some(([t]) => t === requested) ? requested! : "profile";
  const today = await getToday();
  const { profile: p, weight, pace, measured } = await getTargets(today);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <nav className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800" aria-label="Settings sections">
        {TABS.map(([t, label]) => (
          <Link
            key={t}
            href={`/settings?tab=${t}`}
            aria-current={tab === t ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? "border-emerald-600 text-emerald-700 dark:text-emerald-400" : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "profile" && <ProfileTab p={p} weight={weight?.weight_lb ?? null} pace={pace} measured={measured} today={today} />}
      {tab === "food" && <FoodTab p={p} today={today} />}
      {tab === "account" && <AccountTab pw={pw} keyStatus={key} />}
    </div>
  );
}

type P = Awaited<ReturnType<typeof getTargets>>["profile"];

function ProfileTab({ p, weight, pace, measured, today }: { p: P; weight: number | null; pace: GoalPace; measured: Measured | null; today: string }) {
  const s = suggestedTargets(p, weight ?? p.goal_weight_lb, pace, measured);
  return (
    <>
      <Card>
        <AutoSave action={saveProfile} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Sex">
              <select name="sex" defaultValue={p.sex}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </Field>
            <Field label="Birth year">
              <input name="birth_year" type="number" inputMode="numeric" min="1920" max="2020" defaultValue={p.birth_year} />
            </Field>
            <Field label="Height">
              <div className="flex items-center gap-1">
                <input name="height_ft" type="number" inputMode="numeric" min="3" max="8" defaultValue={Math.floor(p.height_in / 12)} className="w-14" aria-label="Feet" />′
                <input name="height_inches" type="number" inputMode="decimal" min="0" max="11.5" step="0.5" defaultValue={p.height_in % 12} className="w-14" aria-label="Inches" />″
              </div>
            </Field>
            <Field label="Goal">
              <select name="goal_type" defaultValue={p.goal_type}>
                <option value="gain">Build muscle / gain</option>
                <option value="maintain">Maintain</option>
                <option value="lose">Lose fat</option>
              </select>
            </Field>
            <Field label="Goal weight (lb)">
              <input name="goal_weight_lb" type="number" inputMode="decimal" step="0.5" min="50" defaultValue={p.goal_weight_lb} />
            </Field>
            <Field label={<>Reach it by<Info>Optional. Your calorie target is paced to hit your goal weight by this date, capped at a safe rate. Leave blank for a steady +0.5 lb/week (gain) or −1 lb/week (lose).</Info></>}>
              <input name="goal_date" type="date" min={today} defaultValue={p.goal_date ?? ""} />
            </Field>
            <Field label="Activity">
              <select name="activity" defaultValue={p.activity}>
                <option value="sedentary">Mostly sitting</option>
                <option value="light">Light (1–3 workouts/wk)</option>
                <option value="moderate">Moderate (3–5/wk)</option>
                <option value="active">Active (6–7/wk)</option>
                <option value="very_active">Very active job + training</option>
              </select>
            </Field>
            <Field label="Timezone">
              <select name="timezone" defaultValue={p.timezone}>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.split("/")[1].replace("_", " ")}</option>)}
              </select>
            </Field>
          </div>
          {p.goal_date && <PaceNote pace={pace} goalDate={p.goal_date} hasWeight={weight != null} />}

          <div>
            <h3 className="mb-2 text-sm font-semibold">
              Daily targets
              <Info>Blank fields use the suggestion (shown greyed) and keep updating. {measured ? `It's built on the ${measured.days} days of food logs and weigh-ins behind your measured burn of ${measured.kcal.toLocaleString()} kcal/day, adjusted for your goal pace.` : "Until you have 2–3 weeks of food logs and weigh-ins, it's estimated from your weight, height, age and activity; after that it uses what you actually burn."} Typing a number fixes it there and stops the updates.</Info>
            </h3>
            <div className="grid grid-cols-4 gap-2">
              <Field label="kcal"><input name="calorie_target" type="number" inputMode="numeric" min="800" placeholder={String(s.calories)} defaultValue={p.calorie_target ?? ""} /></Field>
              <Field label="Protein"><input name="protein_g" type="number" inputMode="numeric" min="0" placeholder={String(s.protein)} defaultValue={p.protein_g ?? ""} /></Field>
              <Field label="Carbs"><input name="carbs_g" type="number" inputMode="numeric" min="0" placeholder={String(s.carbs)} defaultValue={p.carbs_g ?? ""} /></Field>
              <Field label="Fat"><input name="fat_g" type="number" inputMode="numeric" min="0" placeholder={String(s.fat)} defaultValue={p.fat_g ?? ""} /></Field>
            </div>
          </div>
        </AutoSave>
      </Card>
      <p className="text-center text-xs">
        <a href="/export" className="text-zinc-500 underline">Download all my data</a>
      </p>
    </>
  );
}

function FoodTab({ p, today }: { p: P; today: string }) {
  const trip = tripFor(p, today);
  return (
    <Card>
      <AutoSave action={saveProfile} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={<>I shop<Info>Meal plans cover one shopping trip at a time and reuse ingredients so the list stays short.</Info></>}>
            <select name="shop_every" defaultValue={p.shop_every}>
              {[[3, "Every 3 days"], [4, "Twice a week"], [7, "Weekly"], [10, "Every 10 days"], [14, "Every 2 weeks"]].map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="Next shopping day">
            <input name="shop_anchor" type="date" defaultValue={trip.start >= today ? trip.start : addDays(trip.start, trip.days)} />
          </Field>
        </div>
        <Field label="Foods I avoid">
          <input name="avoid_foods" defaultValue={p.avoid_foods} placeholder="e.g. shrimp, mushrooms" />
        </Field>
        <Field label={<>Always on hand<Info>Staples you never need to buy. They're left off shopping lists. You can also tap ⌂ next to any shopping item.</Info></>}>
          <input name="pantry" defaultValue={p.pantry} placeholder="e.g. salt, olive oil, soy sauce" />
        </Field>
      </AutoSave>
    </Card>
  );
}

function PaceNote({ pace, goalDate, hasWeight }: { pace: GoalPace; goalDate: string; hasWeight: boolean }) {
  const rate = (r: number) => `${r > 0 ? "+" : ""}${r} lb/wk`;
  if (!hasWeight) return <p className="text-xs text-zinc-500">Weigh in to pace your targets to {short(goalDate)}.</p>;
  if (pace.needed == null) return <p className="text-xs text-amber-600">That date has passed. Pick a new one.</p>;
  if (pace.needed === 0) return <p className="text-xs text-zinc-500">At goal weight: targets set to maintain.</p>;
  return pace.capped ? (
    <p className="text-xs text-amber-600">Needs {rate(pace.needed)}, too fast. Using {rate(pace.rate)}, about {short(pace.projected!)}.</p>
  ) : (
    <p className="text-xs text-zinc-500">Pace: {rate(pace.rate)}</p>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

const PW_MESSAGES: Record<string, [string, boolean]> = {
  ok: ["Password changed. Other devices will need to sign in again.", true],
  wrong: ["Current password is wrong.", false],
  short: [`Use at least ${MIN_PASSWORD} characters.`, false],
  mismatch: ["The new passwords don't match.", false],
  locked: ["Too many tries. Wait 15 minutes.", false],
};

const API_KEYS = [
  { name: "anthropic", secret: "anthropic_api_key", env: "ANTHROPIC_API_KEY", label: "Anthropic", help: "Turns on describing meals to Claude and recipe ideas. Get a key at console.anthropic.com." },
  { name: "usda", secret: "usda_api_key", env: "USDA_API_KEY", label: "USDA", help: "Raises food search limits. Free key from api.data.gov/signup." },
] as const;

async function AccountTab({ pw, keyStatus }: { pw?: string; keyStatus?: string }) {
  const msg = pw ? PW_MESSAGES[pw] : undefined;
  const keys = await Promise.all(API_KEYS.map(async (k) => ({ ...k, saved: await getSecret(k.secret), server: Boolean(setting(k.env)) })));
  return (
    <>
      {!authOff() && (
        <Card title="Password">
          <form action={changePassword} className="grid gap-2 sm:max-w-xs">
            <input name="current" type="password" autoComplete="current-password" placeholder="Current password" required aria-label="Current password" />
            <input name="next" type="password" autoComplete="new-password" placeholder="New password" minLength={MIN_PASSWORD} required aria-label="New password" />
            <input name="confirm" type="password" autoComplete="new-password" placeholder="New password again" minLength={MIN_PASSWORD} required aria-label="New password again" />
            {msg && <p className={`text-sm ${msg[1] ? "text-emerald-600" : "text-amber-600"}`}>{msg[0]}</p>}
            <Button>Change password</Button>
          </form>
          <form action="/auth/logout" method="post" className="mt-3">
            <button className="text-sm text-zinc-500 underline">Sign out</button>
          </form>
        </Card>
      )}
      <Card title={<>API keys<Info>Keys are stored on your server and never shown again in full. A key saved here is used instead of one set on the server.</Info></>}>
        <div className="space-y-4">
          {keys.map((k) => (
            <div key={k.name}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{k.label}<Info>{k.help}</Info></span>
                <span className="text-xs text-zinc-500">
                  {k.saved ? `Saved, ends in ${k.saved.slice(-4)}` : k.server ? "Set on the server" : "Not set"}
                </span>
              </div>
              <div className="flex gap-2">
                <form action={saveApiKey} className="flex min-w-0 flex-1 gap-2">
                  <input type="hidden" name="name" value={k.name} />
                  <input name="value" type="password" autoComplete="off" placeholder={k.saved ? "Replace key" : "Paste key"} className="min-w-0 flex-1" required aria-label={`${k.label} API key`} />
                  <Button variant="ghost">Save</Button>
                </form>
                {k.saved && (
                  <form action={removeApiKey}>
                    <input type="hidden" name="name" value={k.name} />
                    <Button variant="danger">Remove</Button>
                  </form>
                )}
              </div>
            </div>
          ))}
          {keyStatus === "saved" && <p className="text-sm text-emerald-600">Key saved.</p>}
          {keyStatus === "bad" && <p className="text-sm text-amber-600">Anthropic didn&apos;t accept that key. Check it and try again.</p>}
        </div>
      </Card>
    </>
  );
}
