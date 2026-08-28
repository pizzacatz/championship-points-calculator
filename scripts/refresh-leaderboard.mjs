#!/usr/bin/env node
/**
 * Refreshes the live Worlds-invitation boundary from the official Play! Pokémon
 * leaderboard API, and (with --with-cutoffs) the previous season's final cutoff.
 *
 * The boundary for a game/zone is the CP total held by the player sitting at the
 * last invitation slot — e.g. rank 90 for VGC Masters in US and Canada.
 *
 * On any failure the previous snapshot is preserved and the failure is recorded,
 * so a bad refresh degrades to stale-but-labelled rather than missing data.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RULES = JSON.parse(readFileSync(resolve(ROOT, 'src/data/rules-2027.json'), 'utf8'));
const OUT = resolve(ROOT, 'public/data/leaderboard-snapshot.json');
const CUTOFFS = resolve(ROOT, 'src/data/cutoffs.json');

const API = 'https://api.play.pokemon.com/services/spar/leaderboards/';
const LEADERBOARD_PAGE = 'https://championships.pokemon.com/en-us/competitors/leaderboards';
const UA = 'championship-points-calculator/1.0 (+https://github.com/pizzacatz/championship-points-calculator)';

const SEASON = RULES.season;                 // 2027
const PREV_SEASON = String(SEASON - 1);      // "2026"

async function getJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/** Pull the curated qualification-period list out of the leaderboard page's CMS payload. */
async function fetchPeriods() {
  const res = await fetch(LEADERBOARD_PAGE, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} fetching leaderboard page`);
  const html = await res.text();
  const blob = html.match(/let encodedData = '([\s\S]*?)';\s*\n/);
  if (!blob) throw new Error('leaderboard page payload not found');
  const section = blob[1].slice(blob[1].indexOf('periodsjson_t'));
  const periods = [];
  const re = /guid\\+&quot;:\s*\\+&quot;([0-9a-f]{32})\\+&quot;[\s\S]{0,200}?name\\+&quot;:\s*\\+&quot;([^\\]*)/g;
  let m;
  while ((m = re.exec(section))) periods.push({ guid: m[1], name: m[2].trim() });
  if (!periods.length) throw new Error('no qualification periods parsed');
  return periods;
}

/** Exact-season period, e.g. the one literally named "2027". */
const findSeason = (periods, name) => periods.find((p) => p.name === name);

async function boundaryFor({ product, region, division, period, slot }) {
  const pageSize = 25;
  const page = Math.ceil(slot / pageSize);
  const url = `${API}?product=${product}&region=${region}&region_type=zone&division=${division}` +
    `&period=${period}&page_size=${pageSize}&page=${page}&point_type=championship&sort_by=ranking_order:asc`;
  const data = await getJson(url);
  const row = (data.results || []).find((r) => r.rank === slot);
  if (!row) return null;
  return {
    rank: row.rank,
    championshipPoints: row.primary_point_total,
    calculationDate: row.calculation_date ?? null,
    totalRanked: data.count ?? null,
  };
}

async function sweep(periodGuid) {
  const out = {};
  for (const [game, product] of Object.entries(RULES.leaderboardProduct)) {
    out[game] = {};
    for (const zone of RULES.ratingZones) {
      const slot = RULES.invitationSlots[game]?.[zone.id];
      if (!slot) { out[game][zone.id] = null; continue; }
      try {
        out[game][zone.id] = await boundaryFor({
          product, region: zone.id, division: RULES.leaderboardDivision[game], period: periodGuid, slot,
        });
      } catch (err) {
        console.warn(`  ! ${game}/${zone.id}: ${err.message}`);
        out[game][zone.id] = null;
      }
    }
  }
  return out;
}

const readIfExists = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

async function main() {
  const withCutoffs = process.argv.includes('--with-cutoffs');
  const previous = readIfExists(OUT);
  const now = new Date().toISOString();

  let periods;
  try {
    periods = await fetchPeriods();
  } catch (err) {
    console.error(`period lookup failed: ${err.message}`);
    if (previous) {
      write(OUT, { ...previous, lastAttemptAt: now, lastAttemptOk: false, lastError: err.message });
      console.error('kept the previous snapshot.');
      return;
    }
    throw err;
  }

  if (withCutoffs) {
    const prev = findSeason(periods, PREV_SEASON);
    if (!prev) {
      console.warn(`no "${PREV_SEASON}" period published; leaving cutoffs.json alone.`);
    } else {
      console.log(`sweeping previous-season (${PREV_SEASON}) final cutoffs…`);
      write(CUTOFFS, {
        season: Number(PREV_SEASON),
        description:
          `Final ${PREV_SEASON}-season Championship Point total held by the player at the last ` +
          `Masters Worlds-invitation slot in each rating zone. Read from the official leaderboard.`,
        sourceUrl: LEADERBOARD_PAGE,
        periodGuid: prev.guid,
        retrievedAt: now,
        boundaries: await sweep(prev.guid),
      });
      console.log(`wrote ${CUTOFFS}`);
    }
  }

  const current = findSeason(periods, String(SEASON));
  if (!current) {
    const msg = `the ${SEASON} qualification period is not published on the official leaderboard yet`;
    console.log(msg);
    write(OUT, {
      season: SEASON,
      periodPublished: false,
      boundaries: previous?.boundaries ?? null,
      retrievedAt: previous?.retrievedAt ?? null,
      lastAttemptAt: now,
      lastAttemptOk: true,
      note: msg,
    });
    return;
  }

  console.log(`sweeping live ${SEASON} boundaries…`);
  const boundaries = await sweep(current.guid);
  const anyRows = Object.values(boundaries).some((z) => Object.values(z).some(Boolean));
  if (!anyRows && previous?.boundaries) {
    console.warn('every boundary lookup came back empty; keeping the previous snapshot.');
    write(OUT, { ...previous, lastAttemptAt: now, lastAttemptOk: false, lastError: 'all boundary lookups empty' });
    return;
  }

  write(OUT, {
    season: SEASON,
    periodPublished: true,
    periodGuid: current.guid,
    sourceUrl: LEADERBOARD_PAGE,
    retrievedAt: now,
    lastAttemptAt: now,
    lastAttemptOk: true,
    boundaries,
  });
  console.log(`wrote ${OUT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
