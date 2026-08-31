import { useState } from 'react';

export const intOrNull = (v: string): number | null => {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

/**
 * A number input that can actually be emptied.
 *
 * Every field on this page shows a figure the app supplies until the player
 * replaces it — an assumed turnout, a goal derived from last season's cutoff.
 * Storing "cleared" as null makes that impossible, because null is also how
 * "nothing entered, use the default" is stored: blank the field and the default
 * reappears on the very next render, so the last character cannot be deleted.
 * A field that fights the backspace key is not a field.
 *
 * The draft is the one state storage cannot express. It holds whatever the
 * player is currently typing, including nothing at all.
 *
 * `resetWhenBlank` says what an empty field means once focus leaves it:
 *
 *   - false — it stays empty, because empty is a real state the row will report.
 *     A played event with no turnout is missing something and says so.
 *   - true  — the supplied figure comes back, because empty is not a state worth
 *     keeping. Clearing an override means "no override", and showing the derived
 *     value again is what no override looks like.
 */
export function useNumberField({
  stored, fallback, commit, resetWhenBlank = false,
}: {
  /** What the player has entered, or null if they have not. */
  stored: number | null;
  /** What to show in its place. Null means show nothing. */
  fallback: number | null;
  commit: (value: number | null) => void;
  resetWhenBlank?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? String(stored ?? fallback ?? '');

  return {
    value,
    /** Empty right now, whether or not that has been committed. */
    blank: value === '',
    /** Showing the app's figure rather than one the player chose. */
    isFallback: draft == null && stored == null,
    inputProps: {
      value,
      onChange: (e: { target: { value: string } }) => {
        setDraft(e.target.value);
        commit(intOrNull(e.target.value));
      },
      onBlur: () => { if (draft === '' ? resetWhenBlank : true) setDraft(null); },
    },
  };
}
