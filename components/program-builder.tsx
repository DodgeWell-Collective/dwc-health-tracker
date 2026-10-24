"use client";

import { useMemo, useState, useTransition } from "react";
import { applyProgram } from "../app/actions";
import { describeLoad, formatTarget, startingWeight, type Lifter } from "../lib/loads";
import { buildProgram } from "../lib/program";
import { Info } from "./client-ui";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Pills<T extends number>({ value, options, onChange, format }: { value: T; options: T[]; onChange: (v: T) => void; format: (v: T) => string }) {
  return (
    <div className="inline-flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={`rounded-md px-2.5 py-1 text-sm tabular-nums ${value === o ? "bg-emerald-600 text-white" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"}`}
        >
          {format(o)}
        </button>
      ))}
    </div>
  );
}

/** Live preview of the rule-based program; "Use this plan" replaces the weekly schedule. */
export function ProgramBuilder({ equipment, goalLifts, hasSchedule, lifter }: {
  equipment: string[];
  goalLifts: { exercise: string; reps: number }[];
  hasSchedule: boolean;
  lifter: Lifter;
}) {
  const [daysPerWeek, setDays] = useState(lifter.experience === "beginner" ? 3 : 4);
  const [minutes, setMinutes] = useState(60);
  const [saving, startSaving] = useTransition();
  const [applied, setApplied] = useState(false);

  const program = useMemo(
    () => buildProgram({ daysPerWeek, minutes, experience: lifter.experience, equipment, goalLifts }),
    [daysPerWeek, minutes, lifter.experience, equipment, goalLifts],
  );

  function apply() {
    const fd = new FormData();
    fd.set("days", JSON.stringify(program.days));
    startSaving(async () => {
      await applyProgram(fd);
      setApplied(true);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Pills value={daysPerWeek} options={[2, 3, 4, 5, 6]} onChange={(v) => { setDays(v); setApplied(false); }} format={(v) => `${v}d`} />
        <Pills value={minutes} options={[30, 45, 60, 90]} onChange={(v) => { setMinutes(v); setApplied(false); }} format={(v) => `${v}m`} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {program.days.map((d) => (
          <div key={d.weekday} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <div className="font-semibold">{DAY_NAMES[d.weekday]} · {d.name}</div>
            <ul className="mt-1 space-y-0.5 text-zinc-600 dark:text-zinc-400">
              {d.exercises.map((e) => {
                const start = startingWeight(e.exercise, e.reps, lifter);
                return (
                  <li key={e.exercise} className="flex justify-between gap-2">
                    <span>{e.exercise}</span>
                    <span className="shrink-0 tabular-nums text-zinc-500">
                      {formatTarget(e.exercise, e.sets, e.reps)}{start.weight != null && <span className="text-emerald-600"> {describeLoad(start.weight, start.implement, e.exercise).replace(/ dumbbells?/, " DB")}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-zinc-500">Sets/week<Info>Hard sets per muscle each week. Research shows more weekly sets build more muscle, with diminishing returns: about {program.volume[0]?.target}+ is a good target at your level. Amber means below it.</Info></span>
        {program.volume.map((v) => (
          <span key={v.muscle} className={`rounded px-1.5 py-0.5 tabular-nums ${v.sets >= v.target ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>
            {v.muscle} {v.sets}
          </span>
        ))}
      </div>

      {program.notes.length > 0 && (
        <ul className="list-inside list-disc text-xs text-zinc-500">{program.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={apply} disabled={saving} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {saving ? "Saving…" : applied ? "✓ Applied" : "Use this plan"}
        </button>
        {hasSchedule && !applied && <span className="text-xs text-zinc-500">Replaces your schedule</span>}
      </div>
    </div>
  );
}
