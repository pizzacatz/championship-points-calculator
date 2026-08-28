import { useEffect, useMemo, useRef, useState } from 'react';
import rulesJson from './data/rules-2027.json';
import baselinesJson from './data/attendance-baselines.json';
import cutoffsJson from './data/cutoffs.json';
import { evaluatePath, eventTypesForGame, gapTo, planningTarget, ruleFor, tableFor } from './domain/calculate';
import { generatePaths } from './domain/generate';
import { parsePath } from './domain/schema';
import type {
  AttendanceBaselines, Cutoffs, Game, LeaderboardSnapshot,
  RatingZoneId, SeasonRules,
} from './domain/types';
import { blankEvent, usePaths, useTheme } from './store';
import { PlanRow } from './components/PlanRow';
import { AttendanceBaselinesPanel } from './components/AttendanceBaselines';

const rules = rulesJson as unknown as SeasonRules;
const baselines = baselinesJson as unknown as AttendanceBaselines;
const cutoffs = cutoffsJson as unknown as Cutoffs;

const GAMES: { id: Game; label: string }[] = [
  { id: 'VGC', label: 'Video Game (VGC)' },
  { id: 'TCG', label: 'Trading Card Game' },
  { id: 'GO', label: 'Pokémon GO' },
];

const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString());
const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

export default function App() {
  const { theme, toggle } = useTheme();
  const store = usePaths();
  const path = store.active;
  const [snapshot, setSnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [importError, setImportError] = useState<string[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The daily snapshot is a static file refreshed by a scheduled workflow, so a
  // failed fetch just means the live boundary is unavailable — never an error state.
  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/leaderboard-snapshot.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setSnapshot(d); })
      .catch(() => { /* the previous-season cutoff still stands */ });
    return () => { cancelled = true; };
  }, []);

  const zone = path.ratingZone;
  const previousCutoff = cutoffs.boundaries[path.game]?.[zone]?.championshipPoints ?? null;
  const liveBoundary = snapshot?.boundaries?.[path.game]?.[zone]?.championshipPoints ?? null;
  const invitationSlot = rules.invitationSlots[path.game]?.[zone] ?? null;

  const evaluation = useMemo(() => evaluatePath(path, rules, baselines), [path]);
  const { target, source } = planningTarget(path, previousCutoff, liveBoundary);
  const generated = useMemo(
    () => generatePaths(path, rules, baselines, target),
    [path, target],
  );

  const currentGap = gapTo(target, evaluation.currentPoints);
  const projectedGap = gapTo(target, evaluation.projectedPoints);
  const availableTypes = eventTypesForGame(rules, path.game);
  const displacementFor = (id: string) =>
    evaluation.displacements.find((d) => d.eventId === id)?.message ?? null;

  const zoneLabel = rules.ratingZones.find((z) => z.id === zone)?.label ?? zone;
  // Baselines are sourced per game; TCG and VGC are observed, GO is not yet.
  const gameBaselines = Object.values(baselines.baselines[path.game] ?? {});
  const baselinesMissing = gameBaselines.filter((b) => b.attendance == null).length;
  // Only worth saying once the player has actually entered something to score.
  const hasScoringEvents = evaluation.results.some((r) => r.rawPoints > 0);
  const belowPrevious = hasScoringEvents && previousCutoff != null
    && evaluation.projectedPoints < previousCutoff;

  function exportPath() {
    const blob = new Blob([JSON.stringify(path, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${path.name.replace(/[^\w-]+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    setImportError(null);
    try {
      const parsed = parsePath(JSON.parse(await file.text()), rules);
      if (!parsed.ok) { setImportError(parsed.errors); return; }
      store.importPath(parsed.value);
    } catch (err) {
      setImportError([`That file is not valid JSON. ${(err as Error).message}`]);
    }
  }

  return (
    <>
      <a className="skip-link" href="#main">Skip to calculator</a>

      <header className="masthead">
        <div className="masthead-inner">
          <div className="wordmark">
            <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" />
            <div>
              <h1>Championship Points Calculator</h1>
              <span className="season">
                {rules.season} Play! Pokémon Championship Series · Masters Division
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="path-switcher">Path</label>
            <select id="path-switcher" value={path.id}
              onChange={(e) => store.setActiveId(e.target.value)}>
              {store.paths.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <button type="button" onClick={toggle} aria-pressed={theme === 'dark'}>
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
      </header>

      <main className="shell" id="main">
        {/* ---- 1. Path settings ------------------------------------------ */}
        <section className="panel" aria-labelledby="settings-h">
          <header>
            <h2 id="settings-h">Path settings</h2>
            <span className="panel-note">
              Rules {rules.rulesVersion} · verified {rules.verifiedAt}
            </span>
          </header>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div>
              <label htmlFor="path-name">Path name</label>
              <input id="path-name" type="text" value={path.name}
                onChange={(e) => store.update({ name: e.target.value })} />
            </div>

            <div>
              <label htmlFor="game">Game</label>
              <select id="game" value={path.game}
                onChange={(e) => {
                  const game = e.target.value as Game;
                  // Points never cross games, so results that cannot belong here are dropped.
                  const kept = path.events.filter((ev) => ruleFor(rules, ev.eventTypeId)?.games.includes(game));
                  store.update({ game, events: kept });
                }}>
                {GAMES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
              <p className="hint">Championship Points never combine across games.</p>
            </div>

            <div>
              <label htmlFor="zone">Rating zone</label>
              <select id="zone" value={zone}
                onChange={(e) => store.update({ ratingZone: e.target.value as RatingZoneId })}>
                {rules.ratingZones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
              </select>
              <p className="hint">
                {invitationSlot ? `${invitationSlot} Masters invitations` : 'No published slot count'}
              </p>
            </div>

            <div>
              <label htmlFor="division">Age division</label>
              <select id="division" value="MASTERS" disabled>
                <option value="MASTERS">Masters</option>
              </select>
              <p className="hint">Junior and Senior support is deferred.</p>
            </div>

            <div>
              <label htmlFor="target">Planning target (CP)</label>
              <input id="target" type="number" min={0} step={1} inputMode="numeric"
                value={path.targetOverride ?? target ?? ''}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  store.update({ targetOverride: v ? Math.max(0, Math.trunc(Number(v))) : null });
                }} />
              <p className="hint">
                {source === 'override'
                  ? 'Your override.'
                  : source === 'live'
                    ? 'Live boundary — the higher of the two benchmarks.'
                    : source === 'previous'
                      ? `Previous-season cutoff — the higher of the two benchmarks.`
                      : 'No benchmark available.'}
                {path.targetOverride != null && (
                  <> <button type="button" className="ghost"
                    onClick={() => store.update({ targetOverride: null })}>Reset</button></>
                )}
              </p>
            </div>

            <div>
              <label htmlFor="adjust">Attendance adjustment</label>
              <input id="adjust" type="number" step={25} inputMode="numeric"
                value={path.attendanceAdjustment}
                onChange={(e) => store.update({ attendanceAdjustment: Math.trunc(Number(e.target.value) || 0) })} />
              <p className="hint">Added to the projected field size for planned majors.</p>
            </div>
          </div>

          <div className="row" style={{ marginTop: '0.75rem' }}>
            <button type="button" onClick={() => store.createPath(path.game, zone)}>New path</button>
            <button type="button" onClick={exportPath}>Export JSON</button>
            <button type="button" onClick={() => fileInput.current?.click()}>Import JSON</button>
            <input ref={fileInput} type="file" accept="application/json" className="visually-hidden"
              aria-label="Import a qualification path"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
            <button type="button" onClick={() => {
              if (confirm(`Delete "${path.name}"? This cannot be undone.`)) store.deletePath(path.id);
            }}>Delete path</button>
          </div>

          {importError && (
            <div className="callout danger" role="alert" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
              <strong>That path could not be imported.</strong>
              <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                {importError.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </div>
          )}
        </section>

        {/* ---- 2. Target strip -------------------------------------------- */}
        <section aria-labelledby="target-h">
          <h2 id="target-h" className="visually-hidden">Totals and target</h2>
          <div className="target-strip">
            <div className="stat">
              <div className="k">Current CP</div>
              <div className="v">{fmt(evaluation.currentPoints)}</div>
              <div className="sub">Completed results only</div>
            </div>
            <div className="stat headline">
              <div className="k">Projected CP</div>
              <div className="v">{fmt(evaluation.projectedPoints)}</div>
              <div className="sub">Completed plus planned</div>
            </div>
            <div className="stat">
              <div className="k">Planning target</div>
              <div className="v">{fmt(target)}</div>
              <div className="sub">
                {source === 'override' ? 'Your override' : source === 'none' ? 'Unavailable' : `From the ${source === 'live' ? 'live boundary' : 'previous season'}`}
              </div>
            </div>
            <div className="stat">
              <div className="k">Gap to target</div>
              <div className="v">{projectedGap === 0 ? 'Reached' : fmt(projectedGap)}</div>
              <div className="sub">{currentGap == null ? '—' : `${fmt(currentGap)} from completed results`}</div>
            </div>
            <div className="stat">
              <div className="k">Previous cutoff</div>
              <div className="v">{fmt(previousCutoff)}</div>
              <div className="sub">
                {cutoffs.season} rank {cutoffs.boundaries[path.game]?.[zone]?.rank ?? '—'} · {zoneLabel}
              </div>
            </div>
            <div className="stat">
              <div className="k">Live boundary</div>
              <div className="v">{fmt(liveBoundary)}</div>
              <div className="sub">
                {liveBoundary != null
                  ? `Refreshed ${shortDate(snapshot?.retrievedAt)}`
                  : snapshot?.periodPublished === false
                    ? `${rules.season} leaderboard not open yet`
                    : 'Unavailable'}
              </div>
            </div>
          </div>

          {target != null && projectedGap === 0 && (
            <div className="callout ok" style={{ marginTop: '0.75rem' }} role="status">
              <strong>Target reached.</strong> This projection meets your planning target of {fmt(target)} CP.
              That is not a Worlds qualification: the season-end cutoff moves, and only a direct
              invitation guarantees a place.
            </div>
          )}

          {belowPrevious && previousCutoff != null && (
            <div className="callout warn" style={{ marginTop: '0.75rem' }}>
              <strong>Below last season's minimum.</strong> This plan projects {fmt(evaluation.projectedPoints)} CP,
              under the {cutoffs.season} {path.game} {zoneLabel} Masters boundary of {fmt(previousCutoff)} CP.
              Last season's figure is a historical benchmark, not a {rules.season} threshold.
            </div>
          )}

          {evaluation.directInvites.length > 0 && (
            <div className="callout ok" style={{ marginTop: '0.75rem' }}>
              <strong>Direct invitation earned.</strong>{' '}
              {evaluation.directInvites.map((r) => r.event.name?.trim() || r.rule.label).join(', ')} —
              a qualifying finish that stands regardless of your final Championship Point total.
            </div>
          )}
        </section>

        {/* ---- 3. Event catalog ------------------------------------------- */}
        <section className="panel" aria-labelledby="catalog-h">
          <header>
            <h2 id="catalog-h">Add an event</h2>
            <span className="panel-note">Only events you add here are ever calculated.</span>
          </header>
          <div className="row">
            {availableTypes.map((type) => (
              <button key={type.id} type="button"
                onClick={() => store.addEvent(blankEvent(type.id))}>
                + {type.label}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: '0.6rem' }}>
            Every event starts as planned. Switch it to completed once you have a result.
            Feasibility — travel, cost, registration — is yours to judge; this tool does not infer it.
          </p>
        </section>

        {/* ---- 4. Plan table ---------------------------------------------- */}
        <section className="panel" aria-labelledby="plan-h">
          <header>
            <h2 id="plan-h">Your plan</h2>
            <span className="panel-note">
              {path.events.length} event{path.events.length === 1 ? '' : 's'}
              {evaluation.errors.length > 0 && ` · ${evaluation.errors.length} need correction`}
            </span>
          </header>

          {path.events.length === 0 ? (
            <p className="empty">No events yet. Add one above to start planning.</p>
          ) : (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {evaluation.results.map((result, i) => {
                const rule = ruleFor(rules, result.event.eventTypeId);
                if (!rule) return null;
                return (
                  <PlanRow
                    key={result.event.id}
                    result={result}
                    rule={rule}
                    table={tableFor(rules, rule)}
                    displacement={displacementFor(result.event.id)}
                    onChange={(patch) => store.updateEvent(result.event.id, patch)}
                    onRemove={() => store.removeEvent(result.event.id)}
                    onDuplicate={() => store.duplicateEvent(result.event.id)}
                    onMove={(d) => store.moveEvent(result.event.id, d)}
                    isFirst={i === 0}
                    isLast={i === evaluation.results.length - 1}
                  />
                );
              })}
            </ol>
          )}
        </section>

        <AttendanceBaselinesPanel
          baselines={baselines} rules={rules} game={path.game}
          adjustment={path.attendanceAdjustment} />

        {/* ---- 5. Generated paths ----------------------------------------- */}
        <section className="panel" aria-labelledby="paths-h">
          <header>
            <h2 id="paths-h">Ways to reach your target</h2>
            <span className="panel-note">Built only from the events above.</span>
          </header>

          <div className="paths">
            {generated.map((g, i) => (
              <article key={g.strategy} className={`path-card ${i === 0 ? 'default' : ''}`}>
                <h3>
                  {g.label}
                  {i === 0 && <span className="badge accent">Default</span>}
                  {g.feasible
                    ? <span className="badge ok">{fmt(g.total)} CP</span>
                    : <span className="badge warn">Short by {fmt(g.shortfall)}</span>}
                </h3>
                <p className="hint">{g.description}</p>

                {g.feasible ? (
                  g.assignments.length ? (
                    <ol>
                      {g.assignments.map((a) => (
                        <li key={a.eventId}>
                          <strong>{a.eventName}</strong> — finish {a.placement}
                          {a.bandLabel && a.bandLabel !== String(a.placement) && ` (${a.bandLabel} band)`}
                          {' '}for {a.points} CP
                          {a.committed && <> <span className="badge muted">committed</span></>}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="hint">Your completed results already reach the target.</p>
                  )
                ) : (
                  <p className="hint">
                    The best these events can reach is <strong>{fmt(g.maxAttainable)} CP</strong>
                    {target != null && <>, leaving a gap of <strong>{fmt(g.shortfall)} CP</strong></>}.
                    Add more events, or relax a best-finish constraint.
                  </p>
                )}

                {g.notes.map((n) => (
                  <p key={n} className="callout warn" style={{ marginTop: '0.6rem', marginBottom: 0 }}>{n}</p>
                ))}
              </article>
            ))}
          </div>
        </section>

        {/* ---- 6. BFL breakdown -------------------------------------------- */}
        <section className="panel" aria-labelledby="bfl-h">
          <header>
            <h2 id="bfl-h">Best Finish Limit breakdown</h2>
            <span className="panel-note">Only your best results in each bucket count.</span>
          </header>
          <div className="table-scroll">
            <table>
              <caption className="visually-hidden">Championship Points counted per Best Finish Limit bucket</caption>
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th className="num">Slots used</th>
                  <th className="num">CP counted</th>
                  <th>Next result needed</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.buckets.map((b) => {
                  const full = b.bestFinishLimit != null && b.slotsUsed >= b.bestFinishLimit;
                  return (
                    <tr key={b.bucket}>
                      <td>{b.label}</td>
                      <td className="num">{b.slotsUsed} of {b.bestFinishLimit ?? '∞'}</td>
                      <td className="num">{fmt(b.countedPoints)}</td>
                      <td>
                        {full
                          ? `Must beat ${fmt(b.weakestCountedPoints)} CP to displace your weakest counted result`
                          : `Any result worth 1 CP or more takes a free slot`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---- 7. Methodology --------------------------------------------- */}
        <footer className="site panel" aria-labelledby="method-h">
          <h2 id="method-h">Method, sources and limits</h2>

          {baselinesMissing > 0 ? (
            <div className="callout warn">
              <strong>No attendance baseline for {path.game} majors yet.</strong>{' '}
              Play! Pokémon publishes no attendance feed, and the community databases that
              cover the TCG and the video game do not cover {path.game}. Planned {path.game}{' '}
              majors therefore ask you to assume an attendance or a CP outcome rather than
              inventing a field size.
            </div>
          ) : (
            <p>
              <strong>Projected attendance.</strong> {baselines.provenance}
            </p>
          )}

          <p>
            Championship Point tables, Best Finish Limits, invitation slots and direct-invitation
            rules are transcribed from the official {rules.season} Play! Pokémon pages.
            Rules version <strong>{rules.rulesVersion}</strong>, verified <strong>{rules.verifiedAt}</strong>.{' '}
            {rules.verifiedBy}
          </p>
          <p>
            The previous-season cutoff is the Championship Point total held by the player at the
            last Masters invitation slot for your game and rating zone at the end of the {cutoffs.season} season,
            read from the official leaderboard on {shortDate(cutoffs.retrievedAt)}.
            The live boundary is the same figure for the current season, refreshed daily by a scheduled job.
            {snapshot?.periodPublished === false && ` The ${rules.season} leaderboard has not opened yet, so no live boundary is available.`}
            {snapshot?.lastAttemptOk === false && ' The most recent refresh failed; the last valid values are still shown.'}
          </p>
          <p>
            <strong>What this tool does not claim.</strong> Reaching your planning target is not
            qualification. The season-end cutoff is not knowable in advance, and this tool does not
            forecast one or state a probability. Only a direct invitation guarantees a place.
            Junior and Senior divisions, travel, cost and win-rate modelling are all out of scope.
          </p>

          <h2>Direct invitations</h2>
          <ul>{rules.directInviteNotes.map((n) => <li key={n}>{n}</li>)}</ul>

          <h2>Official sources</h2>
          <ul>
            {rules.sourceUrls.map((u) => (
              <li key={u}><a href={u} target="_blank" rel="noreferrer noopener">{u}</a></li>
            ))}
          </ul>

          <p>
            Your paths are stored in this browser only — no account, no server, nothing sent anywhere.
            Export a path to back it up or share it.
          </p>
        </footer>
      </main>
    </>
  );
}
