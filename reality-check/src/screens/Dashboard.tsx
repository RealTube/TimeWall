import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { BellRing, CornerDownLeft, Plus, Timer } from "lucide-react";
import { api } from "../lib/api";
import type { ActivityLog, AppSettings, Category } from "../lib/types";
import { countdownLabel, formatDuration, greeting, MISSED_LABEL, secondsUntil } from "../lib/utils";
import { LogRow } from "../components/LogRow";
import { GhostInput } from "../components/ui/GhostInput";
import { ProgressRing } from "../components/ui/ProgressRing";

const WORKDAY_MIN = 8 * 60;

export default function Dashboard() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [nextAt, setNextAt] = useState(0);
  const [, setClockTick] = useState(0); // re-render so the countdown stays fresh

  const load = useCallback(() => {
    api.todaysLogs().then(setLogs).catch(() => {});
    api.settings().then(setSettings).catch(() => {});
    api.categories().then(setCategories).catch(() => {});
    api.nextPromptAt().then(setNextAt).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const un = listen("refresh-dashboard", load);
    const tick = window.setInterval(() => {
      setClockTick((t) => t + 1);
      api.nextPromptAt().then(setNextAt).catch(() => {});
    }, 30_000);
    return () => {
      un.then((f) => f());
      window.clearInterval(tick);
    };
  }, [load]);

  const catMap = useMemo(() => {
    const m = new Map<number, Category>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const interval = settings?.interval_minutes ?? 15;
  const worked = logs.filter((l) => !l.was_idle);
  // Sum what each entry actually covered when it was logged — changing the
  // interval setting must never rewrite today's totals.
  const sumMin = (xs: ActivityLog[]) => xs.reduce((a, l) => a + (l.interval_min ?? interval), 0);
  const workedMin = sumMin(worked);
  const missedMin = sumMin(logs.filter((l) => l.was_idle && l.activity === MISSED_LABEL));
  const awayMin = sumMin(logs.filter((l) => l.was_idle && l.activity !== MISSED_LABEL));
  const ringValue = Math.min(1, workedMin / WORKDAY_MIN);
  const animatedHours = useCountUp(workedMin / 60);

  // Today's worked minutes per category, for the distribution strip.
  const todaySlices = useMemo(() => {
    const acc = new Map<string, { name: string; color: string; minutes: number }>();
    worked.forEach((l) => {
      const cat = l.category_id ? catMap.get(l.category_id) : undefined;
      const key = cat ? String(cat.id) : "uncategorized";
      const slice =
        acc.get(key) ??
        (cat
          ? { name: cat.name, color: cat.color, minutes: 0 }
          : { name: "Uncategorized", color: "var(--idle)", minutes: 0 });
      slice.minutes += l.interval_min ?? interval;
      acc.set(key, slice);
    });
    return [...acc.values()].sort((a, b) => b.minutes - a.minutes);
  }, [worked, catMap, interval]);

  const pausedUntil = settings ? settings.paused_until * 1000 : 0;
  const timerLabel = settings?.paused
    ? "Timer paused"
    : pausedUntil > Date.now()
      ? `Paused until ${new Date(pausedUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      : nextAt > 0
        ? `Next check-in in ${countdownLabel(secondsUntil(nextAt))}`
        : null;

  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-3xl px-10 py-12">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm text-muted">
            {greeting()} · {dateLabel}
          </p>
          <h1 className="mt-2 flex items-baseline gap-2 text-5xl font-semibold tracking-tight">
            <span className="tabular-nums">{animatedHours.toFixed(2)}</span>
            <span className="text-2xl font-medium text-muted">hours</span>
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            {worked.length === 0
              ? "Nothing tracked yet today."
              : `Across ${worked.length} check-in${worked.length === 1 ? "" : "s"}`}
            {awayMin > 0 && ` · ${formatDuration(awayMin)} away`}
            {missedMin > 0 && ` · ${formatDuration(missedMin)} unanswered`}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {timerLabel && (
              <p className="inline-flex items-center gap-1.5 rounded-full bg-surface-2/80 px-3 py-1 text-[12px] font-medium text-muted">
                <Timer className="size-3.5" />
                {timerLabel}
              </p>
            )}
            <button
              onClick={() => api.checkInNow().catch(() => {})}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-2/80 px-3 py-1 text-[12px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <BellRing className="size-3.5" />
              Check in now
            </button>
          </div>
        </div>

        <ProgressRing value={ringValue}>
          <div className="text-2xl font-semibold tabular-nums">
            {Math.round(ringValue * 100)}%
          </div>
          <div className="text-[11px] uppercase tracking-wider text-muted">of 8h</div>
        </ProgressRing>
      </header>

      {todaySlices.length > 0 && (
        <section className="mt-9">
          <div className="flex h-2.5 gap-px overflow-hidden rounded-full">
            {todaySlices.map((s) => (
              <div
                key={s.name}
                title={`${s.name} — ${formatDuration(s.minutes)}`}
                style={{ width: `${(s.minutes / workedMin) * 100}%`, backgroundColor: s.color }}
              />
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
            {todaySlices.map((s) => (
              <span key={s.name} className="flex items-center gap-1.5 text-[12px] text-muted">
                <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}
                <span className="tabular-nums">{formatDuration(s.minutes)}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-3 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
          Timeline
        </h2>

        <QuickLog onLogged={load} />

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
          {logs.length === 0 ? (
            <EmptyState interval={interval} paused={settings?.paused ?? false} />
          ) : (
            <ul className="divide-y divide-border">
              {logs.map((log) => (
                <LogRow key={log.id} log={log} categories={categories} onChanged={load} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

/** Log between prompts (FR-10): one line + Enter, same rules as the prompt.
 *  Categories come back on their own — Hima remembers the last one you gave
 *  the same words (FR-11) — and recent entries ghost-complete (FR-21). */
function QuickLog({ onLogged }: { onLogged: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    api.recent(24).then(setRecent).catch(() => {});
  }, []);

  const submit = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await api.log(value);
      setText("");
      onLogged();
      api.recent(24).then(setRecent).catch(() => {});
    } catch (e) {
      console.error("quick log failed", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mb-3 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-1 shadow-soft transition-colors focus-within:border-accent/50"
    >
      <Plus className="size-4 shrink-0 text-muted" />
      <GhostInput
        value={text}
        onChange={setText}
        recent={recent}
        placeholder="Just did something? Log it now…"
        className="h-11 w-full text-[15px] placeholder:text-muted/50 focus:outline-none"
      />
      {text.trim() && (
        <kbd className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-2 text-muted">
          <CornerDownLeft className="size-3" />
        </kbd>
      )}
    </form>
  );
}

function EmptyState({ interval, paused }: { interval: number; paused: boolean }) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted">
        <span className="size-3 rounded-full bg-accent" />
      </div>
      <p className="text-[15px] font-medium">No check-ins yet today</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
        {paused
          ? "The timer is paused. Resume it whenever you're ready to start tracking."
          : `The ${interval}-minute timer is running. I'll quietly ask what you're working on at the next mark.`}
      </p>
    </div>
  );
}

/** Eased count-up from the previous value to the new target. A timeout
 *  guarantees the final value even if rAF is throttled (e.g. window hidden). */
function useCountUp(target: number, ms = 600): number {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    let fallback = 0;
    const finish = () => {
      window.clearTimeout(fallback);
      fromRef.current = target;
      setVal(target);
    };
    fallback = window.setTimeout(finish, ms + 80);
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setVal(from + (target - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else finish();
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fallback);
    };
  }, [target, ms]);
  return val;
}
