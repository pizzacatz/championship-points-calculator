import type { AttendanceBaselines, Game, SeasonRules } from '../domain/types';
import { bandLabel } from '../domain/calculate';

const CATEGORIES = [
  { key: 'regional', ruleId: 'regional', label: 'Regional' },
  { key: 'special', ruleId: 'special', label: 'Special' },
  { key: 'international', ruleId: 'international', label: 'International' },
] as const;

/**
 * PRD §6 requires the projected-attendance model to be legible: the baseline,
 * the player's adjustment, the resulting estimate, where the baseline came
 * from, and which CP bands that estimate actually unlocks.
 */
export function AttendanceBaselinesPanel({
  baselines, rules, game, adjustment,
}: {
  baselines: AttendanceBaselines; rules: SeasonRules; game: Game; adjustment: number;
}) {
  const rows = CATEGORIES.map((c) => {
    const entry = baselines.baselines[game]?.[c.key];
    const rule = rules.eventTypes.find((t) => t.id === c.ruleId)!;
    const table = rules.placementTables[rule.table] ?? [];
    const estimate = entry?.attendance == null ? null : Math.max(0, entry.attendance + adjustment);
    const reachable = estimate == null ? [] : table.filter((b) => b.kicker <= estimate);
    return { ...c, entry, estimate, reachable, deepest: reachable[reachable.length - 1] ?? null };
  });

  return (
    <section className="panel" aria-labelledby="baseline-h">
      <header>
        <h2 id="baseline-h">Projected attendance for planned majors</h2>
        <span className="panel-note">
          Lowest {baselines.season} Masters field, per category
        </span>
      </header>

      <div className="table-scroll">
        <table>
          <caption className="visually-hidden">
            Projected attendance baselines and the Championship Point bands they unlock
          </caption>
          <thead>
            <tr>
              <th>Category</th>
              <th className="num">Baseline</th>
              <th className="num">Adjustment</th>
              <th className="num">Estimate</th>
              <th>Deepest band that pays</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td className="num">
                  {r.entry?.attendance?.toLocaleString() ?? <span className="badge warn">none</span>}
                </td>
                <td className="num">{adjustment >= 0 ? `+${adjustment}` : adjustment}</td>
                <td className="num">{r.estimate?.toLocaleString() ?? '—'}</td>
                <td>
                  {r.deepest
                    ? `${bandLabel(r.deepest)} — ${r.deepest.points} CP (kicker ${r.deepest.kicker.toLocaleString()})`
                    : 'Assume an attendance or a CP outcome on the event itself'}
                </td>
                <td>
                  {r.entry?.sourceEvent
                    ? <>{r.entry.sourceEvent} <span className="badge ok">observed</span></>
                    : <span className="badge warn">not sourced</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="hint" style={{ marginTop: '0.6rem' }}>
        These figures apply only to <strong>planned</strong> majors. A completed event always
        uses its actual attendance, and entering an attendance on any planned event overrides
        the projection.
      </p>
    </section>
  );
}
