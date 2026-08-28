import { useEffect, useMemo, useRef, useState } from 'react';
import rulesJson from './data/rules-2027.json';
import baselinesJson from './data/attendance-baselines.json';
import cutoffsJson from './data/cutoffs.json';
import catalogJson from './data/events-catalog.json';
import { evaluatePath, eventTypesForGame, planningTarget, ruleFor } from './domain/calculate';
import { solveLadder } from './domain/ladder';
import { parsePath } from './domain/schema';
import type {
  AttendanceBaselines, CatalogEvent, Cutoffs, EventsCatalog, Game,
  LeaderboardSnapshot, RatingZoneId, SeasonRules,
} from './domain/types';
import { blankEvent, usePaths, useTheme } from './store';
import { PlanRow } from './components/PlanRow';
import { EventCatalog, keyOf } from './components/EventCatalog';
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

/** A hyphen, not a dash: this stands in for a number, not for punctuation. */
const fmt = (n: number | null | undefined) => (n == null ? '-' : n.toLocaleString());

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
  const { target } = planningTarget(path, previousCutoff, liveBoundary);
  const ladder = useMemo(() => solveLadder(path, rules, baselines, target), [path, target]);

  // TO GO measures against what is banked, not the projection: a plan with six
  // unplayed events has reached nothing yet. Floored, because the difference goes
  // negative once the goal is passed.
  const toGo = target == null ? null : Math.max(0, target - evaluation.currentTotal);
  // AVAILABLE is the most the unplayed events could still add, run through the
  // Best Finish Limit — a sixth major adds only what it displaces, and if it
  // displaces nothing it adds nothing.
  const available = Math.max(0, ladder.maxAttainable - evaluation.currentTotal);
  const zoneLabel = rules.ratingZones.find((z) => z.id === zone)?.label ?? zone;
  // The rank a boundary is read at is the invitation count, which differs by game
  // and zone: 90th for VGC in US and Canada, 140th for the TCG there.
  const invitationRank = rules.invitationSlots[path.game]?.[zone] ?? null;

  const today = new Date().toISOString().slice(0, 10);

  // A plan is a schedule, so it reads in date order. Undated manual events sort last.
  const ordered = useMemo(() => {
    const order = new Map(path.events.map((e, i) => [e.id, i]));
    return [...evaluation.results].sort((a, b) => {
      const da = a.event.date ?? '9999', db = b.event.date ?? '9999';
      return da.localeCompare(db) || order.get(a.event.id)! - order.get(b.event.id)!;
    });
  }, [evaluation.results, path.events]);

  // Position within its Best Finish Limit, for results that have one.
  const bflSlots = useMemo(() => {
    const map = new Map<string, { slot: number | null; limit: number | null }>();
    const order = new Map(path.events.map((e, i) => [e.id, i]));
    const byBucket = new Map<string, typeof evaluation.results>();
    for (const r of evaluation.results) {
      if (r.rawPoints <= 0 || !r.rule) continue;
      byBucket.set(r.rule.bflBucket, [...(byBucket.get(r.rule.bflBucket) ?? []), r]);
    }
    for (const [, list] of byBucket) {
      const limit = list[0].rule.bestFinishLimit;
      [...list]
        .sort((a, b) => b.rawPoints - a.rawPoints || order.get(a.event.id)! - order.get(b.event.id)!)
        .forEach((r, i) => map.set(r.event.id, {
          slot: limit == null || i < limit ? i + 1 : null, limit,
        }));
    }
    return map;
  }, [evaluation.results, path.events]);

  const seasonLine = useMemo(() => {
    const dated = path.events.filter((e) => e.date);
    const played = evaluation.results.filter((r) => r.rawPoints > 0 || r.event.awardedPoints === 0).length;
    const next = dated.filter((e) => e.date! >= today).sort((a, b) => a.date!.localeCompare(b.date!))[0];
    if (!path.events.length) return 'No events yet.';
    // An event past its date with nothing entered sits in neither the played
    // count nor the next one coming — the one state worth prompting about.
    const needing = path.events.filter(
      (e) => e.awardedPoints == null && e.placement == null && e.date != null && e.date < today,
    ).length;
    const parts = [`${played} of ${path.events.length} events played`];
    if (needing) parts.push(`${needing} need${needing === 1 ? 's' : ''} results`);
    if (next) {
      parts.push(`next: ${(next.name || '').replace(/ Pokémon .*/, '')} on `
        + new Date(`${next.date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
    }
    return parts.join(' · ');
  }, [path.events, evaluation.results, today]);

  // A view filter only: it hides rows, it never changes a total, the ladder or
  // what is counted. Every other list control on this page does change the
  // calculation, so the difference has to be obvious.
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of path.events) counts.set(e.eventTypeId, (counts.get(e.eventTypeId) ?? 0) + 1);
    return counts;
  }, [path.events]);

  const addedNames = useMemo(
    () => new Set(path.events.map((e) => e.catalogName).filter(Boolean) as string[]),
    [path.events],
  );

  function toggleCatalog(event: CatalogEvent, typeId: string, add: boolean) {
    if (add) {
      store.addEvent({
        ...blankEvent(typeId), name: event.name, date: event.date,
        displayDate: event.datePrecision === 'month' ? event.displayDate : undefined,
        catalogName: keyOf(event),
      });
    }
    else {
      const found = path.events.find((e) => e.catalogName === keyOf(event));
      if (found && confirmDiscard([found.id])) store.removeEvent(found.id);
    }
  }

  /** Confirm only when something typed would be lost — a prompt on every removal
   *  just teaches people to dismiss it. */
  function confirmDiscard(ids: string[]): boolean {
    const losing = path.events.filter(
      (e) => ids.includes(e.id) && (e.awardedPoints != null || e.placement != null),
    ).length;
    if (!losing) return true;
    return confirm(
      `This removes ${ids.length} event${ids.length === 1 ? '' : 's'}, `
      + `${losing} with ${losing === 1 ? 'a result' : 'results'} you entered. Continue?`,
    );
  }

  function bulkCatalog(items: { event: CatalogEvent; typeId: string }[], add: boolean) {
    if (add) {
      const fresh = items.filter((i) => !addedNames.has(keyOf(i.event)));
      store.addEvents(fresh.map((i) => ({
        ...blankEvent(i.typeId), name: i.event.name, date: i.event.date,
        displayDate: i.event.datePrecision === 'month' ? i.event.displayDate : undefined,
        catalogName: keyOf(i.event),
      })));
    } else {
      const ids = path.events
        .filter((e) => e.catalogName && items.some((i) => keyOf(i.event) === e.catalogName))
        .map((e) => e.id);
      if (confirmDiscard(ids)) store.removeEvents(ids);
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
              <h1>Championship Points Calculator {rules.season}</h1>
              <a className="season" href="https://georgiaplayevents.com/#etc"
                target="_blank" rel="noreferrer noopener">Part of the GPE Network</a>
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

          <div className="totals" role="group" aria-label="Championship Point totals">
            <span className="t"><b>{fmt(evaluation.currentTotal)}</b><i>CP now</i></span>
            <span className="t hero"><b>{fmt(toGo)}</b><i>To go</i></span>
            <span className="t"><b>{fmt(target)}</b><i>Goal</i></span>
            <span className="t"><b>{fmt(available)}</b><i>Available</i></span>
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
          <h2 id="totals-h" className="visually-hidden">Totals and target</h2>

          <p className="season-line">{seasonLine}</p>

          <p className="goal-line">
            <label htmlFor="goal">CP Goal:</label>
            <input id="goal" type="number" min={0} step={1} inputMode="numeric"
              value={path.targetOverride ?? target ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                store.update({ targetOverride: v ? Math.max(0, Math.trunc(Number(v))) : null });
              }} />
            <button type="button" className="ghost" disabled={previousCutoff == null}
              onClick={() => store.update({ targetOverride: previousCutoff })}
              title={previousCutoff == null
                ? 'No previous-season figure for this game and rating zone'
                : `${cutoffs.season} final cutoff, rank ${invitationRank ?? '?'} in ${zoneLabel}`}>
              {cutoffs.season}
            </button>
            {/* Present but disabled until the season's leaderboard opens: absent,
                a player wonders whether the feature exists at all. */}
            <button type="button" className="ghost" disabled={liveBoundary == null}
              onClick={() => store.update({ targetOverride: liveBoundary })}
              title={liveBoundary == null
                ? `The ${rules.season} leaderboard has not opened yet`
                : `Live boundary, rank ${invitationRank ?? '?'} in ${zoneLabel}`}>
              {rules.season}
            </button>
          </p>

          {/* Banked and projected are different claims. The green banner is only
              earned once the CP is actually in hand. */}
          {target != null && evaluation.currentTotal >= target && (
            <div className="callout ok" role="status">
              <strong>Target reached.</strong> That is not a Worlds qualification. The season-end
              cutoff moves, and only a direct invitation guarantees a place.
            </div>
          )}
          {evaluation.directInvites.length > 0 && (
            <div className="callout ok">
              <strong>Direct invitation earned.</strong>{' '}
              {evaluation.directInvites.map((r) => r.event.name?.trim() || r.rule.label).join(', ')}.
              A qualifying finish regardless of your final total.
            </div>
          )}
        </section>

        <EventCatalog
          catalog={catalog} rules={rules} game={path.game} homeZone={zone}
          addedNames={addedNames} onToggle={toggleCatalog} onBulk={bulkCatalog}
          manualTypes={eventTypesForGame(rules, path.game)
            .filter((t) => t.scale !== 'major')
            .map((t) => ({ id: t.id, label: t.label }))}
          onAddManual={(typeId) => store.addEvent(blankEvent(typeId))} />

        <section className="panel" aria-labelledby="plan-h">
          <header>
            <h2 id="plan-h">Your plan</h2>
            <span className="panel-note">
              {path.events.length} event{path.events.length === 1 ? '' : 's'}
            </span>
          </header>

          {typeCounts.size > 1 && (
            <div className="row plan-filter" role="group" aria-label="Filter the plan by event type">
              <button type="button" className={typeFilter == null ? 'on' : ''}
                aria-pressed={typeFilter == null} onClick={() => setTypeFilter(null)}>
                All {path.events.length}
              </button>
              {/* Only types actually present — a filter for an absent type is noise. */}
              {eventTypesForGame(rules, path.game)
                .filter((t) => typeCounts.has(t.id))
                .map((t) => (
                  <button key={t.id} type="button" className={typeFilter === t.id ? 'on' : ''}
                    aria-pressed={typeFilter === t.id}
                    onClick={() => setTypeFilter(typeFilter === t.id ? null : t.id)}>
                    {t.shortLabel} {typeCounts.get(t.id)}
                  </button>
                ))}
            </div>
          )}

          {path.events.length === 0 ? (
            <p className="empty">Pick events above, or add a Cup or Challenge.</p>
          ) : (
            <ol className="plan-list">
              {ordered
                .filter((r) => typeFilter == null || r.event.eventTypeId === typeFilter)
                .map((result) => {
                const rule = ruleFor(rules, result.event.eventTypeId);
                if (!rule) return null;
                const e = result.event;
                const isResult = e.awardedPoints != null || e.placement != null;
                return (
                  <PlanRow key={e.id} result={result} rule={rule}
                    bfl={bflSlots.get(e.id) ?? (result.rawPoints > 0
                      ? { slot: null, limit: rule.bestFinishLimit } : null)}
                    overdue={!isResult && e.date != null && e.date < today}
                    needsDate={!e.catalogName && rule.scale !== 'major'}
                    onChange={(patch) => store.updateEvent(e.id, patch)}
                    onRemove={() => { if (confirmDiscard([e.id])) store.removeEvent(e.id); }} />
                );
              })}
            </ol>
          )}

          {typeFilter && (
            <p className="hint filter-note">
              Showing {typeCounts.get(typeFilter) ?? 0} of {path.events.length} events.
              Filtering changes nothing that is counted.
            </p>
          )}
        </section>

        <LadderPanel ladder={ladder} />

        <div className="row plan-actions">
          <button type="button" onClick={() => store.createPath(path.game, zone)}>New plan</button>
          <button type="button" onClick={exportPath}>Export</button>
          <button type="button" onClick={() => fileInput.current?.click()}>Import</button>
          <input ref={fileInput} type="file" accept="application/json" className="visually-hidden"
            aria-label="Import a plan"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
          <button type="button" className="danger" onClick={() => {
            if (confirm(`Delete "${path.name}"?`)) store.deletePath(path.id);
          }}>Delete plan</button>
        </div>

        {importError && (
          <div className="callout danger" role="alert">
            <strong>Could not import that file.</strong>
            <ul>{importError.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}

        {/* Removed from the footer in v2 as dead weight, back as a closed block:
            present for anyone checking a payout, invisible otherwise. */}
        <details className="sources">
          <summary>Official rules and payout tables</summary>
          <p className="hint">
            Every Championship Point value, Best Finish Limit and direct-invitation rule
            in this calculator is transcribed from these pages.
            Rules {rules.rulesVersion}, verified {rules.verifiedAt}.
          </p>
          <ul>
            {rules.sourceUrls.map((u) => (
              <li key={u}>
                <a href={u} target="_blank" rel="noreferrer noopener">
                  {u.replace('https://championships.pokemon.com/en-us/', '')}
                </a>
              </li>
            ))}
          </ul>
        </details>

        <p className="version">
          <a href={VERSION.repository} target="_blank" rel="noreferrer noopener">
            v{VERSION.app} · rules {rules.rulesVersion} · {rules.verifiedAt}
          </a>
        </p>
      </main>
    </>
  );
}
