#!/usr/bin/env node
/**
 * Harvests Masters attendance per event from rk9.gg, the official Play! Pokémon
 * tournament software.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE RUNNING IT.
 *
 * rk9.gg/robots.txt disallows /roster/ and /pairings/. This script reads
 * /roster/ anyway, at the explicit direction of the repository owner. That is a
 * deliberate choice to override a site operator's stated access policy, and the
 * consequences — rate limiting, an IP block, a complaint — land on whoever runs
 * it. It is not scheduled in CI for that reason: run it by hand, rarely.
 *
 * Because rk9 is the software running live tournaments, it is written to cost
 * that service as little as possible:
 *
 *   - Only Pokémon GO by default. TCG and VGC attendance already comes from
 *     Limitless, which permits crawling, so there is no reason to ask rk9 for
 *     figures we already have. `--game all` exists but triples the load.
 *   - Event discovery uses /event/, which robots.txt permits.
 *   - Sequential, never concurrent, with a delay between requests.
 *   - Every response is cached to disk, so a re-run costs nothing.
 *   - Rosters are counted as they stream and then discarded. Player names,
 *     countries and Play! Pokémon IDs are never parsed, stored or written out.
 *     The only thing that leaves this script is a count per division.
 *
 * Usage:
 *   node scripts/harvest-rk9.mjs                 # Pokémon GO, 2026 season
 *   node scripts/harvest-rk9.mjs --game all      # all three games
 *   node scripts/harvest-rk9.mjs --season 2027
 *   node scripts/harvest-rk9.mjs --write         # update attendance-baselines.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = resolve(ROOT, '.cache/rk9');
const BASELINES = resolve(ROOT, 'src/data/attendance-baselines.json');

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const SEASON = Number(arg('--season', '2026'));
const GAME = arg('--game', 'go').toLowerCase();
const WRITE = process.argv.includes('--write');
const DELAY_MS = Number(arg('--delay', '4000'));

const UA = 'championship-points-calculator/1.0 (+https://github.com/pizzacatz/championship-points-calculator)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Map the game label rk9 prints next to a roster link onto our game ids. */
const GAME_OF_LABEL = (label) =>
  /Pok[eé]mon GO/i.test(label) ? 'GO' : /\bVGC\b/i.test(label) ? 'VGC' : /\bTCG\b/i.test(label) ? 'TCG' : null;

mkdirSync(CACHE, { recursive: true });
const cachePath = (key) => resolve(CACHE, `${key.replace(/[^\w.-]+/g, '_')}.html`);

/** Fetch with an on-disk cache, so a re-run never re-hits the site. */
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

// ---------------------------------------------------------------------------
// Event discovery — /event/ is permitted by robots.txt.
// ---------------------------------------------------------------------------

const CATEGORY_OF = (name) =>
  /^(NAIC|EUIC|LAIC|OCIC)\b/i.test(name) ? 'international'
    : /^Special Event/i.test(name) ? 'special'
      : /^Regional/i.test(name) ? 'regional' : null;

/**
 * rk9 event slugs are pokemon-<city>-<season>. rk9 is inconsistent about how it
 * treats multi-word cities, so return every plausible spelling and let the
 * caller take the first that resolves.
 */
function slugsFor(name) {
  const acronym = /^(NAIC|EUIC|LAIC|OCIC)\b/i.exec(name);
  if (acronym) return [acronym[1].toLowerCase()];
  const city = name
    .replace(/^(Regional|Special Event)\s+/i, '')
    .replace(/,.*$/, '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
  return [...new Set([
    city.replace(/[^a-z0-9]+/g, ''),      // losangeles
    city.replace(/[^a-z0-9]+/g, '-'),     // los-angeles
  ])];
}

/** The season's events, named by Limitless (which permits crawling). */
async function eventNames() {
  const code = String(SEASON - 2000 - 1) + String(SEASON - 2000); // 2026 -> "2526"
  const names = new Map();
  for (const category of ['regional', 'special', 'international']) {
    const url = `https://limitlessvgc.com/tournaments?time=${code}&type=${category}&show=100`;
    const html = await get(url, `limitless-${category}-${code}`);
    for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
        .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
      if (cells.length >= 4 && /^\d+$/.test(cells[3]) && CATEGORY_OF(cells[2])) {
        names.set(cells[2], CATEGORY_OF(cells[2]));
      }
    }
  }
  return [...names].map(([name, category]) => ({ name, category, slugs: slugsFor(name) }));
}

/** Roster ids for one event, keyed by game, read off the event page's labels. */
async function rostersFor(event) {
  let html;
  const tried = [];
  for (const slug of event.slugs) {
    const url = `https://rk9.gg/event/pokemon-${slug}-${SEASON}`;
    try {
      html = await get(url, `event-${slug}-${SEASON}`);
      break;
    } catch (err) {
      tried.push(`${url} (${err.message})`);
    }
  }
  if (!html) return { error: `no event page resolved — tried ${tried.join(', ')}` };
  const found = {};
  for (const m of html.matchAll(/\/roster\/([A-Za-z0-9_-]+)/g)) {
    // rk9 prints the game immediately before each roster link. Collapse the
    // whitespace left behind by the tags, or the tail is mostly blank.
    const before = html.slice(Math.max(0, m.index - 900), m.index)
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const game = GAME_OF_LABEL(before.slice(-120));
    if (game && !found[game]) found[game] = m[1];
  }
  return { rosters: found };
}

// ---------------------------------------------------------------------------
// Roster counting — /roster/ is the path robots.txt disallows.
// ---------------------------------------------------------------------------

/**
 * Count players per division in one roster.
 *
 * Header-driven, because the columns differ by game: the video game roster
 * carries a Trainer name column the TCG one does not, and the Pokémon GO roster
 * has no Division column at all — GO is a single-division event, so every row
 * on it is a Masters player.
 *
 * Deliberately narrow: it reads the division cell and the final-standing cell
 * and nothing else. Names, countries, screen names and Play! Pokémon IDs are
 * all in the markup and are never captured, so they cannot reach the output.
 */
function countDivisions(html) {
  const headers = [...html.matchAll(/<th[^>]*>([\s\S]*?)(?:<\/th>|<th|<\/tr>)/g)]
    .map((m) => m[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
  const divisionAt = headers.findIndex((h) => /^division$/i.test(h));
  const standingAt = headers.findIndex((h) => /^standing$/i.test(h));

  const counts = { Masters: 0, Senior: 0, Junior: 0 };
  let standings = 0;
  let rows = 0;

  for (const [, row] of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = row.split('<td').slice(1).map((chunk) => {
      const inner = chunk.includes('>') ? chunk.slice(chunk.indexOf('>') + 1) : chunk;
      return inner.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    });
    if (cells.length < 4) continue;
    rows += 1;

    if (divisionAt >= 0) {
      const division = cells[divisionAt];
      if (division in counts) counts[division] += 1;
    } else {
      counts.Masters += 1;               // single-division event
    }
    if (standingAt >= 0 && /^\d+$/.test(cells[standingAt] ?? '')) standings += 1;
  }

  return {
    ...counts,
    rows,
    // Without a Standing column the roster is registrations, not confirmed
    // finishers. The caller has to say so rather than imply an attendance.
    hasStandings: standingAt >= 0,
    withFinalStanding: standingAt >= 0 ? standings : null,
  };
}

async function main() {
  const games = GAME === 'all' ? ['GO', 'VGC', 'TCG'] : [GAME.toUpperCase()];
  console.log(`rk9 harvest — season ${SEASON}, games ${games.join(', ')}, ${DELAY_MS}ms between requests`);
  console.log('robots.txt disallows /roster/; proceeding at the repository owner\'s direction.\n');

  const events = await eventNames();
  console.log(`${events.length} events named by Limitless\n`);

  const results = [];
  const problems = [];
  const named = {};
  for (const e of events) named[e.category] = (named[e.category] ?? 0) + 1;
  for (const event of events) {
    const { rosters, error } = await rostersFor(event);
    if (error) { problems.push(`${event.name}: ${error}`); continue; }
    for (const game of games) {
      const id = rosters[game];
      if (!id) { problems.push(`${event.name}: no ${game} roster listed`); continue; }
      try {
        const counts = countDivisions(await get(`https://rk9.gg/roster/${id}`, `roster-${id}`));
        results.push({ event: event.name, category: event.category, game, masters: counts.Masters, ...counts });
        const basis = counts.hasStandings ? 'played' : 'registered';
        console.log(`  ${game.padEnd(3)} ${String(counts.Masters).padStart(5)} Masters ${basis.padEnd(10)} ${event.name}`);
      } catch (err) {
        problems.push(`${event.name} ${game}: ${err.message}`);
      }
    }
  }

  const lows = {};
  for (const game of games) {
    lows[game] = {};
    for (const category of ['regional', 'special', 'international']) {
      const rows = results.filter((r) => r.game === game && r.category === category && r.masters > 0);
      if (!rows.length) continue;
      const min = rows.reduce((a, b) => (b.masters < a.masters ? b : a));
      lows[game][category] = {
        attendance: min.masters, sourceEvent: min.event,
        events: rows.length, eventsNamed: named[category] ?? rows.length,
        basis: min.hasStandings ? 'played' : 'registered',
      };
    }
  }

  console.log('\nlowest Masters field per category');
  for (const [game, cats] of Object.entries(lows)) {
    for (const [category, v] of Object.entries(cats)) {
      const cover = `${v.events}/${v.eventsNamed} events`;
      console.log(`  ${game.padEnd(3)} ${category.padEnd(14)} ${String(v.attendance).padStart(5)} ${v.basis.padEnd(10)} ${cover.padEnd(16)} ${v.sourceEvent}`);
    }
  }
  if (problems.length) {
    console.log(`\n${problems.length} events could not be read:`);
    for (const p of problems.slice(0, 15)) console.log(`  - ${p}`);
  }

  if (!WRITE) { console.log('\n(dry run — pass --write to update attendance-baselines.json)'); return; }

  const data = JSON.parse(readFileSync(BASELINES, 'utf8'));
  for (const [game, cats] of Object.entries(lows)) {
    for (const [category, v] of Object.entries(cats)) {
      const complete = v.events >= v.eventsNamed;
      const caveats = [];
      if (v.basis === 'registered') {
        caveats.push('this roster publishes no final standings, so the figure counts the ' +
          'roster rather than the field that played, and the direction of the error is ' +
          'UNRESOLVED: for Orlando 2026 GO this roster holds 156 where Liquipedia reports 174');
      }
      if (!complete) {
        caveats.push(`only ${v.events} of the ${v.eventsNamed} events in this category are on ` +
          'rk9 at all, so this is the lowest of a partial set, not of the season');
      }
      data.baselines[game][category] = {
        attendance: v.attendance,
        sourceEvent: `${v.sourceEvent} — rk9 roster`
          + (caveats.length ? ` (${caveats.join('; ')})` : ', Masters with a final standing'),
        // Only a complete sweep of confirmed finishers counts as verified. Anything
        // less stays conditional in the UI rather than posing as an observation.
        verified: v.basis === 'played' && complete,
        basis: v.basis,
      };
      data.observations[game][category] = {
        events: v.events, eventsNamed: v.eventsNamed, basis: v.basis, source: 'rk9.gg',
      };
    }
  }
  data.verified = Object.values(data.baselines).every((g) => Object.values(g).every((c) => c.verified));
  data.retrievedAt = new Date().toISOString();
  writeFileSync(BASELINES, JSON.stringify(data, null, 2) + '\n');
  console.log(`\nwrote ${BASELINES}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
