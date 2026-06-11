import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CornerDownLeft, Search } from "lucide-react";
import { api } from "../lib/api";
import { useAppStore } from "../lib/store";
import type { Category, SearchHit } from "../lib/types";
import { cn, hhmm, shiftISO, todayISO } from "../lib/utils";

export const isMac =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

/** ⌘/Ctrl-K journal search (FR-15). A glass palette over the whole journal:
 *  type to filter, arrows to move, Enter to open that day in Insights. */
export function SearchOverlay() {
  const open = useAppStore((s) => s.searchOpen);
  const setOpen = useAppStore((s) => s.setSearchOpen);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Global shortcut: ⌘/Ctrl-K toggles the palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useAppStore.getState().searchOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setActive(0);
      return;
    }
    api.categories().then(setCategories).catch(() => {});
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Debounced search; short queries clear instead of flooding the journal.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setActive(0);
      return;
    }
    const t = window.setTimeout(() => {
      api
        .search(q, 60)
        .then((r) => {
          setHits(r);
          setActive(0);
        })
        .catch(() => {});
    }, 140);
    return () => window.clearTimeout(t);
  }, [query, open]);

  const catMap = useMemo(() => {
    const m = new Map<number, Category>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  // Hits arrive newest-first; group them by day for scanning.
  const groups = useMemo(() => {
    const out: { date: string; items: { hit: SearchHit; index: number }[] }[] = [];
    hits.forEach((hit, index) => {
      const last = out[out.length - 1];
      if (last && last.date === hit.date) last.items.push({ hit, index });
      else out.push({ date: hit.date, items: [{ hit, index }] });
    });
    return out;
  }, [hits]);

  const jump = (hit: SearchHit) => {
    setOpen(false);
    navigate("/insights", { state: { day: hit.date, ts: Date.now() } });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(hits.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      jump(hits[active]);
    }
  };

  // Keep the active row in view while arrowing through results.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]"
          onMouseDown={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-label="Search your journal"
            className="glass mx-auto mt-[14vh] w-full max-w-xl overflow-hidden rounded-2xl border border-border/70 shadow-float"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-5 py-4">
              <Search className="size-[18px] shrink-0 text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search everything you've logged…"
                autoComplete="off"
                spellCheck={false}
                aria-label="Search your journal"
                className="w-full bg-transparent text-[17px] font-medium text-fg placeholder:text-muted/50 focus:outline-none"
              />
              <kbd className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                esc
              </kbd>
            </div>

            {hits.length > 0 && (
              <>
                <div className="h-px bg-border" />
                <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-2">
                  {groups.map((g) => (
                    <div key={g.date}>
                      <div className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted/80">
                        {friendlyDate(g.date)}
                      </div>
                      {g.items.map(({ hit, index }) => {
                        const cat = hit.category_id ? catMap.get(hit.category_id) : undefined;
                        return (
                          <button
                            key={hit.id}
                            data-index={index}
                            onClick={() => jump(hit)}
                            onMouseMove={() => setActive(index)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left",
                              index === active && "bg-surface-2",
                            )}
                          >
                            <span className="w-11 shrink-0 font-mono text-[12px] tabular-nums text-muted">
                              {hhmm(hit.time)}
                            </span>
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: cat?.color ?? "var(--border)" }}
                            />
                            <span className="min-w-0 flex-1 truncate text-[14px]">
                              <Highlight text={hit.activity} query={query} />
                            </span>
                            {cat && (
                              <span className="shrink-0 text-[12px] text-muted">{cat.name}</span>
                            )}
                            {index === active && (
                              <CornerDownLeft className="size-3.5 shrink-0 text-muted" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </>
            )}

            {query.trim().length >= 2 && hits.length === 0 && (
              <>
                <div className="h-px bg-border" />
                <p className="px-5 py-6 text-center text-sm text-muted">
                  Nothing logged matches “{query.trim()}”.
                </p>
              </>
            )}

            <div className="flex items-center justify-between border-t border-border/60 px-5 py-2.5 text-[11px] text-muted">
              <span>
                {hits.length > 0
                  ? `${hits.length} check-in${hits.length === 1 ? "" : "s"}${hits.length === 60 ? "+" : ""}`
                  : "Your journal, searched on-device"}
              </span>
              <span className="flex items-center gap-3">
                <span>↑↓ move</span>
                <span>↵ open that day</span>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Wrap each case-insensitive match of `query` in a styled <mark>. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  for (;;) {
    const at = lower.indexOf(needle, i);
    if (at === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (at > i) parts.push(text.slice(i, at));
    parts.push(<mark key={at}>{text.slice(at, at + needle.length)}</mark>);
    i = at + needle.length;
  }
  return <>{parts}</>;
}

function friendlyDate(iso: string): string {
  const today = todayISO();
  if (iso === today) return "Today";
  if (iso === shiftISO(today, -1)) return "Yesterday";
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
