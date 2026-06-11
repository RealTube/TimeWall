import { useEffect, useRef, useState } from "react";
import { FileDown, Lock, Minus, Monitor, Moon, Plus, Sun, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAppStore } from "../lib/store";
import type { AppSettings, Category, ThemePreference } from "../lib/types";
import {
  cn,
  endOfMonthISO,
  minutesToTimeLabel,
  shiftISO,
  startOfMonthISO,
  startOfWeekISO,
  todayISO,
} from "../lib/utils";

const PALETTE = [
  "#5B8DEF", "#A78BFA", "#34D399", "#FBBF24",
  "#38BDF8", "#F87171", "#F472B6", "#9CA3AF",
];

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"]; // ISO Mon=1 … Sun=7

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [autostart, setAutostart] = useState(false);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const loadCategories = () => api.categories().then(setCategories).catch(() => {});

  useEffect(() => {
    api.settings().then(setSettings).catch(() => {});
    api.getAutostart().then(setAutostart).catch(() => {});
    loadCategories();
  }, []);

  const patch = (p: Partial<AppSettings>) =>
    setSettings((s) => (s ? { ...s, ...p } : s));

  if (!settings) {
    return <div className="px-10 py-12 text-muted">Loading…</div>;
  }

  const setInterval = (minutes: number) => {
    const v = Math.max(1, Math.min(240, minutes));
    patch({ interval_minutes: v });
    api.setInterval(v).catch(() => {});
  };

  const setIdle = (minutes: number) => {
    const v = Math.max(1, Math.min(120, minutes));
    patch({ idle_threshold_min: v });
    api.updateSetting("idle_threshold_min", String(v)).catch(() => {});
  };

  const toggleAlign = (on: boolean) => {
    patch({ align_to_clock: on });
    api.updateSetting("align_to_clock", on ? "1" : "0").catch(() => {});
  };

  const togglePause = (on: boolean) => {
    patch({ paused: on });
    api.setPause(on).catch(() => {});
  };

  const toggleAutostart = (on: boolean) => {
    setAutostart(on);
    api.setAutostart(on).catch(() => setAutostart(!on));
  };

  const toggleSchedule = (on: boolean) => {
    patch({ schedule_enabled: on });
    api.updateSetting("schedule_enabled", on ? "1" : "0").catch(() => {});
  };

  const setScheduleTime = (key: "schedule_start_min" | "schedule_end_min", v: number) => {
    patch({ [key]: v } as Partial<AppSettings>);
    api.updateSetting(key, String(v)).catch(() => {});
  };

  const toggleDay = (day: number) => {
    const days = new Set(
      settings.schedule_days.split(",").map((d) => Number(d.trim())).filter(Boolean),
    );
    if (days.has(day)) {
      if (days.size === 1) return; // at least one working day
      days.delete(day);
    } else {
      days.add(day);
    }
    const csv = [...days].sort((a, b) => a - b).join(",");
    patch({ schedule_days: csv });
    api.updateSetting("schedule_days", csv).catch(() => {});
  };

  return (
    <div className="mx-auto max-w-2xl px-10 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>

      <Section title="Timer">
        <Row label="Check-in interval" hint="How often Hima asks what you're doing.">
          <Stepper value={settings.interval_minutes} unit="min" onChange={setInterval} />
        </Row>
        <Row label="Align to the clock" hint="Fire on the quarter hour (:00, :15, :30, :45).">
          <Toggle checked={settings.align_to_clock} onChange={toggleAlign} />
        </Row>
        <Row label="Away after" hint="Idle this long and the interval is marked away, not work.">
          <Stepper value={settings.idle_threshold_min} unit="min" onChange={setIdle} />
        </Row>
        <Row label="Pause tracking" hint="Stop the prompts without quitting Hima.">
          <Toggle checked={settings.paused} onChange={togglePause} />
        </Row>
      </Section>

      <Section title="Schedule">
        <Row
          label="Only during work hours"
          hint="Outside the schedule Hima stays silent and records nothing."
        >
          <Toggle checked={settings.schedule_enabled} onChange={toggleSchedule} />
        </Row>
        {settings.schedule_enabled && (
          <>
            <Row label="Days">
              <div className="flex gap-1.5">
                {DAY_LABELS.map((label, i) => {
                  const day = i + 1;
                  const active = settings.schedule_days
                    .split(",")
                    .map((d) => Number(d.trim()))
                    .includes(day);
                  return (
                    <button
                      key={day}
                      onClick={() => toggleDay(day)}
                      aria-pressed={active}
                      className={cn(
                        "grid size-8 place-items-center rounded-full text-[12px] font-semibold transition-colors",
                        active
                          ? "bg-accent text-accent-fg"
                          : "bg-surface-2 text-muted hover:text-fg",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </Row>
            <Row label="Hours">
              <div className="flex items-center gap-2">
                <TimeSelect
                  value={settings.schedule_start_min}
                  onChange={(v) => setScheduleTime("schedule_start_min", v)}
                />
                <span className="text-[13px] text-muted">to</span>
                <TimeSelect
                  value={settings.schedule_end_min}
                  onChange={(v) => setScheduleTime("schedule_end_min", v)}
                />
              </div>
            </Row>
          </>
        )}
      </Section>

      <Section title="Appearance">
        <Row label="Theme">
          <Segmented<ThemePreference>
            value={theme}
            onChange={setTheme}
            options={[
              { value: "light", label: "Light", icon: Sun },
              { value: "dark", label: "Dark", icon: Moon },
              { value: "system", label: "Auto", icon: Monitor },
            ]}
          />
        </Row>
      </Section>

      <Section title="Startup">
        <Row label="Launch at login" hint="Hima lives in the menu bar / tray and tracks all day.">
          <Toggle checked={autostart} onChange={toggleAutostart} />
        </Row>
      </Section>

      <Section title="Categories">
        <div className="flex flex-col gap-1.5">
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} onChanged={loadCategories} />
          ))}
          <AddCategory onAdded={loadCategories} />
          <p className="px-3 pb-1 pt-1.5 text-[12px] text-muted">
            The hours stepper sets an optional weekly target — shown as a quiet
            tick in Insights, never an alert. Categories you pick are remembered
            per activity, so repeats categorize themselves.
          </p>
        </div>
      </Section>

      <Section title="Data">
        <ExportRow />
        <EraseRow />
      </Section>

      <div className="mt-10 flex items-start gap-2.5 rounded-xl bg-surface-2/60 px-4 py-3 text-[13px] text-muted">
        <Lock className="mt-0.5 size-4 shrink-0" />
        <p>
          Everything stays on this device, encrypted at rest. No account, no network,
          no analytics — Hima only ever stores the words you type.
        </p>
      </div>
    </div>
  );
}

// --- Layout primitives -----------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="mb-3 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted">
        {title}
      </h2>
      <div className="rounded-2xl border border-border bg-surface p-2 shadow-soft">
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-xl px-3 py-2.5">
      <div>
        <div className="text-[15px] font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-[13px] text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-10 rounded-full transition-colors duration-200",
        checked ? "bg-accent" : "bg-border",
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function Stepper({
  value,
  unit,
  onChange,
}: {
  value: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-surface-2 p-1">
      <StepBtn onClick={() => onChange(value - 1)}>
        <Minus className="size-4" />
      </StepBtn>
      <span className="w-16 text-center text-[15px] font-medium tabular-nums">
        {value} {unit}
      </span>
      <StepBtn onClick={() => onChange(value + 1)}>
        <Plus className="size-4" />
      </StepBtn>
    </div>
  );
}

function StepBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-fg"
      {...props}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon: React.ComponentType<{ className?: string }> }[];
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
      {options.map((o) => {
        const Icon = o.icon;
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
              active ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
            )}
          >
            <Icon className="size-4" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// --- Schedule --------------------------------------------------------------

/** Half-hour time picker (00:00 – 23:30) rendered as a native select for full
 *  keyboard/screen-reader support, styled to match the control family. */
function TimeSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const options = Array.from({ length: 48 }, (_, i) => i * 30);
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-9 cursor-pointer rounded-xl bg-surface-2 px-3 text-[14px] font-medium tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/40"
    >
      {options.map((m) => (
        <option key={m} value={m}>
          {minutesToTimeLabel(m)}
        </option>
      ))}
    </select>
  );
}

// --- Data ownership ----------------------------------------------------------

function ExportRow() {
  const [busy, setBusy] = useState(false);
  const [savedTo, setSavedTo] = useState<string | null>(null);

  const run = async (start: string, end: string) => {
    if (busy) return;
    setBusy(true);
    setSavedTo(null);
    try {
      const path = await api.exportCsv(start, end);
      if (path) setSavedTo(path);
    } catch (e) {
      console.error("export failed", e);
    } finally {
      setBusy(false);
    }
  };

  const today = todayISO();
  const ranges: { label: string; start: string; end: string }[] = [
    { label: "This week", start: startOfWeekISO(today), end: shiftISO(startOfWeekISO(today), 6) },
    { label: "This month", start: startOfMonthISO(today), end: endOfMonthISO(today) },
    { label: "All time", start: "2000-01-01", end: "2999-12-31" },
  ];

  return (
    <div className="rounded-xl px-3 py-2.5">
      <div className="flex items-center justify-between gap-6">
        <div>
          <div className="text-[15px] font-medium">Export to CSV</div>
          <div className="mt-0.5 text-[13px] text-muted">
            Your audit, back in spreadsheet form — opens in Excel, Numbers, or Sheets.
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {ranges.map((r) => (
            <button
              key={r.label}
              disabled={busy}
              onClick={() => run(r.start, r.end)}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-[13px] font-medium text-fg transition-colors hover:bg-border/60 disabled:opacity-50"
            >
              <FileDown className="size-3.5" />
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {savedTo && (
        <p className="mt-2 truncate text-[12px] text-productive" title={savedTo}>
          Saved to {savedTo}
        </p>
      )}
    </div>
  );
}

/** Destructive action with an inline two-step confirm (no modal to mis-click). */
function EraseRow() {
  const [armed, setArmed] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const disarm = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(disarm.current), []);

  const click = async () => {
    if (!armed) {
      setArmed(true);
      setDone(null);
      disarm.current = window.setTimeout(() => setArmed(false), 4000);
      return;
    }
    window.clearTimeout(disarm.current);
    setArmed(false);
    try {
      setDone(await api.eraseAllEntries());
    } catch (e) {
      console.error("erase failed", e);
    }
  };

  return (
    <div className="flex items-center justify-between gap-6 rounded-xl px-3 py-2.5">
      <div>
        <div className="text-[15px] font-medium">Erase all entries</div>
        <div className="mt-0.5 text-[13px] text-muted">
          {done !== null
            ? `Deleted ${done} entr${done === 1 ? "y" : "ies"}.`
            : "Permanently deletes every check-in. Categories and settings stay."}
        </div>
      </div>
      <button
        onClick={click}
        className={cn(
          "h-9 shrink-0 rounded-xl px-3 text-[13px] font-medium transition-colors",
          armed
            ? "bg-red-500 text-white"
            : "bg-surface-2 text-red-500 hover:bg-red-500/10",
        )}
      >
        {armed ? "Click again to confirm" : "Erase…"}
      </button>
    </div>
  );
}

// --- Categories ------------------------------------------------------------

function CategoryRow({
  category,
  onChanged,
}: {
  category: Category;
  onChanged: () => void;
}) {
  const [name, setName] = useState(category.name);

  const commit = (next: Partial<Category>) => {
    const merged = { ...category, ...next, name: (next.name ?? name).trim() || category.name };
    api
      .updateCategory(
        merged.id,
        merged.name,
        merged.color,
        merged.is_productive,
        merged.weekly_target_min,
      )
      .then(onChanged)
      .catch(() => {});
  };

  const stepTarget = (dir: -1 | 1) => {
    const next = Math.max(0, Math.min(6000, category.weekly_target_min + dir * 60));
    if (next !== category.weekly_target_min) commit({ weekly_target_min: next });
  };

  return (
    <div className="group flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface-2/60">
      <span className="size-3 rounded-full" style={{ backgroundColor: category.color }} />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== category.name && commit({ name })}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="flex-1 bg-transparent text-[15px] focus:outline-none"
      />
      <div
        className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5"
        title="Weekly target — a quiet lens in Insights, never an alarm"
      >
        <button
          onClick={() => stepTarget(-1)}
          aria-label={`Lower ${category.name} weekly target`}
          className="grid size-6 place-items-center rounded-md text-muted transition-colors hover:bg-surface hover:text-fg"
        >
          <Minus className="size-3" />
        </button>
        <span className="w-9 text-center text-[12px] font-medium tabular-nums text-muted">
          {category.weekly_target_min > 0 ? `${category.weekly_target_min / 60}h` : "Off"}
        </span>
        <button
          onClick={() => stepTarget(1)}
          aria-label={`Raise ${category.name} weekly target`}
          className="grid size-6 place-items-center rounded-md text-muted transition-colors hover:bg-surface hover:text-fg"
        >
          <Plus className="size-3" />
        </button>
      </div>
      <button
        onClick={() => commit({ is_productive: !category.is_productive })}
        title="Counts toward your productive % in Insights — click to flip"
        className={cn(
          "rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
          category.is_productive
            ? "bg-productive/15 text-productive"
            : "bg-busywork/15 text-busywork",
        )}
      >
        {category.is_productive ? "Productive" : "Busywork"}
      </button>
      <button
        onClick={() => api.deleteCategory(category.id).then(onChanged).catch(() => {})}
        className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-red-500"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function AddCategory({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);

  const add = () => {
    const value = name.trim();
    if (!value) return;
    api
      .addCategory(value, color, true)
      .then(() => {
        setName("");
        setColor(PALETTE[0]);
        onAdded();
      })
      .catch(() => {});
  };

  return (
    <div className="mt-1 flex items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2">
      <div className="flex gap-1">
        {PALETTE.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={cn(
              "size-4 rounded-full transition-transform",
              color === c ? "scale-110 ring-2 ring-offset-2 ring-offset-surface" : "opacity-70",
            )}
            style={{ backgroundColor: c, ...(color === c ? { ["--tw-ring-color" as string]: c } : {}) }}
          />
        ))}
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="Add a category…"
        className="flex-1 bg-transparent text-[15px] placeholder:text-muted/60 focus:outline-none"
      />
      <button
        onClick={add}
        disabled={!name.trim()}
        className="grid size-8 place-items-center rounded-lg bg-accent text-accent-fg transition-opacity hover:brightness-110 disabled:opacity-30"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
