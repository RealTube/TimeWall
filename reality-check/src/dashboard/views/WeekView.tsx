import { useMemo, useState } from "react";
import { useWeek } from "../../hooks/useWeek";
import {
  dayOfMonth,
  formatDuration,
  formatHours,
  shortDateLabel,
  toIsoDate,
} from "../../lib/format";
import { CATEGORY_META, CATEGORY_ORDER } from "../../types";
import type { Category } from "../../types";
import { LogTable } from "../components/LogTable";

export function WeekView() {
  const { buckets, refresh } = useWeek(7);
  const todayIso = toIsoDate(new Date());
  const [selected, setSelected] = useState<string>(todayIso);

  const maxMinutes = useMemo(
    () => Math.max(60, ...buckets.map((b) => b.breakdown.total)),
    [buckets],
  );

  const selectedBucket = buckets.find((b) => b.date === selected) ?? null;

  const weekTotal = buckets.reduce((sum, b) => sum + b.breakdown.total, 0);
  const weekOutput = buckets.reduce((sum, b) => sum + b.breakdown.output, 0);
  const weekLeak = buckets.reduce((sum, b) => sum + b.breakdown.leak, 0);
  const activeDays = buckets.filter((b) => b.breakdown.total > 0).length;

  return (
    <div className="max-w-6xl mx-auto px-10 pt-10 pb-12 fade-in">
      <header className="mb-8">
        <div className="text-[11px] tracking-[0.18em] uppercase text-[color:var(--color-text-muted)] font-medium">
          Last 7 days
        </div>
        <h1 className="mt-2 text-[34px] leading-[1.15] font-semibold tracking-tight">
          The pattern beneath the days
        </h1>
        <p className="mt-3 text-[15px] text-[color:var(--color-text-secondary)] max-w-2xl">
          One day is noise. Seven is signal. Click any bar to drill in.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <Summary
          label="Total tracked"
          primary={formatHours(weekTotal)}
          hint={`${activeDays} active ${activeDays === 1 ? "day" : "days"}`}
        />
        <Summary
          label="Total output"
          primary={formatHours(weekOutput)}
          hint={
            weekTotal > 0
              ? `${((weekOutput / weekTotal) * 100).toFixed(0)}% of tracked time`
              : "—"
          }
          tone="#7ddca4"
        />
        <Summary
          label="Total leak"
          primary={formatHours(weekLeak)}
          hint={
            weekTotal > 0
              ? `${((weekLeak / weekTotal) * 100).toFixed(0)}% of tracked time`
              : "—"
          }
          tone="#ff7a8a"
        />
      </section>

      <section className="glass-panel rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-medium text-[color:var(--color-text-primary)]">
            Daily breakdown
          </div>
          <Legend />
        </div>
        <div className="flex items-end justify-between gap-3 h-56">
          {buckets.map((b) => (
            <DayBar
              key={b.date}
              date={b.date}
              minutes={b.breakdown.total}
              breakdown={b.breakdown}
              max={maxMinutes}
              selected={b.date === selected}
              isToday={b.date === todayIso}
              onClick={() => setSelected(b.date)}
            />
          ))}
        </div>
      </section>

      {selectedBucket && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[18px] font-semibold tracking-tight">
              {prettyDate(selectedBucket.date, todayIso)}
            </h2>
            <span className="text-[12.5px] text-[color:var(--color-text-secondary)] tabular-nums">
              {formatDuration(selectedBucket.breakdown.total)} •{" "}
              {selectedBucket.logs.length} entries
            </span>
          </div>
          <LogTable logs={selectedBucket.logs} onCategoryChanged={refresh} />
        </section>
      )}
    </div>
  );
}

function DayBar({
  date,
  minutes,
  breakdown,
  max,
  selected,
  isToday,
  onClick,
}: {
  date: string;
  minutes: number;
  breakdown: { [k in Category]: number } & { total: number };
  max: number;
  selected: boolean;
  isToday: boolean;
  onClick: () => void;
}) {
  const heightPct = max > 0 ? (minutes / max) * 100 : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 flex flex-col items-center group h-full"
      title={`${date} — ${formatDuration(minutes)}`}
    >
      <div className="flex-1 w-full flex items-end pb-2">
        <div className="w-full relative">
          <div
            className={`w-full rounded-lg transition-all duration-300 flex flex-col-reverse overflow-hidden ${
              selected
                ? "ring-1 ring-white/20"
                : "opacity-90 group-hover:opacity-100"
            }`}
            style={{
              height: minutes > 0 ? `${Math.max(2, heightPct)}%` : "4px",
              minHeight: minutes > 0 ? "8px" : "4px",
              background:
                minutes === 0 ? "rgba(255,255,255,0.04)" : "transparent",
            }}
          >
            {minutes > 0 &&
              CATEGORY_ORDER.map((key) => {
                const m = breakdown[key];
                if (m <= 0) return null;
                return (
                  <div
                    key={key}
                    style={{
                      height: `${(m / minutes) * 100}%`,
                      background: CATEGORY_META[key].color,
                      boxShadow: `inset 0 0 12px ${CATEGORY_META[key].color}22`,
                    }}
                  />
                );
              })}
          </div>
          {minutes > 0 && (
            <div className="absolute -top-5 left-0 right-0 text-center text-[10px] font-mono tabular-nums text-[color:var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
              {formatHours(minutes)}
            </div>
          )}
        </div>
      </div>
      <div
        className={`mt-1 text-[11px] tracking-wide uppercase font-medium ${
          selected
            ? "text-[color:var(--color-text-primary)]"
            : "text-[color:var(--color-text-muted)]"
        }`}
      >
        {shortDateLabel(date)}
      </div>
      <div
        className={`text-[10.5px] tabular-nums ${
          isToday
            ? "text-[color:var(--color-accent)]"
            : "text-[color:var(--color-text-muted)]"
        }`}
      >
        {dayOfMonth(date)}
      </div>
    </button>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {CATEGORY_ORDER.filter((k) => k !== "unknown").map((key) => {
        const m = CATEGORY_META[key];
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: m.color }}
            />
            <span className="text-[11px] text-[color:var(--color-text-secondary)]">
              {m.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Summary({
  label,
  primary,
  hint,
  tone,
}: {
  label: string;
  primary: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="glass-panel rounded-2xl p-5 fade-in">
      <div className="text-[10.5px] font-medium tracking-[0.14em] uppercase text-[color:var(--color-text-muted)]">
        {label}
      </div>
      <div
        className="mt-2 text-[26px] leading-[1.15] font-semibold tracking-tight"
        style={{ color: tone }}
      >
        {primary}
      </div>
      <div className="mt-1 text-[12.5px] text-[color:var(--color-text-secondary)]">
        {hint}
      </div>
    </div>
  );
}

function prettyDate(iso: string, todayIso: string): string {
  if (iso === todayIso) return "Today";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
