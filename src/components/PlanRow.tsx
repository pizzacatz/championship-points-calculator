import type { EvaluatedResult, EventTypeRule, PlannedEvent } from '../domain/types';

const BADGE: Record<EvaluatedResult['reason'], { text: string; cls: string }> = {
  'counts': { text: 'Counts', cls: 'ok' },
  'planned-counts': { text: 'Would count', cls: 'accent' },
  'excluded-by-bfl': { text: 'Excluded by BFL', cls: 'muted' },
  'below-kicker': { text: 'Below kicker', cls: 'warn' },
  'unverified-attendance': { text: 'Needs a number', cls: 'warn' },
  'invalid': { text: 'Check this', cls: 'danger' },
  'incomplete': { text: "Planned", cls: 'muted' },
};

const intOrNull = (v: string): number | null => {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

/**
 * One event, one number. Either the CP or the placement — each derives the other,
 * because every CP value is unique within its event type's payout table.
 */
export function PlanRow({
  result, rule, displacement, onChange, onRemove,
}: {
  result: EvaluatedResult;
  rule: EventTypeRule;
  displacement: string | null;
  onChange: (patch: Partial<PlannedEvent>) => void;
  onRemove: () => void;
}) {
  const e = result.event;
  const badge = BADGE[result.reason];
  const title = e.name?.trim() || rule.label;

  return (
    <li className={`plan-row ${result.error ? 'invalid' : ''}`}>
      <div className="plan-main">
        <span className="plan-title">
          {title}
          <span className="plan-sub">{rule.shortLabel}{e.date ? ` · ${e.date}` : ''}</span>
        </span>

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
          <strong>{result.rawPoints} CP</strong>
          <span className={`badge ${badge.cls}`}>{badge.text}</span>
          {result.directInvite && <span className="badge ok">Direct invite</span>}
        </span>

        <button type="button" className="icon" onClick={onRemove} aria-label={`Remove ${title}`}>×</button>
      </div>

      {result.reason !== 'incomplete' && (
        <p className="plan-explain">
          {result.explanation}
          {displacement && <> {displacement}</>}
        </p>
      )}

      {result.error && <p className="callout danger row-error" role="alert">{result.error}</p>}
    </li>
  );
}
