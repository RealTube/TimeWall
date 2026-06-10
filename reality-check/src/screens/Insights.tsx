import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MoonStar } from "lucide-react";
import { api } from "../lib/api";
import type {
  ActivityLog,
  Category,
  CategorySlice,
  DayTotal,
  FocusStats,
  HeatCell,
  TopActivity,
} from "../lib/types";
import {
  cn,
  endOfMonthISO,
  formatDuration,
  hhmm,
  hoursDecimal,
  shiftISO,
  shiftMonthISO,
  startOfMonthISO,
  startOfWeekISO,
  todayISO,
} from "../lib/utils";
import { ProgressRing } from "../components/ui/ProgressRing";

type Period = "week" | "month";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Insights() {
  const [period, setPeriod] = useState<Period>("week");
  const [anchor, setAnchor] = useState(() => startOfWeekISO(todayISO()));
  const [days, setDays] = useState<DayTotal[]>([]);
  const [cats, setCats] = useState<CategorySlice[]>([]);
  const [heat, setHeat] = useState<HeatCell[]>([]);
  const [top, setTop] = useState<TopActivity[]>([]);
  const [focus, setFocus] = useState<FocusStats | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const start = period === "week" ? anchor : startOfMonthISO(anchor);
  const end = period === "week" ? shiftISO(anchor, 6) : endOfMonthISO(anchor);

  useEffect(() => {
    api.dayTotals(start, end).then(setDays).catch(() => {});
    api.categoryBreakdown(start, end).then(setCats).catch(() => {});
    api.hourlyHeatmap(start, end).then(setHeat).catch(() => {});
    api.topActivities(start, end, 8).then(setTop).catch(() => {});
    api.focusStats(start, end).then(setFocus).catch(() => {});
    setSelectedDay(null);
  }, [start, end]);

  const switchPeriod = (p: Period) => {
    setPeriod(p);
    setAnchor(p === "week" ? startOfWeekISO(todayISO()) : startOfMonthISO(todayISO()));
  };

  const navigate = (dir: -1 | 1) => {
    setAnchor(period === "week" ? shiftISO(anchor, dir * 7) : shiftMonthISO(anchor, dir));
  };

  const isCurrent =
    period === "week"
      ? anchor === startOfWeekISO(todayISO())
      : startOfMonthISO(anchor) === startOfMonthISO(todayISO());

  const byDate = useMemo(() => {
    const m = new Map<string, DayTotal>();
    days.forEach((d) => m.set(d.date, d));
    return m;
  }, [days]);

  // Dense day list across the whole period, including empty days.
  const allDays = useMemo(() => {
    const out: DayTotal[] = [];
    let d = start;
    while (d <= end && out.length < 62) {
      out.push(byDate.get(d) ?? { date: d, worked_minutes: 0, idle_minutes: 0 });
      d = shiftISO(d, 1);
    }
    return out;
  }, [start, end, byDate]);

  const workedTotal = allDays.reduce((a, d) => a + d.worked_minutes, 0);
  const idleTotal = allDays.reduce((a, d) => a + d.idle_minutes, 0);
  const productiveMin = cats.filter((c) => c.is_productive).reduce((a, c) => a + c.minutes, 0);
  const productiveRatio = workedTotal > 0 ? productiveMin / workedTotal : 0;

  const rangeLabel =
    period === "week"
      ? `${fmtDay(start)} – ${fmtDay(end)}`
      : new Date(`${start}T00:00:00`).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        });

  return (
    <div className="mx-auto max-w-3xl px-10 py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Insights</h1>
          <p className="mt-1 text-[15px] text-muted">Where your time actually went.</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
            {(["week", "month"] as const).map((p) => (
              <button
                key={p}
                onClick={() => switchPeriod(p)}
                className={cn(
                  "h-8 rounded-lg px-3 text-[13px] font-medium capitalize transition-colors",
                  period === p ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-surface-2 p-1">
            <NavBtn onClick={() => navigate(-1)} aria-label="Previous period">
              <ChevronLeft className="size-4" />
            </NavBtn>
            <span className="min-w-[130px] text-center text-[13px] font-medium tabular-nums">
              {rangeLabel}
            </span>
            <NavBtn onClick={() => navigate(1)} disabled={isCurrent} aria-label="Next period">
              <ChevronRight className="size-4" />
            </NavBtn>
          </div>
        </div>
      </header>

      {/* Reality-check hero — "how much did I actually work?" */}
      <section className="mt-8 flex items-center justify-between gap-8 rounded-2xl border border-border bg-surface p-7 shadow-soft">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold tabular-nums">{hoursDecimal(workedTotal)}</span>
            <span className="text-lg font-medium text-muted">hours worked</span>
          </div>
          <p className="mt-2 max-w-xs text-[15px] text-muted">
            {workedTotal === 0
              ? `No check-ins logged this ${period} yet.`
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

      {/* Daily bars — "which days leaked?" Click a bar to open the day. */}
      <Card title="Daily hours" hint="Click a day to see its full log.">
        <DayBars
          days={allDays}
          compact={period === "month"}
          selected={selectedDay}
          onSelect={(d) => setSelectedDay(selectedDay === d ? null : d)}
        />
      </Card>

      {selectedDay && <DayDetail date={selectedDay} />}

      {/* Heatmap — "when do I actually work?" */}
      <Card title="When you work" hint="Worked minutes by hour of day.">
        <Heatmap cells={heat} />
      </Card>

      {/* Focus profile — "how fragmented am I?" */}
      <Card
        title="Focus"
        hint="Back-to-back check-ins with the same answer count as one block."
      >
        {focus && focus.days_counted > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Avg focus block" value={formatDuration(Math.round(focus.avg_block_min))} />
            <Stat label="Longest block" value={formatDuration(focus.longest_block_min)} />
            <Stat label="Switches / day" value={focus.switches_per_day.toFixed(1)} />
          </div>
        ) : (
          <Empty>Log a few check-ins and your focus profile appears here.</Empty>
        )}
      </Card>

      {/* Top activities — "what, by name, ate my week?" */}
      <Card title="Top activities">
        {top.length === 0 ? (
          <Empty>Your most time-consuming activities will rank here.</Empty>
        ) : (
          <TopList items={top} totalMin={workedTotal} />
        )}
      </Card>

      <Card title="By category">
        {cats.length === 0 ? (
          <Empty>Nothing categorized in this {period}.</Empty>
        ) : (
          <CategoryBars cats={cats} />
        )}
      </Card>
    </div>
  );
}

// --- Daily bars --------------------------------------------------------------

function DayBars({
  days,
  compact,
  selected,
  onSelect,
}: {
  days: DayTotal[];
  compact: boolean;
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const max = Math.max(60, ...days.map((d) => d.worked_minutes + d.idle_minutes));
  const W = 560;
  const H = 150;
  const pad = 22;
  const slot = (W - pad * 2) / days.length;
  const barW = Math.min(compact ? 12 : 34, slot * 0.62);
  const scale = (m: number) => (m / max) * (H - 28);
  const ref8 = scale(480);
  const today = todayISO();

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
        const isSel = selected === d.date;
        const isFuture = d.date > today;
        const label = compact
          ? i % 7 === 0
            ? String(Number(d.date.slice(8)))
            : ""
          : DOW[(new Date(`${d.date}T00:00:00`).getDay() + 6) % 7];
        return (
          <g
            key={d.date}
            onClick={() => !isFuture && onSelect(d.date)}
            className={isFuture ? undefined : "cursor-pointer"}
          >
            {/* generous invisible hit area */}
            <rect x={cx - slot / 2} y={0} width={slot} height={H} fill="transparent" />
            {isSel && (
              <rect
                x={cx - slot / 2 + 1}
                y={2}
                width={slot - 2}
                height={H - 18}
                rx={6}
                className="fill-[var(--accent)] opacity-10"
              />
            )}
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
              className={cn("fill-accent", isSel && "brightness-110")}
            />
            {label && (
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-[var(--muted)] text-[10px]">
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// --- Day drill-down ----------------------------------------------------------

function DayDetail({ date }: { date: string }) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    api.logsForDate(date).then(setLogs).catch(() => {});
    api.categories().then(setCategories).catch(() => {});
  }, [date]);

  const catMap = useMemo(() => {
    const m = new Map<number, Category>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const label = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <Card title={label}>
      {logs.length === 0 ? (
        <Empty>No check-ins were logged this day.</Empty>
      ) : (
        <ul className="-mx-2 divide-y divide-border">
          {logs.map((log) => {
            const cat = log.category_id ? catMap.get(log.category_id) : undefined;
            return (
              <li key={log.id} className="flex items-center gap-4 px-2 py-2.5">
                <span className="w-12 shrink-0 font-mono text-[13px] tabular-nums text-muted">
                  {hhmm(log.time)}
                </span>
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: log.was_idle ? "var(--idle)" : cat?.color ?? "var(--border)",
                  }}
                />
                <span className={cn("flex-1 truncate text-[15px]", log.was_idle && "text-muted")}>
                  {log.activity}
                  {log.was_idle && (
                    <MoonStar className="ml-2 inline size-3.5 -translate-y-px text-idle" />
                  )}
                </span>
                {cat && <span className="shrink-0 text-[12px] text-muted">{cat.name}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// --- Heatmap -----------------------------------------------------------------

function Heatmap({ cells }: { cells: HeatCell[] }) {
  if (cells.length === 0) {
    return <Empty>Once you have check-ins, your working hours light up here.</Empty>;
  }

  // Trim the hour axis to the lived-in part of the day (with sane defaults).
  const hours = cells.map((c) => c.hour);
  const hMin = Math.min(8, ...hours);
  const hMax = Math.max(18, ...hours);
  const span = Array.from({ length: hMax - hMin + 1 }, (_, i) => hMin + i);
  const maxMin = Math.max(15, ...cells.map((c) => c.minutes));

  const grid = new Map<string, number>();
  cells.forEach((c) => grid.set(`${c.weekday}:${c.hour}`, c.minutes));

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[420px] gap-[3px]"
        style={{ gridTemplateColumns: `34px repeat(${span.length}, minmax(0, 1fr))` }}
      >
        {DOW.map((day, w) => (
          <div key={day} className="contents">
            <span className="flex items-center text-[10px] font-medium text-muted">{day}</span>
            {span.map((h) => {
              const m = grid.get(`${w}:${h}`) ?? 0;
              return (
                <div
                  key={h}
                  title={m > 0 ? `${day} ${String(h).padStart(2, "0")}:00 — ${formatDuration(m)}` : undefined}
                  className="aspect-square rounded-[4px] bg-surface-2"
                >
                  {m > 0 && (
                    <div
                      className="h-full w-full rounded-[4px] bg-accent"
                      style={{ opacity: 0.25 + 0.75 * (m / maxMin) }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {/* hour axis */}
        <span />
        {span.map((h) => (
          <span key={h} className="text-center text-[9px] tabular-nums text-muted">
            {h % 3 === 0 ? `${h}` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

// --- Top activities ----------------------------------------------------------

function TopList({ items, totalMin }: { items: TopActivity[]; totalMin: number }) {
  const max = Math.max(1, ...items.map((i) => i.minutes));
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, i) => (
        <li key={item.activity} className="flex items-center gap-3">
          <span className="w-5 shrink-0 text-right text-[12px] font-medium tabular-nums text-muted">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[14px]">{item.activity}</span>
              <span className="shrink-0 text-[13px] tabular-nums text-muted">
                {formatDuration(item.minutes)}
                {totalMin > 0 && (
                  <span className="ml-1.5 text-[11px]">
                    {Math.round((item.minutes / totalMin) * 100)}%
                  </span>
                )}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${(item.minutes / max) * 100}%` }}
              />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// --- Category breakdown ------------------------------------------------------

function CategoryBars({ cats }: { cats: CategorySlice[] }) {
  const max = Math.max(1, ...cats.map((c) => c.minutes));
  return (
    <div className="flex flex-col gap-3.5">
      {cats.map((c) => (
        <div key={`${c.category_id}`} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-[14px]">{c.name}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${(c.minutes / max) * 100}%`, backgroundColor: c.color }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-[13px] tabular-nums text-muted">
            {formatDuration(c.minutes)}
          </span>
        </div>
      ))}
    </div>
  );
}

// --- Shared bits -------------------------------------------------------------

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-7 shadow-soft">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">{title}</h2>
        {hint && <span className="text-[12px] text-muted/80">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2/60 px-4 py-3.5">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[12px] text-muted">{label}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
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

function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
