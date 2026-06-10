import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import type { CategorySlice, DayTotal } from "../lib/types";
import { formatDuration, hoursDecimal, shiftISO, todayISO } from "../lib/utils";
import { ProgressRing } from "../components/ui/ProgressRing";

function startOfWeek(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return todayISO(d);
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function History() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayISO()));
  const [days, setDays] = useState<DayTotal[]>([]);
  const [cats, setCats] = useState<CategorySlice[]>([]);

  const weekEnd = shiftISO(weekStart, 6);

  useEffect(() => {
    api.dayTotals(weekStart, weekEnd).then(setDays).catch(() => {});
    api.categoryBreakdown(weekStart, weekEnd).then(setCats).catch(() => {});
  }, [weekStart, weekEnd]);

  const byDate = useMemo(() => {
    const m = new Map<string, DayTotal>();
    days.forEach((d) => m.set(d.date, d));
    return m;
  }, [days]);

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = shiftISO(weekStart, i);
        return byDate.get(date) ?? { date, worked_minutes: 0, idle_minutes: 0 };
      }),
    [weekStart, byDate],
  );

  const workedTotal = weekDays.reduce((a, d) => a + d.worked_minutes, 0);
  const idleTotal = weekDays.reduce((a, d) => a + d.idle_minutes, 0);
  const productiveMin = cats.filter((c) => c.is_productive).reduce((a, c) => a + c.minutes, 0);
  const productiveRatio = workedTotal > 0 ? productiveMin / workedTotal : 0;
  const maxCat = Math.max(1, ...cats.map((c) => c.minutes));

  const isThisWeek = weekStart === startOfWeek(todayISO());
  const rangeLabel = `${fmt(weekStart)} – ${fmt(weekEnd)}`;

  return (
    <div className="mx-auto max-w-3xl px-10 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">History</h1>
          <p className="mt-1 text-[15px] text-muted">Where your time actually went.</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-surface-2 p-1">
          <NavBtn onClick={() => setWeekStart(shiftISO(weekStart, -7))}>
            <ChevronLeft className="size-4" />
          </NavBtn>
          <span className="min-w-[140px] text-center text-[13px] font-medium tabular-nums">
            {rangeLabel}
          </span>
          <NavBtn onClick={() => setWeekStart(shiftISO(weekStart, 7))} disabled={isThisWeek}>
            <ChevronRight className="size-4" />
          </NavBtn>
        </div>
      </header>

      {/* Reality-check hero */}
      <section className="mt-8 flex items-center justify-between gap-8 rounded-2xl border border-border bg-surface p-7 shadow-soft">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold tabular-nums">{hoursDecimal(workedTotal)}</span>
            <span className="text-lg font-medium text-muted">hours worked</span>
          </div>
          <p className="mt-2 max-w-xs text-[15px] text-muted">
            {workedTotal === 0
              ? "No check-ins logged this week yet."
              : `${Math.round(productiveRatio * 100)}% of it was productive work` +
                (idleTotal > 0 ? ` · ${formatDuration(idleTotal)} away from your desk.` : ".")}
          </p>
        </div>
        <ProgressRing value={productiveRatio} size={116} stroke={8} color="var(--productive)">
          <div className="text-xl font-semibold tabular-nums">
            {Math.round(productiveRatio * 100)}%
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted">productive</div>
        </ProgressRing>
      </section>

      {/* Per-day bars */}
      <section className="mt-6 rounded-2xl border border-border bg-surface p-7 shadow-soft">
        <h2 className="mb-5 text-[13px] font-semibold uppercase tracking-wider text-muted">
          Daily hours
        </h2>
        <WeekBars days={weekDays} />
      </section>

      {/* Category breakdown */}
      <section className="mt-6 rounded-2xl border border-border bg-surface p-7 shadow-soft">
        <h2 className="mb-5 text-[13px] font-semibold uppercase tracking-wider text-muted">
          By category
        </h2>
        {cats.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Nothing categorized this week.</p>
        ) : (
          <div className="flex flex-col gap-3.5">
            {cats.map((c) => (
              <div key={`${c.category_id}`} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-[14px]">{c.name}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${(c.minutes / maxCat) * 100}%`, backgroundColor: c.color }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-[13px] tabular-nums text-muted">
                  {formatDuration(c.minutes)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function WeekBars({ days }: { days: DayTotal[] }) {
  const max = Math.max(60, ...days.map((d) => d.worked_minutes + d.idle_minutes));
  const W = 560;
  const H = 150;
  const pad = 22;
  const slot = (W - pad * 2) / days.length;
  const barW = Math.min(34, slot * 0.5);
  const scale = (m: number) => (m / max) * (H - 28);
  const ref8 = scale(480); // 8-hour reference line

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {480 <= max && (
        <g>
          <line
            x1={pad}
            x2={W - pad}
            y1={H - 22 - ref8}
            y2={H - 22 - ref8}
            className="stroke-border"
            strokeDasharray="3 4"
          />
          <text x={W - pad} y={H - 26 - ref8} textAnchor="end" className="fill-[var(--muted)] text-[9px]">
            8h
          </text>
        </g>
      )}
      {days.map((d, i) => {
        const cx = pad + slot * i + slot / 2;
        const worked = scale(d.worked_minutes);
        const idle = scale(d.idle_minutes);
        const dow = new Date(`${d.date}T00:00:00`).getDay();
        const label = DOW[(dow + 6) % 7];
        return (
          <g key={d.date}>
            {idle > 0 && (
              <rect
                x={cx - barW / 2}
                y={H - 22 - worked - idle}
                width={barW}
                height={idle}
                rx={3}
                className="fill-[var(--idle)] opacity-40"
              />
            )}
            <rect
              x={cx - barW / 2}
              y={H - 22 - worked}
              width={barW}
              height={Math.max(worked, d.worked_minutes > 0 ? 3 : 0)}
              rx={3}
              className="fill-accent"
            />
            <text x={cx} y={H - 8} textAnchor="middle" className="fill-[var(--muted)] text-[10px]">
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function NavBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-fg disabled:pointer-events-none disabled:opacity-30"
      {...props}
    >
      {children}
    </button>
  );
}

function fmt(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
