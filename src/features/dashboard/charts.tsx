"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { CategoryMetrics } from "@/features/assessment/metrics";

/* ---------------------------------------------------------------------------
 * Status distribution — one segmented bar (part-to-whole, ≤ 5 segments).
 * Status colours are reserved for state and always shown with label + count.
 * ------------------------------------------------------------------------- */

export type StatusSegment = { key: string; label: string; count: number; color: string };

export function StatusDistribution({ segments, total }: { segments: StatusSegment[]; total: number }) {
  const visible = segments.filter((s) => s.count > 0);
  return (
    <div className="space-y-4">
      <div
        className="flex h-4 w-full gap-0.5 overflow-hidden rounded-[4px] bg-muted"
        role="img"
        aria-label={segments.map((s) => `${s.label}: ${s.count}`).join(", ")}
      >
        {visible.map((s) => (
          <div
            key={s.key}
            title={`${s.label}: ${s.count} su ${total}`}
            style={{ width: `${(s.count / total) * 100}%`, background: s.color }}
            className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
          />
        ))}
      </div>
      {/* Legend doubles as the table view: label, count and share, in text tokens. */}
      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: s.color }}
              aria-hidden="true"
            />
            <span className="flex-1 text-muted-foreground">{s.label}</span>
            <span className="font-medium tabular-nums">{s.count}</span>
            <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
              {total ? Math.round((s.count / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Implementation by category — one series, one hue, ranked horizontal bars.
 * ------------------------------------------------------------------------- */

type CategoryDatum = { name: string; rate: number; implemented: number; applicable: number; partial: number };

function CategoryTooltip({ active, payload }: { active?: boolean; payload?: { payload: CategoryDatum }[] }) {
  const d = active ? payload?.[0]?.payload : undefined;
  if (!d) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{d.name}</p>
      <p>
        Implementati <span className="font-semibold tabular-nums">{d.implemented}</span> su{" "}
        <span className="tabular-nums">{d.applicable}</span> applicabili ({d.rate}%)
      </p>
      {d.partial > 0 ? <p className="text-muted-foreground">Parziali: {d.partial}</p> : null}
    </div>
  );
}

export function CategoryImplementationChart({ categories }: { categories: CategoryMetrics[] }) {
  const data: CategoryDatum[] = categories.map((c) => ({
    name: c.name.replace(/\s*\(art\. \d+\)$/, ""),
    rate: c.implementationRate,
    implemented: c.implemented,
    applicable: c.applicable,
    partial: c.partial,
  }));

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 48, bottom: 4, left: 8 }}
          barCategoryGap={18}
        >
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis
            type="number"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={170}
            tick={{ fill: "var(--foreground)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<CategoryTooltip />} />
          <Bar
            dataKey="rate"
            fill="var(--chart-1)"
            radius={[0, 4, 4, 0]}
            maxBarSize={16}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="rate"
              position="right"
              formatter={(v) => `${v}%`}
              style={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
