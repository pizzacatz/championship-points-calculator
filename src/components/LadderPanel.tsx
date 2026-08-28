import type { Ladder } from '../domain/ladder';
import { finishLabel } from '../domain/finish';

const fmt = (n: number) => n.toLocaleString();

/**
 * The answer: the worst you can do at each event and still reach the target.
 *
 * The counting column is the important one. Nine added Regionals share a Best
 * Finish Limit of five, so only five of them can ever contribute — a row reading
 * "×9" asks for four finishes that cannot count toward anything.
 */
export function LadderPanel({ ladder }: { ladder: Ladder }) {
  const live = ladder.rows.filter((r) => r.counting > 0);
  const idle = ladder.rows.filter((r) => r.counting === 0);

  return (
    <section className="panel" aria-labelledby="ladder-h">
      <header>
        <h2 id="ladder-h">What you need</h2>
        {ladder.target != null && (
          <span className="panel-note">
            {ladder.feasible
              ? `reaches ${fmt(ladder.projectedTotal)} of ${fmt(ladder.target)}`
              : `short by ${fmt(ladder.shortfall ?? 0)}`}
          </span>
        )}
      </header>

      {ladder.rows.length === 0 ? (
        <p className="empty">
          Add an event you haven't played and leave it blank — this is where it tells you
          the worst you can do there and still reach your target.
        </p>
      ) : (
        <div className="table-scroll">
        <table className="ladder">
          <caption className="visually-hidden">Lowest finishes that still reach the target</caption>
          <colgroup>
            <col /><col className="c-count" /><col className="c-finish" />
            <col className="c-cp" /><col className="c-cp" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col" className="num">Counting</th>
              <th scope="col">Finish needed</th>
              <th scope="col" className="num">CP each</th>
              <th scope="col" className="num">CP total</th>
            </tr>
          </thead>
          <tbody>
            {live.map((r) => (
              <tr key={r.eventTypeId}>
                <td>{r.label}</td>
                <td className="num">{r.counting} of {r.count}</td>
                <td>{finishLabel(r.band)}</td>
                <td className="num">{fmt(r.pointsEach)}</td>
                <td className="num">{fmt(r.pointsTotal)}</td>
              </tr>
            ))}
            {idle.map((r) => (
              <tr key={r.eventTypeId} className="idle">
                <td>{r.label}</td>
                <td className="num">0 of {r.count}</td>
                <td colSpan={3} className="idle-note">
                  outside your Best Finish Limit — adds nothing at this projection
                </td>
              </tr>
            ))}
          </tbody>
          {live.length > 0 && (
            <tfoot>
              <tr>
                <th scope="row" colSpan={4}>Projected total</th>
                <td className="num">{fmt(ladder.projectedTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      )}

      {ladder.notes.map((n) => (
        <p key={n} className="callout warn ladder-note">{n}</p>
      ))}
    </section>
  );
}
