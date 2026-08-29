import { useRef, useState } from 'react';
import type { EvaluatedResult, EventTypeRule, PlannedEvent } from '../domain/types';

/**
 * Only what the row cannot otherwise say.
 *
 * "Excluded by BFL" is dropped because the row already carries `BFL –/4`, in the
 * same vocabulary as every other row's `BFL 2/4`. "Needs the CP" is gone with CP
 * entry itself: a placement is scored against a turnout the row shows and the
 * player can correct, so there is nothing left for the app to be unsure about.
 */
const BADGE: Partial<Record<EvaluatedResult['reason'], { text: string; cls: string }>> = {
  'invalid': { text: 'Check this', cls: 'danger' },
};

/** Play! Pokémon event history. Behind a Trainer Club sign-in. */
const STATS_HISTORY =
  'https://op-legacy.pokemon.com/us/pokemon-trainer-club/play-pokemon-stats/history/';

const intOrNull = (v: string): number | null => {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

/**
 * Dates read as ISO throughout — one format, one width, ten characters — because
 * a column of "Sep 18" and "June 5" cannot be made to line up. Events published
 * by month only carry their own form, `2026-09-00`, which is the same width.
 */
const dateLabel = (e: { date: string | null; displayDate?: string }) =>
  e.displayDate ?? e.date ?? null;

export function PlanRow({
  result, rule, bfl, overdue, needsDate, defaultAttendance, entered, onChange, onRemove,
}: {
  result: EvaluatedResult;
  rule: EventTypeRule;
  /**
   * Turnout the row scores against until the player overrides it — the scraped
   * roster count for a major, the assumed field for a Cup or Challenge. Shown in
   * the Players field so the assumption is never invisible. Null for online
   * events, which have no field size and hide the input entirely.
   */
  defaultAttendance: number | null;
  /** The turnout the player typed, if any. Null means the default is in force. */
  entered: number | null;
  /** Position in its Best Finish Limit bucket, once the result is real. */
  bfl: { slot: number | null; limit: number | null } | null;
  /** Past its date with nothing entered — it cannot be played any more. */
  overdue: boolean;
  /** A manually added local, which carries no date of its own. */
  needsDate: boolean;
  onChange: (patch: Partial<PlannedEvent>) => void;
  onRemove: () => void;
}) {
  const e = result.event;
  const dateInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);

  /**
   * What the turnout field is showing, when that differs from what is stored.
   *
   * Null means "show the stored value, or the default if there is none". A
   * string means the player is holding something the store cannot represent —
   * in practice the empty string, because clearing the field stores null, and
   * null is also how "use the default" is stored. Without this the last digit
   * could not be deleted: the field refilled itself with the default the instant
   * it went empty.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(entered ?? defaultAttendance ?? '');
  /**
   * A Global or Grand Challenge has no field size to ask for: Pokémon Champions
   * has 10M+ downloads and the GO Battle League is ranked globally, so every
   * kicker is taken as met and the input is never rendered. The row must not
   * then complain that it is empty — there is nothing there to fill in.
   */
  const showsTurnout = e.placement != null && defaultAttendance != null;
  const blank = showsTurnout && shown === '';

  // Half-typed numbers are not mistakes, so the row holds its verdict until the
  // player has stopped editing it.
  const asking = !editing && blank;
  const held = editing || blank ? null : result.error;
  const badge = editing || blank ? undefined : BADGE[result.reason];

  // showPicker is the supported way to open the native calendar on demand;
  // where it is missing, focusing the input is the next best thing.
  const openPicker = () => {
    const el = dateInput.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); return; } catch { /* not allowed here; fall through */ }
    }
    el.focus();
  };
  const title = e.name?.trim() || rule.label;
  const date = dateLabel(e);
  // On a narrow screen a long event name has to break somewhere, and the natural
  // seam is before "Championships". Binding the earlier spaces leaves that as the
  // only break opportunity, which CSS alone cannot express.
  const wrapTitle = (t: string) => {
    const at = t.lastIndexOf(' Championship');
    return at < 0 ? t : t.slice(0, at).replace(/ /g, '\u00a0') + t.slice(at);
  };

  return (
    <li className={`plan-row ${held || asking ? 'invalid' : ''} ${overdue ? 'overdue' : ''}`}>
      <div className="plan-main">
        <span className="plan-title">
          {wrapTitle(title)}
          {/* A local's date lives on its calendar button, which is both the value
              and the control. Printing it here as well showed it twice. */}
          {date && !needsDate && <span className="plan-date">{date}</span>}

          {/* A Cup or Challenge carries no date of its own, and a full date input
              is a wide control showing mm/dd/yyyy before anything is entered. A
              calendar button opens the native picker instead, and once a date is
              set it shows the date — tapping it again reopens the picker. The
              input stays in the DOM, and labelled, so the picker has something to
              open and assistive technology has something to read.

              It sits inside the title, immediately after the name, because that
              is where the date belongs on every other row: a catalog event prints
              its date there too, and having one kind of row carry its date beside
              the name and another carry it out by the inputs made two layouts of
              what is one thing. Inline, so it wraps with the name rather than
              taking a column of its own. */}
          {needsDate && (
            <span className="field-date">
              <input ref={dateInput} id={`d-${e.id}`} type="date" value={e.date ?? ''}
                aria-label={`Date for ${title}`}
                onChange={(ev) => onChange({ date: ev.target.value || null })} />
              <button type="button" className="date-btn" onClick={openPicker}
                aria-label={e.date ? `Change the date for ${title}` : `Set a date for ${title}`}>
                {e.date ?? (
                  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
                    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none"
                      stroke="currentColor" strokeWidth="1.8" />
                    <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" stroke="currentColor" strokeWidth="1.8" />
                    <line x1="8" y1="2.8" x2="8" y2="6" stroke="currentColor" strokeWidth="1.8"
                      strokeLinecap="round" />
                    <line x1="16" y1="2.8" x2="16" y2="6" stroke="currentColor" strokeWidth="1.8"
                      strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </span>
          )}
        </span>

        <span className="plan-inputs"
          onFocus={() => setEditing(true)}
          onBlur={() => { setEditing(false); if (draft !== '') setDraft(null); }}>
          <span className="field">
            <label htmlFor={`pl-${e.id}`}>Placement</label>
            <input id={`pl-${e.id}`} type="number" min={1} step={1} inputMode="numeric" maxLength={4}
              value={e.placement ?? ''}
              onChange={(ev) => onChange({ placement: intOrNull(ev.target.value) })} />
          </span>
          {/* Turnout only matters once there is a finish to price, and only where
              a field size exists at all — an online event has none. Blanking it
              falls back to the default rather than leaving the row unscoreable. */}
          {showsTurnout && (
            <span className="field">
              <label htmlFor={`at-${e.id}`}>Players</label>
              <input id={`at-${e.id}`} type="number" min={1} step={1} inputMode="numeric" maxLength={5}
                className={draft == null && entered == null ? 'assumed' : ''}
                title={entered == null
                  ? `Assumed turnout. Change it if ${title} was a different size.`
                  : 'Turnout you entered.'}
                value={shown}
                onChange={(ev) => {
                  setDraft(ev.target.value);
                  onChange({ attendance: intOrNull(ev.target.value) });
                }} />
            </span>
          )}
        </span>

        <span className="plan-result">
          <strong className={result.rawPoints > 0 ? '' : 'zero'}>{result.rawPoints} CP</strong>
          {bfl?.slot != null && (
            <span className="bfl" title="Position in its Best Finish Limit">
              BFL {bfl.slot}/{bfl.limit}
            </span>
          )}
          {bfl && bfl.slot == null && bfl.limit != null && (
            <span className="bfl out" title="Outside its Best Finish Limit">BFL –/{bfl.limit}</span>
          )}
          {badge && <span className={`badge ${badge.cls}`}>{badge.text}</span>}
          {result.directInvite && <span className="badge ok">Direct invite</span>}
        </span>

        <button type="button" className="icon" onClick={onRemove} aria-label={`Remove ${title}`}>×</button>
      </div>

      {overdue && (
        <p className="plan-explain overdue-note">
          This event has passed. Enter your result, or remove it. It is not counted.
        </p>
      )}

      {/* The player's own event history is behind a Pokémon Trainer Club sign-in,
          so this is a signpost rather than a lookup: it says where the number
          lives, not what it is. */}
      {asking && (
        <p className="callout danger row-error" role="alert">
          What was the total number of competitors at this tournament?{' '}
          <a href={STATS_HISTORY} target="_blank" rel="noopener noreferrer"
            aria-label="Find your event history on the Play! Pokémon stats site, which opens in a new tab">
            Click here to find out.
          </a>
        </p>
      )}

      {held && <p className="callout danger row-error" role="alert">{held}</p>}
    </li>
  );
}
