import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { ipc } from "../../lib/ipc";

type Status = "idle" | "exporting" | "done" | "error";

export function ExportButton() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const onClick = async () => {
    setStatus("exporting");
    try {
      const defaultName = await ipc.suggestExportFilename();
      const destination = await save({
        defaultPath: defaultName,
        title: "Export Hima log",
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!destination) {
        setStatus("idle");
        return;
      }
      const path = await ipc.exportCsv(destination);
      setStatus("done");
      setMessage(shortenPath(path));
      window.setTimeout(() => {
        setStatus("idle");
        setMessage(null);
      }, 3500);
    } catch (e) {
      setStatus("error");
      setMessage(String(e));
      window.setTimeout(() => {
        setStatus("idle");
        setMessage(null);
      }, 3500);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={status === "exporting"}
        className="w-full button-ghost rounded-xl py-2.5 px-3 text-sm font-medium flex items-center justify-between"
      >
        <span className="flex items-center gap-2.5">
          <DownloadGlyph className="text-[color:var(--color-text-secondary)]" />
          {status === "exporting" ? "Exporting…" : "Export data"}
        </span>
        <span className="text-[10.5px] uppercase tracking-wider text-[color:var(--color-text-muted)]">
          CSV
        </span>
      </button>
      {message && (
        <div
          className={`mt-2 text-xs leading-snug fade-in ${
            status === "error"
              ? "text-[color:var(--color-danger)]"
              : "text-[color:var(--color-text-secondary)]"
          }`}
        >
          {status === "error" ? message : `Saved to ${message}`}
        </div>
      )}
    </div>
  );
}

function shortenPath(p: string): string {
  if (p.length < 40) return p;
  const sep = p.includes("\\") ? "\\" : "/";
  const parts = p.split(sep);
  if (parts.length <= 3) return p;
  return `…${sep}${parts.slice(-2).join(sep)}`;
}

function DownloadGlyph({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M7 2.25V9.25M7 9.25L4 6.5M7 9.25L10 6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.5 10.75V11.5C2.5 11.9142 2.83579 12.25 3.25 12.25H10.75C11.1642 12.25 11.5 11.9142 11.5 11.5V10.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
