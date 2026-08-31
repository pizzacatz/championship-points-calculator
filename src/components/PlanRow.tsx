import { useRef, useState } from 'react';
import { useNumberField } from '../useNumberField';
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

/**
 * Play! Pokémon event history — where a player looks up how big an event was.
 *
 * It is behind a Pokémon Trainer Club sign-in, so a logged-out player lands on a
 * login page rather than their results. That is deliberate and was confirmed: it
 * is the player's own official record, which is the point. Do not swap it for a
 * public listing like rk9 or Limitless on the assumption the redirect is a bug.
 */
const STATS_HISTORY =
  'https://op-legacy.pokemon.com/us/pokemon-trainer-club/play-pokemon-stats/history/';

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

  const place = useNumberField({
    stored: e.placement, fallback: null,
    commit: (v) => onChange({ placement: v }),
  });
  // An empty turnout stays empty: a played row genuinely needs one and says so.
  const players = useNumberField({
    stored: entered, fallback: defaultAttendance,
    commit: (v) => onChange({ attendance: v }),
  });
  /**
   * A Global or Grand Challenge does not ask for a field size. Nobody publishes
   * one, so it is scored against a flat season-wide assumption instead of
   * something the player could be expected to know, and the input is never
   * rendered. The row must not then complain that it is empty.
   */
  const showsTurnout = defaultAttendance != null && rule.scale !== 'online';
  const blank = showsTurnout && players.blank;

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
          onFocus={() => setEditing(true)} onBlur={() => setEditing(false)}>
          <span className="field">
            <label htmlFor={`pl-${e.id}`}>Placement</label>
            <input id={`pl-${e.id}`} type="number" min={1} step={1} inputMode="numeric" maxLength={4}
              {...place.inputProps} />
          </span>
          {/* Shown on every row that has a field size, played or not. It is a
              planning input as much as a scoring one: what the ladder can ask of
              an event depends on how many people turn up to it, so a Regional the
              player knows will be bigger than the season-wide assumption has to
              be sayable before the event rather than only after it.

              A Global or Grand Challenge has no field size to enter. The box is
              still laid out there, just made invisible, so the Placement box sits
              in the same place on every row. */}
          <span className={`field${showsTurnout ? '' : ' field-hidden'}`}
            aria-hidden={showsTurnout ? undefined : true}>
            <label htmlFor={`at-${e.id}`}>Players</label>
            <input id={`at-${e.id}`} type="number" min={1} step={1} inputMode="numeric" maxLength={5}
              className={players.isFallback ? 'assumed' : ''}
              title={entered == null
                ? `Assumed turnout. Change it if ${title} was a different size.`
                : 'Turnout you entered.'}
              disabled={!showsTurnout} tabIndex={showsTurnout ? undefined : -1}
              {...players.inputProps}
              value={showsTurnout ? players.value : ''} />
          </span>
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

      {/* A signpost rather than a lookup: it says where the number lives, not
          what it is. See STATS_HISTORY for why the destination needs a sign-in. */}
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
