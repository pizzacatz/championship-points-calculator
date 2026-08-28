import { useEffect, useMemo, useRef, useState } from 'react';
import rulesJson from './data/rules-2027.json';
import baselinesJson from './data/attendance-baselines.json';
import cutoffsJson from './data/cutoffs.json';
import catalogJson from './data/events-catalog.json';
import { evaluatePath, eventTypesForGame, gapTo, planningTarget, ruleFor } from './domain/calculate';
import { solveLadder } from './domain/ladder';
import { parsePath } from './domain/schema';
import type {
  AttendanceBaselines, CatalogEvent, Cutoffs, EventsCatalog, Game,
  LeaderboardSnapshot, RatingZoneId, SeasonRules,
} from './domain/types';
import { blankEvent, usePaths, useTheme } from './store';
import { PlanRow } from './components/PlanRow';
import { EventCatalog } from './components/EventCatalog';
import { LadderPanel } from './components/LadderPanel';
import { VERSION } from './version';

const rules = rulesJson as unknown as SeasonRules;
const baselines = baselinesJson as unknown as AttendanceBaselines;
const cutoffs = cutoffsJson as unknown as Cutoffs;
const catalog = catalogJson as unknown as EventsCatalog;

const GAMES: { id: Game; label: string }[] = [
  { id: 'VGC', label: 'Video Game' },
  { id: 'TCG', label: 'Trading Card Game' },
  { id: 'GO', label: 'Pokémon GO' },
];

const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString());

export default function App() {
  const { theme, toggle } = useTheme();
  const store = usePaths();
  const path = store.active;
  const [snapshot, setSnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [importError, setImportError] = useState<string[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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

  const evaluation = useMemo(() => evaluatePath(path, rules, baselines), [path]);
  const { target, source } = planningTarget(path, previousCutoff, liveBoundary);
  const ladder = useMemo(() => solveLadder(path, rules, baselines, target), [path, target]);

  const projected = ladder.projectedTotal;
  const projectedGap = gapTo(target, projected);
  const zoneLabel = rules.ratingZones.find((z) => z.id === zone)?.label ?? zone;
  const hasResults = evaluation.results.some((r) => r.rawPoints > 0);
  const belowPrevious = hasResults && previousCutoff != null && projected < previousCutoff;

  const addedNames = useMemo(
    () => new Set(path.events.map((e) => e.catalogName).filter(Boolean) as string[]),
    [path.events],
  );

  function toggleCatalog(event: CatalogEvent, typeId: string, add: boolean) {
    if (add) store.addEvent({ ...blankEvent(typeId), name: event.name, date: event.date, catalogName: event.name });
    else {
      const found = path.events.find((e) => e.catalogName === event.name);
      if (found) store.removeEvent(found.id);
    }
  }

  function bulkCatalog(items: { event: CatalogEvent; typeId: string }[], add: boolean) {
    if (add) {
      const fresh = items.filter((i) => !addedNames.has(i.event.name));
      store.addEvents(fresh.map((i) => ({
        ...blankEvent(i.typeId), name: i.event.name, date: i.event.date, catalogName: i.event.name,
      })));
    } else {
      store.removeEvents(path.events
        .filter((e) => e.catalogName && items.some((i) => i.event.name === e.catalogName))
        .map((e) => e.id));
    }
  }

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
              <h1>Championship Points</h1>
              <span className="season">{rules.season} Masters</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="game">Game</label>
            <select id="game" value={path.game}
              onChange={(e) => {
                const game = e.target.value as Game;
                const kept = path.events.filter((ev) => ruleFor(rules, ev.eventTypeId)?.games.includes(game));
                store.update({ game, events: kept });
              }}>
              {GAMES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="zone">Rating zone</label>
            <select id="zone" value={zone}
              onChange={(e) => store.update({ ratingZone: e.target.value as RatingZoneId })}>
              {rules.ratingZones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="path-switcher">Plan</label>
            <select id="path-switcher" value={path.id}
              onChange={(e) => store.setActiveId(e.target.value)}>
              {store.paths.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <button type="button" className="theme-toggle" onClick={toggle}
            aria-pressed={theme === 'dark'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="4.2" fill="currentColor" />
                {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                  <line key={a} x1="12" y1="2.5" x2="12" y2="5" stroke="currentColor"
                    strokeWidth="1.8" strokeLinecap="round" transform={`rotate(${a} 12 12)`} />
                ))}
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <path fill="currentColor"
                  d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2Z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <main className="shell" id="main">
        <section aria-labelledby="totals-h">
          <h2 id="totals-h" className="visually-hidden">Totals</h2>
          <div className="target-strip">
            <div className="stat">
              <div className="k">CP now</div>
              <div className="v">{fmt(evaluation.currentTotal)}</div>
            </div>
            <div className="stat headline">
              <div className="k">Projected</div>
              <div className="v">{fmt(projected)}</div>
            </div>
            <div className="stat">
              <div className="k">To go</div>
              <div className="v">{projectedGap === 0 ? 'Reached' : fmt(projectedGap)}</div>
            </div>
          </div>

          <p className="target-line">
            target{' '}
            <input type="number" min={0} step={1} inputMode="numeric"
              aria-label="Planning target in Championship Points"
              value={path.targetOverride ?? target ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                store.update({ targetOverride: v ? Math.max(0, Math.trunc(Number(v))) : null });
              }} />
            {' · '}
            {source === 'override'
              ? <>your own <button type="button" className="ghost"
                  onClick={() => store.update({ targetOverride: null })}>reset</button></>
              : source === 'live' ? 'live boundary'
              : source === 'previous' ? `${cutoffs.season} cutoff · ${zoneLabel}`
              : 'no benchmark available'}
          </p>

          {target != null && projectedGap === 0 && (
            <div className="callout ok" role="status">
              <strong>Target reached.</strong> That is not a Worlds qualification — the season-end
              cutoff moves, and only a direct invitation guarantees a place.
            </div>
          )}

          {belowPrevious && previousCutoff != null && (
            <div className="callout warn">
              <strong>Below last season's minimum.</strong> {fmt(projected)} CP against
              the {cutoffs.season} boundary of {fmt(previousCutoff)}. That is a historical benchmark,
              not a {rules.season} threshold.
            </div>
          )}

          {evaluation.directInvites.length > 0 && (
            <div className="callout ok">
              <strong>Direct invitation earned.</strong>{' '}
              {evaluation.directInvites.map((r) => r.event.name?.trim() || r.rule.label).join(', ')} — a
              qualifying finish regardless of your final total.
            </div>
          )}
        </section>

        <EventCatalog
          catalog={catalog} rules={rules} game={path.game} homeZone={zone}
          addedNames={addedNames} onToggle={toggleCatalog} onBulk={bulkCatalog} />

        <section className="panel" aria-labelledby="plan-h">
          <header>
            <h2 id="plan-h">Your plan</h2>
            <span className="panel-note">
              {path.events.length} event{path.events.length === 1 ? '' : 's'}
            </span>
          </header>

          <div className="row add-manual">
            {eventTypesForGame(rules, path.game)
              .filter((t) => t.scale !== 'major')
              .map((type) => (
                <button key={type.id} type="button" onClick={() => store.addEvent(blankEvent(type.id))}>
                  + {type.label}
                </button>
              ))}
          </div>

          {path.events.length === 0 ? (
            <p className="empty">Pick events above, or add a Cup or Challenge.</p>
          ) : (
            <ol className="plan-list">
              {evaluation.results.map((result) => {
                const rule = ruleFor(rules, result.event.eventTypeId);
                if (!rule) return null;
                return (
                  <PlanRow key={result.event.id} result={result} rule={rule}
                    displacement={evaluation.displacements.find((d) => d.eventId === result.event.id)?.message ?? null}
                    onChange={(patch) => store.updateEvent(result.event.id, patch)}
                    onRemove={() => store.removeEvent(result.event.id)} />
                );
              })}
            </ol>
          )}
        </section>

        <LadderPanel ladder={ladder} />

        <section className="panel" aria-labelledby="bfl-h">
          <header>
            <h2 id="bfl-h">Best Finish Limits</h2>
            <span className="panel-note">Only your best results in each bucket count.</span>
          </header>
          <div className="table-scroll">
            <table>
              <caption className="visually-hidden">Championship Points counted per bucket</caption>
              <thead>
                <tr><th>Bucket</th><th className="num">Slots</th><th className="num">CP</th><th>To improve</th></tr>
              </thead>
              <tbody>
                {evaluation.buckets.map((b) => {
                  const full = b.bestFinishLimit != null && b.slotsUsed >= b.bestFinishLimit;
                  return (
                    <tr key={b.bucket}>
                      <td>{b.label}</td>
                      <td className="num">{b.slotsUsed} of {b.bestFinishLimit ?? '∞'}</td>
                      <td className="num">{fmt(b.countedPoints)}</td>
                      <td>{full ? `beat ${fmt(b.weakestCountedPoints)} CP` : 'any result takes a free slot'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="row plan-actions">
          <button type="button" onClick={() => store.createPath(path.game, zone)}>New plan</button>
          <button type="button" onClick={exportPath}>Export</button>
          <button type="button" onClick={() => fileInput.current?.click()}>Import</button>
          <input ref={fileInput} type="file" accept="application/json" className="visually-hidden"
            aria-label="Import a plan"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
          <button type="button" onClick={() => {
            if (confirm(`Delete "${path.name}"?`)) store.deletePath(path.id);
          }}>Delete plan</button>
        </div>

        {importError && (
          <div className="callout danger" role="alert">
            <strong>Could not import that file.</strong>
            <ul>{importError.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}

        <p className="version">
          <a href={VERSION.repository} target="_blank" rel="noreferrer noopener">
            v{VERSION.app} · rules {rules.rulesVersion} · {rules.verifiedAt}
          </a>
        </p>
      </main>
    </>
  );
}
