import { useEffect, useRef, useState } from "react";
import { usePause } from "../../hooks/usePause";
import { formatPauseCountdown } from "../../lib/format";
import type { PausePayload } from "../../types";

type Option = { label: string; payload: PausePayload };

const OPTIONS: Option[] = [
  { label: "Pause 1 hour", payload: { kind: "minutes", value: 60 } },
  { label: "Pause 2 hours", payload: { kind: "minutes", value: 120 } },
  { label: "Pause until tomorrow", payload: { kind: "until_tomorrow" } },
];

export function PauseControl() {
  const { status, pause, resume } = usePause();
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!status.paused) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [status.paused]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const countdown = formatPauseCountdown(status.paused_until);

  if (status.paused) {
    return (
      <div className="rounded-xl p-3 border border-[color:var(--color-warning)]/25 bg-[color:var(--color-warning)]/10">
        <div className="flex items-start gap-3">
          <PauseGlyph className="text-[color:var(--color-warning)] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[color:var(--color-text-primary)]">
              Timer paused
            </div>
            <div
              className="text-xs text-[color:var(--color-text-secondary)] mt-0.5"
              data-tick={tick}
            >
              {countdown ?? "Resuming shortly"}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void resume()}
          className="mt-3 w-full button-ghost rounded-lg py-1.5 text-xs font-medium"
        >
          Resume now
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full button-ghost rounded-xl py-2.5 px-3 text-sm font-medium flex items-center justify-between"
      >
        <span className="flex items-center gap-2.5">
          <PauseGlyph className="text-[color:var(--color-text-secondary)]" />
          Pause timer
        </span>
        <ChevronGlyph className="text-[color:var(--color-text-muted)]" open={open} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 glass-strong rounded-xl overflow-hidden fade-in z-10">
          {OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => {
                setOpen(false);
                void pause(opt.payload);
              }}
              className="w-full text-left px-3.5 py-2.5 text-sm text-[color:var(--color-text-secondary)] hover:bg-white/[0.05] hover:text-[color:var(--color-text-primary)] transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PauseGlyph({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect x="3" y="2.5" width="2.5" height="9" rx="1" fill="currentColor" />
      <rect x="8.5" y="2.5" width="2.5" height="9" rx="1" fill="currentColor" />
    </svg>
  );
}

function ChevronGlyph({
  className,
  open,
}: {
  className?: string;
  open: boolean;
}) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      className={`${className ?? ""} transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path
        d="M2 3.5L5 6.5L8 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
