import type { EvaluatedResult, EventTypeRule, PlacementBand, PlannedEvent } from '../domain/types';
import { bandLabel } from '../domain/calculate';

const REASON_BADGE: Record<EvaluatedResult['reason'], { text: string; cls: string }> = {
  'counts': { text: 'Counts toward total', cls: 'ok' },
  'planned-counts': { text: 'Planned — would count', cls: 'accent' },
  'excluded-by-bfl': { text: 'Excluded by BFL', cls: 'muted' },
  'below-kicker': { text: 'Below kicker', cls: 'warn' },
  'unverified-attendance': { text: 'Unverified attendance', cls: 'warn' },
  'invalid': { text: 'Needs correction', cls: 'danger' },
  'incomplete': { text: 'Incomplete', cls: 'muted' },
};

const numberOrNull = (v: string): number | null => {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

type Props = {
  result: EvaluatedResult;
  rule: EventTypeRule;
  table: PlacementBand[];
  displacement: string | null;
  onChange: (patch: Partial<PlannedEvent>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (direction: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
};

export function PlanRow({
  result, rule, table, displacement, onChange, onRemove, onDuplicate, onMove, isFirst, isLast,
}: Props) {
  const e = result.event;
  const badge = REASON_BADGE[result.reason];
  const planned = e.status === 'planned';
  const title = e.name?.trim() || rule.label;
  const pointsLabel = planned ? 'Hypothetical CP' : 'CP awarded';

  return (
    <li className={`plan-row ${planned ? 'planned' : ''} ${result.error ? 'invalid' : ''}`}>
      <header>
        <span className="title">{title}</span>
        <span className="badge muted">{rule.shortLabel}</span>
        <span className={`badge ${badge.cls}`}>{badge.text}</span>
        {result.directInvite && <span className="badge ok">Direct invitation earned</span>}
        {result.conditional && <span className="badge warn">Conditional on kicker</span>}
        <span className="row" role="group" aria-label={`Actions for ${title}`}>
          <button type="button" className="icon" onClick={() => onMove(-1)} disabled={isFirst}
            aria-label={`Move ${title} earlier`}>↑</button>
          <button type="button" className="icon" onClick={() => onMove(1)} disabled={isLast}
            aria-label={`Move ${title} later`}>↓</button>
          <button type="button" className="icon" onClick={onDuplicate} aria-label={`Duplicate ${title}`}>Duplicate</button>
          <button type="button" className="icon" onClick={onRemove} aria-label={`Remove ${title}`}>Remove</button>
        </span>
      </header>

      <div className="plan-fields">
        <div>
          <label htmlFor={`name-${e.id}`}>Event name</label>
          <input id={`name-${e.id}`} type="text" value={e.name}
            placeholder={rule.label}
            onChange={(ev) => onChange({ name: ev.target.value })} />
        </div>

        <div>
          <label htmlFor={`status-${e.id}`}>Status</label>
          <select id={`status-${e.id}`} value={e.status}
            onChange={(ev) => onChange({ status: ev.target.value as PlannedEvent['status'] })}>
            <option value="completed">Completed</option>
            <option value="planned">Planned</option>
          </select>
        </div>

        <div>
          <label htmlFor={`date-${e.id}`}>Date</label>
          <input id={`date-${e.id}`} type="date" value={e.date ?? ''}
            onChange={(ev) => onChange({ date: ev.target.value || null })} />
        </div>

        <div>
          <label htmlFor={`place-${e.id}`}>Final placement</label>
          <input id={`place-${e.id}`} type="number" min={1} step={1} inputMode="numeric"
            value={e.placement ?? ''}
            onChange={(ev) => onChange({ placement: numberOrNull(ev.target.value) })} />
          <p className="hint">
            {result.band ? `${bandLabel(result.band)} band` : 'Exact final standing'}
          </p>
        </div>

        <div>
          <label htmlFor={`cp-${e.id}`}>{pointsLabel}</label>
          <input id={`cp-${e.id}`} type="number" min={0} step={1} inputMode="numeric"
            value={e.awardedPoints ?? ''}
            onChange={(ev) => onChange({ awardedPoints: numberOrNull(ev.target.value) })} />
          <p className="hint">
            {result.band
              ? `${bandLabel(result.band)} pays ${result.band.points} CP`
              : 'Optional'}
          </p>
        </div>

        <div>
          <label htmlFor={`att-${e.id}`}>Total attendance</label>
          <input id={`att-${e.id}`} type="number" min={0} step={1} inputMode="numeric"
            value={e.attendance ?? ''}
            placeholder={result.attendanceSource === 'baseline' && result.attendanceUsed != null
              ? String(result.attendanceUsed) : ''}
            onChange={(ev) => onChange({ attendance: numberOrNull(ev.target.value) })} />
          <p className="hint">
            Actual players in {rule.scale === 'online' ? 'this competition' : 'this game and division'}
            {result.attendanceSource === 'baseline' && ' — projected from the baseline'}
          </p>
        </div>

        {planned && (
          <>
            <div>
              <label htmlFor={`best-${e.id}`}>Best finish to assume</label>
              <input id={`best-${e.id}`} type="number" min={1} step={1} inputMode="numeric"
                value={e.bestFinishConstraint ?? ''} placeholder="1"
                onChange={(ev) => onChange({ bestFinishConstraint: numberOrNull(ev.target.value) })} />
              <p className="hint">Caps what generated paths may ask of you</p>
            </div>
            <div>
              <label htmlFor={`commit-${e.id}`}>Commitment</label>
              <select id={`commit-${e.id}`} value={e.committed ? 'committed' : 'optional'}
                onChange={(ev) => onChange({ committed: ev.target.value === 'committed' })}>
                <option value="optional">Optional</option>
                <option value="committed">Committed</option>
              </select>
            </div>
          </>
        )}

        <div style={{ gridColumn: '1 / -1' }}>
          <label htmlFor={`notes-${e.id}`}>Notes</label>
          <input id={`notes-${e.id}`} type="text" value={e.notes}
            onChange={(ev) => onChange({ notes: ev.target.value })} />
        </div>
      </div>

      <p className="plan-explain">
        <span className="points">{result.rawPoints} CP raw.</span>{' '}
        {result.explanation}
        {displacement && <> {displacement}</>}
      </p>

      {result.error && (
        <p className="callout danger" role="alert" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
          {result.error}
        </p>
      )}

      <details style={{ marginTop: '0.5rem' }}>
        <summary className="hint" style={{ cursor: 'pointer' }}>Payout table for {rule.label}</summary>
        <div className="table-scroll">
          <table>
            <caption className="visually-hidden">{rule.label} Championship Point payouts</caption>
            <thead>
              <tr><th>Placement</th><th className="num">Kicker</th><th className="num">CP</th></tr>
            </thead>
            <tbody>
              {table.map((band) => (
                <tr key={band.minPlace}
                  style={result.band?.minPlace === band.minPlace
                    ? { background: 'var(--accent-soft)', fontWeight: 650 } : undefined}>
                  <td>{bandLabel(band)}{result.band?.minPlace === band.minPlace && ' ← this result'}</td>
                  <td className="num">{band.kicker.toLocaleString()}</td>
                  <td className="num">{band.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </li>
  );
}
