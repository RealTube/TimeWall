import { useEffect, useState } from "react";
import { useSettings } from "../../hooks/useSettings";

export function SettingsPanel() {
  const { intervalMinutes, saveInterval, loading } = useSettings();
  const [draft, setDraft] = useState<string>("15");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  useEffect(() => {
    if (!loading) setDraft(String(intervalMinutes));
  }, [intervalMinutes, loading]);

  const onSave = async () => {
    const next = parseInt(draft, 10);
    if (Number.isNaN(next) || next < 1 || next > 240) {
      setState("error");
      window.setTimeout(() => setState("idle"), 1400);
      return;
    }
    try {
      setState("saving");
      await saveInterval(next);
      setState("saved");
      window.setTimeout(() => setState("idle"), 1400);
    } catch {
      setState("error");
      window.setTimeout(() => setState("idle"), 1400);
    }
  };

  return (
    <div>
      <label className="text-[10.5px] font-medium tracking-[0.14em] uppercase text-[color:var(--color-text-muted)] block mb-2">
        Popup Interval (min)
      </label>
      <div className="flex gap-2">
        <input
          type="number"
          min={1}
          max={240}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onSave();
          }}
          className="input-field w-full px-3 py-2 rounded-lg text-sm tabular-nums"
        />
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={state === "saving"}
          className={`px-3.5 py-2 rounded-lg text-sm font-medium min-w-[68px] ${
            state === "saved"
              ? "bg-[color:var(--color-success)]/20 text-[color:var(--color-success)] border border-[color:var(--color-success)]/30"
              : state === "error"
                ? "bg-[color:var(--color-danger)]/20 text-[color:var(--color-danger)] border border-[color:var(--color-danger)]/30"
                : "button-primary"
          } transition-all`}
        >
          {state === "saved"
            ? "Saved"
            : state === "error"
              ? "Error"
              : state === "saving"
                ? "..."
                : "Save"}
        </button>
      </div>
    </div>
  );
}
