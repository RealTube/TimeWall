import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { listen } from "@tauri-apps/api/event";
import { CornerDownLeft } from "lucide-react";
import { api } from "../lib/api";
import { Chip } from "../components/ui/Chip";
import type { Category } from "../lib/types";

export default function Prompt() {
  const [activity, setActivity] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [shownAt, setShownAt] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const focus = () => requestAnimationFrame(() => inputRef.current?.focus());

  const refreshData = useCallback(() => {
    api.recent(6).then(setRecent).catch(() => {});
    api.categories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("prompt");
    refreshData();
    focus();
    const clockTimer = window.setInterval(() => setClock(new Date()), 20_000);
    const un = listen("time-to-log", () => {
      setActivity("");
      setCategoryId(null);
      setShownAt(Date.now());
      setClock(new Date());
      refreshData();
      focus();
    });
    return () => {
      window.clearInterval(clockTimer);
      un.then((f) => f());
    };
  }, [refreshData]);

  const submit = async (text: string) => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await api.log(value, categoryId);
      setActivity("");
      setCategoryId(null);
    } catch (e) {
      console.error("log failed", e);
    } finally {
      setBusy(false);
    }
  };

  const snooze = () => {
    api.snooze(5).catch((e) => console.error("snooze failed", e));
  };

  const timeLabel = clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const question = clock.getHours() < 5 ? "Still at it?" : "What did you just do?";

  return (
    <div
      className="grid h-screen w-screen place-items-center p-6"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          snooze();
        }
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={shownAt}
          initial={{ opacity: 0, y: 14, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.99 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="glass w-full overflow-hidden rounded-3xl border border-border/70 shadow-float"
        >
          <div className="p-7">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              <span className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-accent" /> Reality check
              </span>
              <span className="tabular-nums">{timeLabel}</span>
            </div>

            <h1 className="mb-4 text-[15px] font-medium text-muted">{question}</h1>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(activity);
              }}
            >
              <input
                ref={inputRef}
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                placeholder="Type 1–2 words…"
                autoComplete="off"
                spellCheck={false}
                maxLength={200}
                className="w-full bg-transparent text-[30px] font-semibold leading-tight tracking-tight text-fg placeholder:text-muted/40 focus:outline-none"
              />
            </form>

            <div className="mt-5 h-px bg-border" />

            {categories.length > 0 && (
              <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-0.5">
                {categories.map((c) => (
                  <Chip
                    key={c.id}
                    dot={c.color}
                    active={categoryId === c.id}
                    className="shrink-0"
                    onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                  >
                    {c.name}
                  </Chip>
                ))}
              </div>
            )}

            {recent.length > 0 && (
              <div className="no-scrollbar mt-3 flex items-center gap-2 overflow-x-auto">
                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted/70">
                  Again
                </span>
                {recent.map((r) => (
                  <Chip key={r} className="shrink-0" onClick={() => submit(r)}>
                    {r}
                  </Chip>
                ))}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between text-[12px] text-muted">
              <span className="flex items-center gap-1.5">
                <kbd className="grid size-5 place-items-center rounded-md bg-surface-2">
                  <CornerDownLeft className="size-3" />
                </kbd>
                Log it
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px]">esc</kbd>
                Snooze 5 min
              </span>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
