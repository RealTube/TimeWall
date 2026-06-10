import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ipc } from "../lib/ipc";
import { useRecentActivities } from "../hooks/useRecentActivities";

type SubmitState = "idle" | "saving" | "error";

const SNOOZE_MINUTES = 5;

export default function Prompt() {
  const [activity, setActivity] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { items: recent } = useRecentActivities(5);

  useEffect(() => {
    inputRef.current?.focus();
    const unlisten = listen("time-to-log", () => {
      setActivity("");
      setState("idle");
      setHint(null);
      inputRef.current?.focus();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const submit = async (value: string) => {
    if (!value.trim() || state === "saving") return;
    try {
      setState("saving");
      await ipc.logActivity(value);
      setActivity("");
      setState("idle");
    } catch (err) {
      console.error(err);
      setState("error");
      window.setTimeout(() => setState("idle"), 1400);
    }
  };

  const snooze = async () => {
    try {
      await ipc.pauseDaemon({ kind: "minutes", value: SNOOZE_MINUTES });
      await getCurrentWindow().hide();
    } catch (e) {
      console.error(e);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setHint(`Snoozed ${SNOOZE_MINUTES} min`);
      void snooze();
      return;
    }
    if (e.altKey || e.metaKey || e.ctrlKey) {
      const idx = parseInt(e.key, 10);
      if (!Number.isNaN(idx) && idx >= 1 && idx <= recent.length) {
        e.preventDefault();
        void submit(recent[idx - 1]);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit(activity);
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center px-4">
      <div className="prompt-shell w-full max-w-xl px-6 py-4 fade-in">
        <div className="flex items-center gap-3">
          <Pulse state={state} />
          <form onSubmit={handleSubmit} className="flex-1">
            <input
              ref={inputRef}
              type="text"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={state === "saving"}
              className="w-full bg-transparent text-[color:var(--color-text-primary)] text-[20px] leading-[1.3] font-medium tracking-tight focus:outline-none placeholder-[color:var(--color-text-muted)]"
              placeholder="What did you just do?"
              autoComplete="off"
              spellCheck={false}
              maxLength={120}
            />
          </form>
          <span className="text-[10.5px] font-medium tracking-[0.14em] uppercase text-[color:var(--color-text-muted)] select-none">
            {state === "error"
              ? "Retry"
              : state === "saving"
                ? "…"
                : hint ?? "Enter"}
          </span>
        </div>

        {recent.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            {recent.map((item, idx) => (
              <button
                key={`${item}-${idx}`}
                type="button"
                onClick={() => void submit(item)}
                className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)] bg-white/[0.025] hover:bg-white/[0.06] border border-[color:var(--color-border-subtle)] hover:border-[color:var(--color-border-strong)] transition-all active:scale-95"
                title={`Press Ctrl/⌘+${idx + 1}`}
              >
                <span className="font-mono text-[10px] text-[color:var(--color-text-muted)] group-hover:text-[color:var(--color-accent)]">
                  {idx + 1}
                </span>
                <span className="truncate max-w-[120px]">{item}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-[10.5px] tracking-wider uppercase text-[color:var(--color-text-muted)] select-none">
          <span>
            <kbd className="font-mono px-1 py-0.5 rounded bg-white/[0.05]">
              ⌘ / Ctrl + 1–{Math.max(1, recent.length)}
            </kbd>
            {"  "}quick pick
          </span>
          <span>
            <kbd className="font-mono px-1 py-0.5 rounded bg-white/[0.05]">
              Esc
            </kbd>
            {"  "}snooze {SNOOZE_MINUTES}m
          </span>
        </div>
      </div>
    </div>
  );
}

function Pulse({ state }: { state: SubmitState }) {
  const color =
    state === "error"
      ? "var(--color-danger)"
      : state === "saving"
        ? "var(--color-warning)"
        : "var(--color-accent)";
  return (
    <span aria-hidden className="relative inline-flex w-2.5 h-2.5 shrink-0">
      <span
        className="absolute inset-0 rounded-full opacity-50 animate-ping"
        style={{ background: color }}
      />
      <span
        className="relative w-2.5 h-2.5 rounded-full"
        style={{
          background: color,
          boxShadow: `0 0 16px ${color}`,
        }}
      />
    </span>
  );
}
