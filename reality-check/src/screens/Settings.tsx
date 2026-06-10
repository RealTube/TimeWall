import { useEffect, useState } from "react";
import { Lock, Minus, Monitor, Moon, Plus, Sun, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAppStore } from "../lib/store";
import type { AppSettings, Category, ThemePreference } from "../lib/types";
import { cn } from "../lib/utils";

const PALETTE = [
  "#5B8DEF", "#A78BFA", "#34D399", "#FBBF24",
  "#38BDF8", "#F87171", "#F472B6", "#9CA3AF",
];

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
        </div>
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
          "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200",
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
      .updateCategory(merged.id, merged.name, merged.color, merged.is_productive)
      .then(onChanged)
      .catch(() => {});
  };

  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface-2/60">
      <span className="size-3 rounded-full" style={{ backgroundColor: category.color }} />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== category.name && commit({ name })}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="flex-1 bg-transparent text-[15px] focus:outline-none"
      />
      <button
        onClick={() => commit({ is_productive: !category.is_productive })}
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
