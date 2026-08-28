import type { Ladder } from '../domain/ladder';

/**
 * The answer: the worst you can do at each event and still reach the target.
 * Demands are relaxed hardest-event-first, so whatever sits last in the order
 * absorbs the residual — which is why a solved plan often asks you to win a Cup.
 */
export function LadderPanel({ ladder }: { ladder: Ladder }) {
  return (
    <section className="panel" aria-labelledby="ladder-h">
      <header>
        <h2 id="ladder-h">What you need</h2>
        {ladder.target != null && (
          <span className="panel-note">
            {ladder.feasible
              ? `Reaches ${ladder.projectedTotal.toLocaleString()} against ${ladder.target.toLocaleString()}`
              : `Short by ${ladder.shortfall?.toLocaleString()}`}
          </span>
        )}
      </header>

      {ladder.rows.length === 0 ? (
        <p className="empty">
          Add an event you haven't played yet and leave it blank — this is where it tells you
          the worst you can do there and still reach your target.
        </p>
      ) : (
        <div className="table-scroll">
          <table>
            <caption className="visually-hidden">Lowest finishes that still reach the target</caption>
            <thead>
              <tr>
                <th>Event</th>
                <th className="num">How many</th>
                <th>Finish needed</th>
                <th className="num">CP each</th>
              </tr>
            </thead>
            <tbody>
              {ladder.rows.map((r) => (
                <tr key={r.eventTypeId}>
                  <td>{r.label}</td>
                  <td className="num">{r.count}</td>
                  <td>
                    {r.bandLabel ?? '—'}
                    {r.projectedField != null && r.deepestPayable && r.band
                      && r.band.points === r.deepestPayable.points && (
                      <span className="hint"> deepest that pays at ~{r.projectedField.toLocaleString()} players</span>
                    )}
                  </td>
                  <td className="num">{r.pointsEach}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ladder.notes.map((n) => (
        <p key={n} className="callout warn ladder-note">{n}</p>
      ))}
    </section>
  );
}
