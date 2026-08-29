#!/usr/bin/env node
/**
 * Fills in real Masters attendance, per game, for majors that have finished.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * rk9.gg/robots.txt disallows /roster/. This reads it anyway, at the explicit
 * direction of the repository owner. The consequences of overriding a site
 * operator's stated policy — rate limiting, a block, a complaint — land on
 * whoever runs it.
 *
 * Why it exists: without it, a completed major is priced from its rating zone's
 * median, and that median is wrong in the one direction that cannot be noticed.
 * VGC Asia-Pacific medians 210 players against real fields as small as 43, so a
 * 17th place — kicker 65, genuinely worth nothing — scores 160 CP and the app
 * never mentions attendance, because by its own logic the number cannot matter.
 * A too-low assumption shows a zero and invites correction; a too-high one is
 * silent. Only the real figure closes that.
 *
 * It is cheap by construction:
 *
 *   - Driven by the rk9 tournament ids already in events-catalog.json, so there
 *     is no discovery pass and no request to Limitless at all.
 *   - Only events whose date has passed. An upcoming event has no roster, and no
 *     placement can be entered for it either.
 *   - Only events still missing a figure, so a re-run costs nothing.
 *   - Sequential, never concurrent, with a delay between requests, and every
 *     response cached to disk.
 *   - Rosters are counted as they are parsed and discarded. Names, countries and
 *     Play! Pokémon IDs are never read. One integer per event per game leaves it.
 *
 * Usage:
 *   node scripts/refresh-event-attendance.mjs            # dry run
 *   node scripts/refresh-event-attendance.mjs --write
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = resolve(ROOT, '.cache/rk9');
const CATALOG = resolve(ROOT, 'src/data/events-catalog.json');

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const WRITE = process.argv.includes('--write');
const DELAY_MS = Number(arg('--delay', '4000'));
const TODAY = arg('--today', new Date().toISOString().slice(0, 10));

const UA = 'championship-points-calculator/1.0 (+https://github.com/pizzacatz/championship-points-calculator)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(CACHE, { recursive: true });
const cachePath = (key) => resolve(CACHE, `${key.replace(/[^\w.-]+/g, '_')}.html`);

async function get(url, key) {
  const path = cachePath(key);
  if (existsSync(path)) return readFileSync(path, 'utf8');
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const body = await res.text();
  writeFileSync(path, body);
  await sleep(DELAY_MS);
  return body;
}

/**
 * Count Masters in one roster.
 *
 * Once an event has run, its TCG and VGC rosters gain a Standing column, and
 * every player carrying one played. Orlando 2026 TCG: 2,734 Masters registered,
 * 2,733 with a standing. That is a real attendance and it is what gets written.
 *
 * Pokémon GO rosters never gain that column, so GO falls back to the
 * registration count, whose error is unresolved in direction as well as size —
 * rk9's Orlando 2026 GO roster holds 156 where Liquipedia reports 174, the
 * roster under-counting rather than over. It is still worth writing, because
 * kickers are spaced roughly a factor of two apart (65, 129, 257, 513): what
 * decides a band is the magnitude of the field, not its last few players. A
 * registration count is wrong by a few per cent. The rating-zone median it
 * replaces is wrong by up to 400%.
 *
 * Header-driven, because the columns differ by game: the video game roster
 * carries a Trainer name column the TCG one does not, and the Pokémon GO roster
 * has no Division column at all — GO is single-division, so every row is Masters.
 *
 * Deliberately narrow: it reads the division cell and the final-standing cell
 * and nothing else. Everything identifying a player is in the markup and none of
 * it is captured, so none of it can reach the output.
 */
function countMasters(html) {
  const headers = [...html.matchAll(/<th[^>]*>([\s\S]*?)(?:<\/th>|<th|<\/tr>)/g)]
    .map((m) => m[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
  const divisionAt = headers.findIndex((h) => /^division$/i.test(h));
  const standingAt = headers.findIndex((h) => /^standing$/i.test(h));

  let masters = 0;
  let played = 0;
  for (const [, row] of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = row.split('<td').slice(1).map((chunk) => {
      const inner = chunk.includes('>') ? chunk.slice(chunk.indexOf('>') + 1) : chunk;
      return inner.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    });
    if (cells.length < 4) continue;
    const isMasters = divisionAt < 0 || cells[divisionAt] === 'Masters';
    if (!isMasters) continue;
    masters += 1;
    if (standingAt >= 0 && /^\d+$/.test(cells[standingAt] ?? '')) played += 1;
  }
  return { masters, played, hasStandings: standingAt >= 0 };
}

async function main() {
  console.log(`event attendance — as of ${TODAY}, ${DELAY_MS}ms between requests`);
  console.log("robots.txt disallows /roster/; proceeding at the repository owner's direction.\n");

  const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
  const lists = ['upcoming', 'online', 'completed'].filter((k) => Array.isArray(catalog[k]));

  let asked = 0;
  let filled = 0;
  const problems = [];

  for (const key of lists) {
    for (const event of catalog[key]) {
      // A date in the future has no roster to read.
      const ends = event.endDate ?? event.date;
      if (!ends || ends >= TODAY) continue;
      const rosters = event.rk9 ?? {};
      for (const [game, id] of Object.entries(rosters)) {
        if (!id) continue;
        if (event.attendance?.[game] != null) continue;      // already known
        asked += 1;
        try {
          const counts = countMasters(await get(`https://rk9.gg/roster/${id}`, `roster-${id}`));
          // An empty roster is an event rk9 has not published yet, not an event
          // nobody entered. Writing 0 would price every finish at it as worthless.
          if (counts.masters === 0) {
            problems.push(`${event.name} ${game}: roster is empty`);
            continue;
          }
          const n = counts.hasStandings && counts.played > 0 ? counts.played : counts.masters;
          event.attendance = { ...(event.attendance ?? {}), [game]: n };
          filled += 1;
          const basis = counts.hasStandings && counts.played > 0 ? 'played' : 'registered';
          console.log(`  ${game.padEnd(3)} ${String(n).padStart(5)} Masters ${basis.padEnd(10)} ${event.name}`);
        } catch (err) {
          problems.push(`${event.name} ${game}: ${err.message}`);
        }
      }
    }
  }

  console.log(`\n${filled} of ${asked} rosters counted`);
  if (problems.length) {
    console.log(`${problems.length} could not be used:`);
    for (const p of problems.slice(0, 20)) console.log(`  - ${p}`);
  }

  if (!filled) { console.log('nothing to write'); return; }
  if (!WRITE) { console.log('(dry run — pass --write to update events-catalog.json)'); return; }

  catalog.attendanceRetrievedAt = new Date().toISOString();
  catalog.attendanceBasis = 'Masters on the rk9 roster: those carrying a final standing '
    + 'where the roster publishes one, which TCG and VGC do once the event has run, and '
    + 'registrations where it does not, which is every Pokémon GO roster.';
  writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + '\n');
  console.log(`wrote ${CATALOG}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
