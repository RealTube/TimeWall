import type { RefObject } from "react";
import { completionFor, ghostTail } from "../../lib/completion";
import { cn } from "../../lib/utils";

/** A text input with inline ghost completion from the user's own recent
 *  entries (FR-21). Tab — or → with the caret at the end — accepts the
 *  suggestion; every other key behaves like a plain input. The overlay
 *  re-renders the typed text invisibly so the ghost tail starts exactly at
 *  the caret, in the same metrics the input uses. */
export function GhostInput({
  value,
  onChange,
  recent,
  inputRef,
  className,
  placeholder,
  maxLength = 200,
}: {
  value: string;
  onChange: (v: string) => void;
  recent: string[];
  inputRef?: RefObject<HTMLInputElement | null>;
  className?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  const suggestion = completionFor(recent, value);
  const ghost = suggestion ? ghostTail(suggestion, value) : "";

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestion || !ghost) return;
    const el = e.currentTarget;
    const caretAtEnd =
      el.selectionStart === value.length && el.selectionEnd === value.length;
    if ((e.key === "Tab" && !e.shiftKey) || (e.key === "ArrowRight" && caretAtEnd)) {
      e.preventDefault();
      onChange(suggestion);
    }
  };

  return (
    <div className="relative w-full min-w-0">
      {ghost && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre",
            className,
          )}
        >
          <span className="invisible">{value}</span>
          <span className="text-muted/40">{ghost}</span>
        </div>
      )}
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        maxLength={maxLength}
        className={cn("relative w-full bg-transparent", className)}
      />
    </div>
  );
}
