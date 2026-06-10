import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { motion } from "framer-motion";
import { Check, MoonStar, Pencil, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import type { ActivityLog, AppSettings, Category } from "../lib/types";
import { cn, formatDuration, greeting, hhmm } from "../lib/utils";
import { ProgressRing } from "../components/ui/ProgressRing";

const WORKDAY_MIN = 8 * 60;

export default function Dashboard() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  const load = useCallback(() => {
    api.todaysLogs().then(setLogs).catch(() => {});
    api.settings().then(setSettings).catch(() => {});
    api.categories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const un = listen("refresh-dashboard", load);
    return () => {
      un.then((f) => f());
    };
  }, [load]);

  const catMap = useMemo(() => {
    const m = new Map<number, Category>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const interval = settings?.interval_minutes ?? 15;
  const worked = logs.filter((l) => !l.was_idle);
  const idleCount = logs.length - worked.length;
  const workedMin = worked.length * interval;
  const idleMin = idleCount * interval;
  const ringValue = Math.min(1, workedMin / WORKDAY_MIN);
  const animatedHours = useCountUp(workedMin / 60);

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
            {idleMin > 0 && ` · ${formatDuration(idleMin)} away`}
            {settings?.paused && " · timer paused"}
          </p>
        </div>

        <ProgressRing value={ringValue}>
          <div className="text-2xl font-semibold tabular-nums">
            {Math.round(ringValue * 100)}%
          </div>
          <div className="text-[11px] uppercase tracking-wider text-muted">of 8h</div>
        </ProgressRing>
      </header>

      <section className="mt-10">
        <h2 className="mb-3 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
          Timeline
        </h2>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
          {logs.length === 0 ? (
            <EmptyState interval={interval} paused={settings?.paused ?? false} />
          ) : (
            <ul className="divide-y divide-border">
              {logs.map((log) => (
                <LogRow
                  key={log.id}
                  log={log}
                  category={log.category_id ? catMap.get(log.category_id) : undefined}
                  onChanged={load}
                />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function LogRow({
  log,
  category,
  onChanged,
}: {
  log: ActivityLog;
  category?: Category;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(log.activity);
  const [removing, setRemoving] = useState(false);

  const save = async () => {
    const value = draft.trim();
    if (!value) return;
    try {
      await api.updateActivity(log.id, value, log.category_id);
      setEditing(false);
      onChanged();
    } catch (e) {
      console.error(e);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await api.deleteActivity(log.id);
      onChanged();
    } catch (e) {
      console.error(e);
      setRemoving(false);
    }
  };

  return (
    <motion.li
      layout
      animate={{ opacity: removing ? 0 : 1, height: removing ? 0 : "auto" }}
      className="group flex items-center gap-4 px-5 py-3.5"
    >
      <span className="w-12 shrink-0 font-mono text-[13px] tabular-nums text-muted">
        {hhmm(log.time)}
      </span>

      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: log.was_idle ? "var(--idle)" : category?.color ?? "var(--border)" }}
        title={category?.name}
      />

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setDraft(log.activity);
              setEditing(false);
            }
          }}
          className="flex-1 rounded-md bg-surface-2 px-2 py-1 text-[15px] focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      ) : (
        <span
          className={cn(
            "flex-1 truncate text-[15px]",
            log.was_idle && "text-muted",
          )}
        >
          {log.activity}
          {log.was_idle && (
            <MoonStar className="ml-2 inline size-3.5 -translate-y-px text-idle" />
          )}
        </span>
      )}

      {category && !editing && (
        <span className="hidden shrink-0 text-[12px] text-muted sm:block">{category.name}</span>
      )}

      {!log.was_idle && (
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {editing ? (
            <>
              <IconBtn onClick={save} title="Save">
                <Check className="size-4" />
              </IconBtn>
              <IconBtn
                onClick={() => {
                  setDraft(log.activity);
                  setEditing(false);
                }}
                title="Cancel"
              >
                <X className="size-4" />
              </IconBtn>
            </>
          ) : (
            <>
              <IconBtn onClick={() => setEditing(true)} title="Edit">
                <Pencil className="size-4" />
              </IconBtn>
              <IconBtn onClick={remove} title="Delete" danger>
                <Trash2 className="size-4" />
              </IconBtn>
            </>
          )}
        </div>
      )}
    </motion.li>
  );
}

function IconBtn({
  children,
  danger,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      className={cn(
        "grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2",
        danger ? "hover:text-red-500" : "hover:text-fg",
      )}
      {...props}
    >
      {children}
    </button>
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
