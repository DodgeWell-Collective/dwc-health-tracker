import { formatDate } from "../lib/dates";

export interface Point {
  date: string;
  value: number;
}

const W = 600;
const H = 200;
const PAD = { top: 12, right: 12, bottom: 24, left: 40 };

function scale(points: Point[], reference?: number) {
  const values = points.map((p) => p.value).concat(reference ?? []);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) [min, max] = [min - 1, max + 1];
  const padY = (max - min) * 0.1;
  min -= padY;
  max += padY;
  const t0 = Date.parse(points[0].date);
  const t1 = Date.parse(points.at(-1)!.date);
  const x = (d: string) => PAD.left + (t1 === t0 ? 0.5 : (Date.parse(d) - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom);
  const ticks = [min + padY, (min + max) / 2, max - padY];
  return { x, y, ticks };
}

/**
 * Line chart with an optional dashed reference line (e.g. a goal). With `trend`,
 * the trend is the line and the raw points become faint dots (daily weigh-ins
 * around a smoothed weight). Hover a point for its value.
 */
export function LineChart({ points, unit, reference, referenceLabel, trend }: { points: Point[]; unit: string; reference?: number; referenceLabel?: string; trend?: Point[] }) {
  if (points.length === 0) return <p className="text-sm text-zinc-500">No data yet.</p>;
  const { x, y, ticks } = scale(trend ? [...points, ...trend] : points, reference);
  const line = trend ?? points;
  const path = line.map((p, i) => `${i ? "L" : "M"}${x(p.date)},${y(p.value)}`).join(" ");
  const first = points[0];
  const last = points.at(-1)!;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Line chart, latest ${last.value} ${unit}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-zinc-200 dark:stroke-zinc-800" />
          <text x={PAD.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-zinc-500 text-[11px] tabular-nums">
            {Math.round(t)}
          </text>
        </g>
      ))}
      {reference != null && (
        <g>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(reference)} y2={y(reference)} strokeDasharray="4 4" className="stroke-zinc-400" />
          <text x={W - PAD.right} y={y(reference) - 4} textAnchor="end" className="fill-zinc-500 text-[11px]">{referenceLabel}</text>
        </g>
      )}
      <path d={path} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-emerald-600 dark:stroke-emerald-400" />
      {points.map((p, i) => (
        <g key={p.date} className="group">
          <circle cx={x(p.date)} cy={y(p.value)} r={12} fill="transparent" />
          <circle
            cx={x(p.date)}
            cy={y(p.value)}
            r={trend ? 3 : 4}
            className={trend ? "fill-zinc-400 dark:fill-zinc-500" : "fill-emerald-600 stroke-white stroke-2 dark:fill-emerald-400 dark:stroke-zinc-900"}
          />
          <title>{`${formatDate(p.date, { month: "short", day: "numeric" })}: ${p.value} ${unit}${trend?.[i] ? ` (trend ${trend[i].value})` : ""}`}</title>
        </g>
      ))}
      <text x={PAD.left} y={H - 6} className="fill-zinc-500 text-[11px]">{formatDate(first.date, { month: "short", day: "numeric" })}</text>
      {points.length > 1 && (
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-zinc-500 text-[11px]">{formatDate(last.date, { month: "short", day: "numeric" })}</text>
      )}
    </svg>
  );
}

/** Daily bars against a target line. Bars over target turn amber. */
export function TargetBars({ points, target, unit }: { points: Point[]; target: number; unit: string }) {
  if (points.length === 0) return <p className="text-sm text-zinc-500">No data yet.</p>;
  const max = Math.max(target, ...points.map((p) => p.value)) * 1.1;
  const innerW = W - PAD.left - PAD.right;
  const slot = innerW / points.length;
  const barW = Math.max(4, slot - 2);
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);
  const base = y(0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Daily ${unit} against a target of ${target}`}>
      <line x1={PAD.left} x2={W - PAD.right} y1={base} y2={base} className="stroke-zinc-300 dark:stroke-zinc-700" />
      {points.map((p, i) => {
        const over = p.value > target * 1.05;
        const top = y(p.value);
        return (
          <g key={p.date}>
            <rect x={PAD.left + i * slot + (slot - barW) / 2} y={top} width={barW} height={Math.max(0, base - top)} rx={Math.min(4, barW / 2)} className={over ? "fill-amber-500" : "fill-emerald-500"} />
            <title>{`${formatDate(p.date, { month: "short", day: "numeric" })}: ${Math.round(p.value)} ${unit}`}</title>
          </g>
        );
      })}
      <line x1={PAD.left} x2={W - PAD.right} y1={y(target)} y2={y(target)} strokeDasharray="4 4" className="stroke-zinc-500" />
      <text x={PAD.left - 6} y={y(target)} textAnchor="end" dominantBaseline="middle" className="fill-zinc-500 text-[11px] tabular-nums">{Math.round(target)}</text>
      <text x={PAD.left} y={H - 6} className="fill-zinc-500 text-[11px]">{formatDate(points[0].date, { month: "short", day: "numeric" })}</text>
      <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-zinc-500 text-[11px]">{formatDate(points.at(-1)!.date, { month: "short", day: "numeric" })}</text>
    </svg>
  );
}
