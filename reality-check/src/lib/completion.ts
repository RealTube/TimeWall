// Ghost autocomplete for the prompt and quick log (FR-21). Prefix-only and
// most-recent-first by design: a fuzzy ghost that guesses wrong costs trust
// (§2.2); an exact prefix match cannot.

/** The most recent entry that starts with what the user typed (case- and
 *  leading-whitespace-insensitive), or `null` when there is nothing to offer.
 *  Needs ≥ 2 typed characters, and never "completes" to the identical text. */
export function completionFor(recent: string[], text: string): string | null {
  const typed = text.trimStart();
  if (typed.length < 2) return null;
  const needle = typed.toLowerCase();
  for (const candidate of recent) {
    const c = candidate.toLowerCase();
    if (c.startsWith(needle) && c !== needle) return candidate;
  }
  return null;
}

/** The not-yet-typed tail of `suggestion`, rendered as ghost text. */
export function ghostTail(suggestion: string, text: string): string {
  return suggestion.slice(text.trimStart().length);
}
