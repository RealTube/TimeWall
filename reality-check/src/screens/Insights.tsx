import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  FileDown,
  MoonStar,
} from "lucide-react";
import { api } from "../lib/api";
import type {
  ActivityLog,
  Category,
  CategorySlice,
  DayTotal,
  FocusStats,
  HeatCell,
  Streaks,
  TopActivity,
} from "../lib/types";
import {
  cn,
  endOfMonthISO,
  formatDuration,
  hhmm,
  hoursDecimal,
  lastNWeeks,
  shiftISO,
  shiftMonthISO,
  signedDuration,
  startOfMonthISO,
  startOfWeekISO,
  todayISO,
} from "../lib/utils";
import { ProgressRing } from "../components/ui/ProgressRing";

type Period = "week" | "month";

interface WeekPoint {
  start: string;
  worked: number;
  productive: number;
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Insights() {
  const [period, setPeriod] = useState<Period>("week");
  const [anchor, setAnchor] = useState(() => startOfWeekISO(todayISO()));
  const [days, setDays] = useState<DayTotal[]>([]);
  const [prevDays, setPrevDays] = useState<DayTotal[]>([]);
  const [cats, setCats] = useState<CategorySlice[]>([]);
  const [heat, setHeat] = useState<HeatCell[]>([]);
  const [top, setTop] = useState<TopActivity[]>([]);
  const [prevTop, setPrevTop] = useState<TopActivity[]>([]);
  const [focus, setFocus] = useState<FocusStats | null>(null);
  const [streaks, setStreaks] = useState<Streaks | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [trend, setTrend] = useState<WeekPoint[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const location = useLocation();

  const start = period === "week" ? anchor : startOfMonthISO(anchor);
  const end = period === "week" ? shiftISO(anchor, 6) : endOfMonthISO(anchor);
  const prevStart =
    period === "week" ? shiftISO(start, -7) : startOfMonthISO(shiftMonthISO(start, -1));
  const prevEnd =
    period === "week" ? shiftISO(start, -1) : endOfMonthISO(shiftMonthISO(start, -1));

  useEffect(() => {
    api.dayTotals(start, end).then(setDays).catch(() => {});
    api.categoryBreakdown(start, end).then(setCats).catch(() => {});
    api.hourlyHeatmap(start, end).then(setHeat).catch(() => {});
    api.topActivities(start, end, 50).then(setTop).catch(() => {});
    api.focusStats(start, end).then(setFocus).catch(() => {});
    api.dayTotals(prevStart, prevEnd).then(setPrevDays).catch(() => {});
    api.topActivities(prevStart, prevEnd, 50).then(setPrevTop).catch(() => {});
    // Keep a selection that still belongs to the new range (e.g. a search jump).
    setSelectedDay((d) => (d && d >= start && d <= end ? d : null));
  }, [start, end, prevStart, prevEnd]);

  // Once per visit: streaks, category targets, and the 8-week trend.
  useEffect(() => {
    api.streaks().then(setStreaks).catch(() => {});
    api.categories().then(setCategories).catch(() => {});
    const weeks = lastNWeeks(8);
    api
      .dayTotals(weeks[0].start, weeks[weeks.length - 1].end)
      .then((all) => {
        const byWeek = new Map<string, WeekPoint>(
          weeks.map((w) => [w.start, { start: w.start, worked: 0, productive: 0 }]),
        );
        all.forEach((d) => {
          const bucket = byWeek.get(startOfWeekISO(d.date));
          if (bucket) {
            bucket.worked += d.worked_minutes;
            bucket.productive += d.productive_minutes ?? 0;
          }
        });
        setTrend([...byWeek.values()]);
      })
      .catch(() => {});
  }, []);

  // A search result opens its day here (FR-15.2).
  useEffect(() => {
    const state = location.state as { day?: string } | null;
    if (!state?.day) return;
    setPeriod("week");
    setAnchor(startOfWeekISO(state.day));
    setSelectedDay(state.day);
  }, [location.state]);

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
      out.push(
        byDate.get(d) ?? {
          date: d,
          worked_minutes: 0,
          idle_minutes: 0,
          productive_minutes: 0,
        },
      );
      d = shiftISO(d, 1);
    }
    return out;
  }, [start, end, byDate]);

  const workedTotal = allDays.reduce((a, d) => a + d.worked_minutes, 0);
  const idleTotal = allDays.reduce((a, d) => a + d.idle_minutes, 0);
  // `?? 0` so a stale backend (pre-1.1, no productive field) degrades to 0%,
  // never to NaN on screen.
  const productiveMin = allDays.reduce((a, d) => a + (d.productive_minutes ?? 0), 0);
  const productiveRatio = workedTotal > 0 ? productiveMin / workedTotal : 0;
  const prevWorked = prevDays.reduce((a, d) => a + d.worked_minutes, 0);
  const prevProductive = prevDays.reduce((a, d) => a + (d.productive_minutes ?? 0), 0);

  const targets = useMemo(() => {
    const m = new Map<number, number>();
    categories.forEach((c) => {
      if (c.weekly_target_min > 0) m.set(c.id, c.weekly_target_min);
    });
    return m;
  }, [categories]);

  const rangeLabel =
    period === "week"
      ? `${fmtDay(start)} – ${fmtDay(end)}`
      : new Date(`${start}T00:00:00`).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        });

  const saveReport = async () => {
    setSavedTo(null);
    const md = buildReport({
      rangeLabel,
      period,
      days: allDays,
      workedTotal,
      idleTotal,
      productiveMin,
      prevWorked,
      top: top.slice(0, 10),
      focus,
      cats,
    });
    try {
      const path = await api.saveReport(md);
      if (path) setSavedTo(path);
    } catch (e) {
      console.error("report failed", e);
    }
  };

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
          <button
            onClick={saveReport}
            disabled={workedTotal === 0 && idleTotal === 0}
            title="Save this period as a Markdown report"
            className="flex h-10 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-[13px] font-medium text-muted transition-colors hover:text-fg disabled:pointer-events-none disabled:opacity-40"
          >
            <FileDown className="size-4" />
            Report
          </button>
        </div>
      </header>

      {savedTo && (
        <p className="mt-3 truncate text-[12px] text-productive" title={savedTo}>
          Report saved to {savedTo}
        </p>
      )}

      {/* Reality-check hero — "how much did I actually work, and is it moving?" */}
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
          <CompareLine
            period={period}
            worked={workedTotal}
            productive={productiveMin}
            prevWorked={prevWorked}
            prevProductive={prevProductive}
          />
          {streaks && streaks.current > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface-2/80 px-3 py-1 text-[12px] font-medium text-muted">
              <CalendarCheck className="size-3.5" />
              Day {streaks.current} of your audit
              {streaks.best > streaks.current && ` · best run ${streaks.best}`}
            </p>
          )}
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

      {/* Trend — "is it getting better?" */}
      <Card title="Last 8 weeks" hint="Worked and productive hours per week.">
        <TrendChart data={trend} />
      </Card>

      {/* Movers — the audit's actionable output: cut by name, not by vibe. */}
      <Card title="Where the time moved" hint={`Vs the previous ${period}.`}>
        <Movers current={top} previous={prevTop} />
      </Card>

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
          <TopList items={top.slice(0, 8)} totalMin={workedTotal} />
        )}
      </Card>

      <Card
        title="By category"
        hint={period === "week" && targets.size > 0 ? "Ticks mark weekly targets." : undefined}
      >
        {cats.length === 0 ? (
          <Empty>Nothing categorized in this {period}.</Empty>
        ) : (
          <CategoryBars cats={cats} targets={period === "week" ? targets : undefined} />
        )}
      </Card>
    </div>
  );
}

// --- Period comparison --------------------------------------------------------

function CompareLine({
  period,
  worked,
  productive,
  prevWorked,
  prevProductive,
}: {
  period: Period;
  worked: number;
  productive: number;
  prevWorked: number;
  prevProductive: number;
}) {
  if (worked === 0 && prevWorked === 0) return null;
  const label = period === "week" ? "last week" : "last month";
  if (prevWorked === 0) {
    return (
      <p className="mt-1.5 text-[13px] text-muted/90">
        Nothing logged {label} to compare against.
      </p>
    );
  }
  const delta = worked - prevWorked;
  const sharePts =
    Math.round((worked > 0 ? productive / worked : 0) * 100) -
    Math.round((prevProductive / prevWorked) * 100);
  const shareCopy =
    sharePts === 0
      ? "productive share unchanged"
      : `productive share ${sharePts > 0 ? "up" : "down"} ${Math.abs(sharePts)} pts`;
  return (
    <p className="mt-1.5 text-[13px] text-muted/90 tabular-nums">
      {delta === 0 ? `Even with ${label}` : `${signedDuration(delta)} vs ${label}`} · {shareCopy}
    </p>
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

// --- Trend ---------------------------------------------------------------------

/** Dual-line area chart of the last 8 weeks: total worked vs productive hours. */
function TrendChart({ data }: { data: WeekPoint[] }) {
  if (data.length === 0 || data.every((w) => w.worked === 0)) {
    return <Empty>After a couple of tracked weeks, your direction shows here.</Empty>;
  }

  const W = 560;
  const H = 150;
  const padX = 26;
  const padTop = 14;
  const padBot = 24;
  const max = Math.max(60, ...data.map((d) => d.worked));
  const x = (i: number) => padX + (i * (W - padX * 2)) / (data.length - 1);
  const y = (m: number) => padTop + (1 - m / max) * (H - padTop - padBot);
  const line = (pick: (w: WeekPoint) => number) =>
    data.map((w, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(pick(w)).toFixed(1)}`).join(" ");
  const area = `${line((w) => w.worked)} L${x(data.length - 1).toFixed(1)},${H - padBot} L${padX},${
    H - padBot
  } Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          x1={padX}
          x2={W - padX}
          y1={H - padBot}
          y2={H - padBot}
          className="stroke-border"
        />
        <path d={area} fill="url(#trend-fill)" />
        <path d={line((w) => w.worked)} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        <path
          d={line((w) => w.productive)}
          fill="none"
          stroke="var(--productive)"
          strokeWidth={1.75}
          strokeLinejoin="round"
        />
        {data.map((w, i) => (
          <g key={w.start}>
            <circle cx={x(i)} cy={y(w.worked)} r={3} fill="var(--accent)">
              <title>{`Week of ${fmtDay(w.start)} — ${hoursDecimal(w.worked)}h worked, ${hoursDecimal(
                w.productive,
              )}h productive`}</title>
            </circle>
            <circle cx={x(i)} cy={y(w.productive)} r={2.25} fill="var(--productive)" />
            {i % 2 === 0 && (
              <text
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                className="fill-[var(--muted)] text-[9px]"
              >
                {fmtDay(w.start)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="mt-2 flex gap-4 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-accent" /> worked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-productive" /> productive
        </span>
      </div>
    </div>
  );
}

// --- Movers --------------------------------------------------------------------

/** Activities that gained/lost the most time vs the previous period (FR-12.3). */
function Movers({ current, previous }: { current: TopActivity[]; previous: TopActivity[] }) {
  const MIN_SHIFT = 15; // ignore sub-interval noise

  const { gains, drops } = useMemo(() => {
    const cur = new Map(current.map((t) => [t.activity.toLowerCase(), t]));
    const prev = new Map(previous.map((t) => [t.activity.toLowerCase(), t]));
    const keys = new Set([...cur.keys(), ...prev.keys()]);
    const deltas: { name: string; delta: number }[] = [];
    keys.forEach((k) => {
      const c = cur.get(k);
      const p = prev.get(k);
      const delta = (c?.minutes ?? 0) - (p?.minutes ?? 0);
      if (Math.abs(delta) >= MIN_SHIFT) {
        deltas.push({ name: (c ?? p)!.activity, delta });
      }
    });
    return {
      gains: deltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3),
      drops: deltas.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3),
    };
  }, [current, previous]);

  if (previous.length === 0) {
    return (
      <Empty>Once two periods have data, the biggest shifts show up here, by name.</Empty>
    );
  }
  if (gains.length === 0 && drops.length === 0) {
    return <Empty>No meaningful shifts — your time went to the same things.</Empty>;
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <MoverList title="More time on" items={gains} icon={<ArrowUpRight className="size-3.5" />} />
      <MoverList title="Less time on" items={drops} icon={<ArrowDownRight className="size-3.5" />} />
    </div>
  );
}

function MoverList({
  title,
  items,
  icon,
}: {
  title: string;
  items: { name: string; delta: number }[];
  icon: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted/80">
        {title}
      </div>
      {items.length === 0 ? (
        <p className="text-[13px] text-muted">No real shift.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((m) => (
            <li key={m.name} className="flex items-center gap-2.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
                {icon}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px]">{m.name}</span>
              <span className="shrink-0 text-[13px] tabular-nums text-muted">
                {signedDuration(m.delta)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
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

function CategoryBars({
  cats,
  targets,
}: {
  cats: CategorySlice[];
  targets?: Map<number, number>;
}) {
  const targetOf = (c: CategorySlice) =>
    c.category_id != null ? targets?.get(c.category_id) ?? 0 : 0;
  const max = Math.max(1, ...cats.map((c) => Math.max(c.minutes, targetOf(c))));
  const anyTarget = cats.some((c) => targetOf(c) > 0);
  return (
    <div className="flex flex-col gap-3.5">
      {cats.map((c) => {
        const target = targetOf(c);
        return (
          <div key={`${c.category_id}`} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-[14px]">{c.name}</span>
            <div className="relative h-2.5 flex-1 overflow-visible rounded-full bg-surface-2">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${(c.minutes / max) * 100}%`, backgroundColor: c.color }}
              />
              {target > 0 && (
                <span
                  title={`Target ${formatDuration(target)}/week`}
                  className="absolute -inset-y-1 w-0.5 rounded-full bg-[var(--muted)] opacity-70"
                  style={{ left: `${(target / max) * 100}%` }}
                />
              )}
            </div>
            <span
              className={cn(
                "shrink-0 text-right text-[13px] tabular-nums text-muted",
                anyTarget ? "w-28" : "w-16",
              )}
            >
              {target > 0
                ? `${formatDuration(c.minutes)} of ${formatDuration(target)}`
                : formatDuration(c.minutes)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// --- Markdown report (FR-14) --------------------------------------------------

function buildReport(input: {
  rangeLabel: string;
  period: Period;
  days: DayTotal[];
  workedTotal: number;
  idleTotal: number;
  productiveMin: number;
  prevWorked: number;
  top: TopActivity[];
  focus: FocusStats | null;
  cats: CategorySlice[];
}): string {
  const { rangeLabel, period, days, workedTotal, idleTotal, productiveMin, prevWorked, top, focus, cats } =
    input;
  const share = workedTotal > 0 ? Math.round((productiveMin / workedTotal) * 100) : 0;
  const activeDays = days.filter((d) => d.worked_minutes > 0).length;
  const L: string[] = [];
  L.push(`# Hima time audit — ${rangeLabel}`, "");
  L.push(`- **Worked:** ${formatDuration(workedTotal)} across ${activeDays} active day${activeDays === 1 ? "" : "s"}`);
  L.push(`- **Productive:** ${share}% (${formatDuration(productiveMin)})`);
  if (idleTotal > 0) L.push(`- **Away from desk:** ${formatDuration(idleTotal)}`);
  if (prevWorked > 0) {
    L.push(`- **Vs previous ${period}:** ${signedDuration(workedTotal - prevWorked)}`);
  }
  if (focus && focus.days_counted > 0) {
    L.push(
      `- **Focus:** ${formatDuration(Math.round(focus.avg_block_min))} avg block · ` +
        `${formatDuration(focus.longest_block_min)} longest · ` +
        `${focus.switches_per_day.toFixed(1)} switches/day`,
    );
  }
  L.push("", "## Days", "", "| Day | Worked | Productive | Away |", "|---|---|---|---|");
  days.forEach((d) => {
    if (d.worked_minutes === 0 && d.idle_minutes === 0) return;
    L.push(
      `| ${fmtDay(d.date)} | ${formatDuration(d.worked_minutes)} | ${formatDuration(
        d.productive_minutes,
      )} | ${formatDuration(d.idle_minutes)} |`,
    );
  });
  if (top.length > 0) {
    L.push("", "## Top activities", "", "| # | Activity | Time | Share |", "|---|---|---|---|");
    top.forEach((t, i) => {
      const pct = workedTotal > 0 ? Math.round((t.minutes / workedTotal) * 100) : 0;
      L.push(`| ${i + 1} | ${mdEscape(t.activity)} | ${formatDuration(t.minutes)} | ${pct}% |`);
    });
  }
  if (cats.length > 0) {
    L.push("", "## Categories", "", "| Category | Time | Kind |", "|---|---|---|");
    cats.forEach((c) => {
      L.push(
        `| ${mdEscape(c.name)} | ${formatDuration(c.minutes)} | ${
          c.is_productive ? "Productive" : "Busywork"
        } |`,
      );
    });
  }
  L.push("", "---", "", "_Generated by Hima — sampled as it happened, on-device._", "");
  return L.join("\n");
}

/** Keep user text from breaking Markdown table cells. */
function mdEscape(s: string): string {
  return s.replace(/\|/g, "\\|");
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
