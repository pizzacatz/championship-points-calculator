import type { EvaluatedResult, EventTypeRule, PlannedEvent } from '../domain/types';
import { bandLabel } from '../domain/calculate';

/**
 * Only exceptions get a badge. "Counts" was on nearly every row, and a badge that
 * is almost always present carries no information — its absence is the signal.
 */
const BADGE: Partial<Record<EvaluatedResult['reason'], { text: string; cls: string }>> = {
  'excluded-by-bfl': { text: 'Excluded by BFL', cls: 'muted' },
  'below-kicker': { text: 'Below kicker', cls: 'warn' },
  'unverified-attendance': { text: 'Needs the CP', cls: 'warn' },
  'invalid': { text: 'Check this', cls: 'danger' },
};

const intOrNull = (v: string): number | null => {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const shortDate = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export function PlanRow({
  result, rule, bfl, overdue, needsDate, displacement, onChange, onRemove,
}: {
  result: EvaluatedResult;
  rule: EventTypeRule;
  /** Position in its Best Finish Limit bucket, once the result is real. */
  bfl: { slot: number | null; limit: number | null } | null;
  /** Past its date with nothing entered — it cannot be played any more. */
  overdue: boolean;
  /** A manually added local, which carries no date of its own. */
  needsDate: boolean;
  displacement: string | null;
  onChange: (patch: Partial<PlannedEvent>) => void;
  onRemove: () => void;
}) {
  const e = result.event;
  const badge = BADGE[result.reason];
  const title = e.name?.trim() || rule.label;
  const date = e.displayDate ?? shortDate(e.date);

  return (
    <li className={`plan-row ${result.error ? 'invalid' : ''} ${overdue ? 'overdue' : ''}`}>
      <div className="plan-main">
        <span className="plan-title">
          {title}
          {date && <span className="plan-date">{date}</span>}
        </span>

        {needsDate && (
          <span className="field field-date">
            <label htmlFor={`d-${e.id}`}>Date</label>
            <input id={`d-${e.id}`} type="date" value={e.date ?? ''}
              onChange={(ev) => onChange({ date: ev.target.value || null })} />
          </span>
        )}

        <span className="plan-inputs">
          <span className="field">
            <label htmlFor={`cp-${e.id}`}>CP</label>
            <input id={`cp-${e.id}`} type="number" min={0} step={1} inputMode="numeric"
              value={e.awardedPoints ?? ''}
              onChange={(ev) => onChange({ awardedPoints: intOrNull(ev.target.value), placement: null })} />
          </span>
          <span className="field-or">or</span>
          <span className="field">
            <label htmlFor={`pl-${e.id}`}>Place</label>
            <input id={`pl-${e.id}`} type="number" min={1} step={1} inputMode="numeric"
              value={e.placement ?? ''}
              onChange={(ev) => onChange({ placement: intOrNull(ev.target.value), awardedPoints: null })} />
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
          This event has passed. Enter your result, or remove it — it is not counted.
        </p>
      )}

      {/* Only what the row cannot already show: the band, and any real displacement. */}
      {!overdue && result.band && result.rawPoints > 0 && (
        <p className="plan-explain">
          {bandLabel(result.band)} band
          {displacement && <> · {displacement}</>}
        </p>
      )}

      {result.error && <p className="callout danger row-error" role="alert">{result.error}</p>}
    </li>
  );
}
