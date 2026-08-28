#!/usr/bin/env node
/**
 * Regenerates src/data/attendance-baselines.json.
 *
 * The PRD defines the projected field size for a PLANNED major as the single
 * lowest Masters attendance observed during the previous season, held separately
 * per game and major-event category. Play! Pokémon publishes no attendance feed,
 * so this reads two community databases that do:
 *
 *   - Limitless (limitlesstcg.com / limitlessvgc.com) for TCG and VGC. Their
 *     tournament tables carry a Masters player count per official event.
 *   - Liquipedia for Pokémon GO, which Limitless does not cover, via its
 *     MediaWiki API `player_number` field.
 *
 * Both are cross-checked against rk9.gg, the official tournament software: for
 * Seattle 2026 VGC, Limitless reports 822 and the rk9 roster holds 821 Masters
 * with a final standing. rk9 itself is not read here — its robots.txt disallows
 * /roster/, so it is a spot-check by hand, not a source this script harvests.
 *
 * Usage: node scripts/refresh-attendance.mjs [--season 2526]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/data/attendance-baselines.json');

const UA = 'championship-points-calculator/1.0 (+https://github.com/pizzacatz/championship-points-calculator)';
const seasonArg = process.argv.indexOf('--season');
const SEASON_CODE = seasonArg > -1 ? process.argv[seasonArg + 1] : '2526';
const SEASON_YEAR = 2000 + Number(SEASON_CODE.slice(2));   // "2526" -> 2026

const LIMITLESS = { TCG: 'limitlesstcg.com', VGC: 'limitlessvgc.com' };
const CATEGORIES = ['regional', 'special', 'international'];

const text = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Scrape one Limitless tournament listing into {name, date, players} rows. */
async function limitless(host, category) {
  const url = `https://${host}/tournaments?time=${SEASON_CODE}&type=${category}&show=100`;
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  const html = await res.text();
  const rows = [];
  for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => text(m[1]));
    // The player count is the last numeric cell before the winner column.
    const players = cells.find((c, i) => i >= 3 && /^\d+$/.test(c));
    if (cells.length >= 4 && players) {
      rows.push({ name: cells[2], date: cells[0], players: Number(players) });
    }
  }
  return rows;
}

const wiki = (params) =>
  fetch(`https://liquipedia.net/pokemon/api.php?${new URLSearchParams(params)}`, {
    headers: { 'user-agent': UA, 'accept-encoding': 'gzip' },
  }).then((r) => r.json());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Liquipedia covers Pokémon GO, which Limitless does not. Rate-limited to 1 req / 2s. */
async function liquipediaGo() {
  const titles = [];
  for (const prefix of ['Pokemon_Championships/Regional/', 'Pokemon_Championships/Special_Event/',
                        'Pokemon_Championships/International/']) {
    let cont;
    do {
      const d = await wiki({
        action: 'query', list: 'allpages', apprefix: prefix, aplimit: '500', format: 'json',
        ...(cont ? { apcontinue: cont } : {}),
      });
      titles.push(...d.query.allpages.map((p) => p.title));
      cont = d.continue?.apcontinue;
      await sleep(2100);
    } while (cont);
  }

  const wanted = titles.filter((t) => t.includes(`/${SEASON_YEAR}/`) && t.endsWith('/Pokemon Go'));
  const rows = [];
  for (const title of wanted) {
    const d = await wiki({
      action: 'parse', page: title.replace(/ /g, '_'), prop: 'wikitext', format: 'json',
    });
    const w = d.parse?.wikitext?.['*'] ?? '';
    const players = /\|\s*player_number\s*=\s*(\d+)/.exec(w);
    const date = /\|\s*sdate\s*=\s*([\d-]+)/.exec(w) ?? /\|\s*date\s*=\s*([\d-]+)/.exec(w);
    if (players) {
      const category = title.startsWith('Pokemon Championships/International/') ? 'international'
        : title.startsWith('Pokemon Championships/Special Event/') ? 'special' : 'regional';
      rows.push({
        category,
        name: title.split('/').slice(2, -2).join(' '),
        date: date?.[1] ?? null,
        players: Number(players[1]),
      });
    }
    await sleep(2100);
  }
  return rows;
}

const lowest = (rows) => rows.reduce((a, b) => (b.players < a.players ? b : a), rows[0]);

async function main() {
  const baselines = {};
  const observations = {};

  for (const [game, host] of Object.entries(LIMITLESS)) {
    baselines[game] = {};
    observations[game] = {};
    for (const category of CATEGORIES) {
      const rows = await limitless(host, category);
      observations[game][category] = { events: rows.length, source: host };
      if (!rows.length) { baselines[game][category] = { attendance: null, sourceEvent: null, verified: false }; continue; }
      const min = lowest(rows);
      baselines[game][category] = {
        attendance: min.players,
        sourceEvent: `${min.name} (${min.date})`,
        verified: true,
      };
      console.log(`${game} ${category}: ${rows.length} events, min ${min.players} — ${min.name}`);
    }
  }

  // Liquipedia rate-limits hard. If it refuses, keep whatever GO figures are
  // already on disk and leave them flagged unverified rather than losing them.
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
  baselines.GO = {};
  observations.GO = {};
  let go = null;
  if (process.argv.includes('--skip-go')) {
    console.log('skipping Pokémon GO (--skip-go)');
  } else {
    console.log('reading Liquipedia for Pokémon GO (rate-limited, this takes a few minutes)…');
    try {
      go = await liquipediaGo();
    } catch (err) {
      console.warn(`  ! Liquipedia unavailable (${err.message}); keeping the previous GO figures.`);
    }
  }

  for (const category of CATEGORIES) {
    const rows = go?.filter((r) => r.category === category) ?? [];
    if (rows.length) {
      const min = lowest(rows);
      observations.GO[category] = { events: rows.length, source: 'liquipedia.net/pokemon' };
      baselines.GO[category] = {
        attendance: min.players, sourceEvent: `${min.name} (${min.date})`, verified: true,
      };
      console.log(`GO ${category}: ${rows.length} events, min ${min.players} — ${min.name}`);
    } else {
      observations.GO[category] = previous?.observations?.GO?.[category]
        ?? { events: 0, source: null };
      const kept = previous?.baselines?.GO?.[category];
      baselines.GO[category] = kept
        ? { ...kept, verified: false }
        : { attendance: null, sourceEvent: null, verified: false };
    }
  }

  writeFileSync(OUT, JSON.stringify({
    season: SEASON_YEAR,
    verified: Object.values(baselines).every((g) => Object.values(g).every((c) => c.verified)),
    retrievedAt: new Date().toISOString(),
    description:
      'Projected Masters attendance for PLANNED major events: the single lowest Masters ' +
      'attendance observed during the previous season, held separately per game and ' +
      'major-event category.',
    provenance:
      'Play! Pokémon publishes no machine-readable attendance feed. TCG and VGC counts come ' +
      'from Limitless (limitlesstcg.com, limitlessvgc.com); Pokémon GO comes from Liquipedia, ' +
      'which Limitless does not cover. Spot-checked against rk9.gg, the official tournament ' +
      'software: Seattle 2026 VGC reads 822 on Limitless and 821 Masters with a final standing ' +
      'on the rk9 roster.',
    categoryNote:
      'Regional, Special and International each carry their own baseline. They share a payout ' +
      'table and one Best Finish Limit, but their field sizes differ by an order of magnitude ' +
      `(${SEASON_YEAR} VGC: smallest Regional 180, smallest Special 43), so a single shared ` +
      'figure would badly misprice two of the three. This refines the recommendation in PRD ' +
      'section 16 with the observed data.',
    zoneNote:
      "Not separated by the player's home rating zone: kicker eligibility depends on attendance " +
      'at the event actually entered, not on where the player lives.',
    regenerateWith: 'node scripts/refresh-attendance.mjs',
    observations,
    baselines,
  }, null, 2) + '\n');
  console.log(`wrote ${OUT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
