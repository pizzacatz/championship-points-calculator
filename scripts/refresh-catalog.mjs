#!/usr/bin/env node
/**
 * Builds src/data/events-catalog.json — the list of majors the checklist offers.
 *
 *   upcoming events : rk9.gg/events/pokemon   (robots.txt permits /events/)
 *   past events     : Limitless               (robots.txt permits everything)
 *
 * rk9 has no past-events view, so a mid-season player's completed majors come
 * from Limitless, which is only days behind and carries Masters player counts.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/data/events-catalog.json');
const UA = 'championship-points-calculator/1.0 (+https://github.com/pizzacatz/championship-points-calculator)';

const SEASON = Number(process.argv[process.argv.indexOf('--season') + 1]) || 2027;
const PAST_CODE = String(SEASON - 2001) + String(SEASON - 2000);   // 2027 -> "2627"
const OFFICIAL_FEED = 'https://championships.pokemon.com/api/events.json';

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
                 jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/**
 * A Championship Series season runs September to the end of June, and the
 * official feed labels an event with the season it belongs to rather than the
 * calendar year it falls in — with no year in the displayed range at all. So
 * "Sept. 18-20" in the 2027 season is September 2026. Worlds, in August, closes
 * the season it is named for.
 */
const calendarYear = (month, season) => (month >= 9 ? season - 1 : season);
const isoDate = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function parseRange(text, season) {
  if (!text) return null;
  const t = text.replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
  const mon = (n) => MONTHS[n.toLowerCase().replace(/\./g, '').slice(0, 4)]
                  ?? MONTHS[n.toLowerCase().replace(/\./g, '').slice(0, 3)];
  let m = /^([A-Za-z.]+)\s*(\d{1,2})\s*-\s*([A-Za-z.]+)\s*(\d{1,2})$/.exec(t);
  if (m) {
    const a = mon(m[1]), b = mon(m[3]);
    return a && b ? { start: isoDate(calendarYear(a, season), a, +m[2]),
                      end: isoDate(calendarYear(b, season), b, +m[4]) } : null;
  }
  m = /^([A-Za-z.]+)\s*(\d{1,2})\s*-\s*(\d{1,2})$/.exec(t);
  if (m) {
    const a = mon(m[1]);
    if (!a) return null;
    const y = calendarYear(a, season);
    return { start: isoDate(y, a, +m[2]), end: isoDate(y, a, +m[3]) };
  }
  m = /^([A-Za-z.]+)\s*(\d{1,2})$/.exec(t);
  if (m) {
    const a = mon(m[1]);
    if (!a) return null;
    const y = calendarYear(a, season);
    return { start: isoDate(y, a, +m[2]), end: isoDate(y, a, +m[2]) };
  }
  return null;
}

const OFFICIAL_ZONE = { northamerica: 'NA', europe: 'EU', latinamerica: 'LA',
                        oceania: 'AP', middleeast: 'SO' };

/** City, for matching an official event against its rk9 listing. */
const cityKey = (name) => name
  .replace(/^\d{4}\s+/, '')
  // rk9 appends things like "Registration opens ..." to the listing title.
  .replace(/\bRegistration\b[\s\S]*$/i, ' ')
  .replace(/Pok[eé]mon/gi, ' ')
  .replace(/(Regional|Special|International|World)\s*Championships?/gi, ' ')
  .replace(/[^A-Za-z ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

/**
 * The full published season, from the official feed.
 *
 * rk9 is not the right spine for this: it lists an event only once registration
 * is announced, so it held 7 of the season's 32 majors. It is still the source
 * for per-game tournament ids, which the official feed does not carry.
 */
async function officialSeason() {
  const res = await fetch(OFFICIAL_FEED, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} for ${OFFICIAL_FEED}`);
  const { items = [] } = await res.json();
  const out = [];
  for (const item of items) {
    if (item.locale_s !== 'en-us') continue;
    if (Number(item.year_s) !== SEASON) continue;
    const name = (item.eventName_s || '').trim();
    const category = categoryOf(name);
    if (!category) continue;
    const range = parseRange(item.displayDateRange_s, SEASON);
    if (!range) continue;
    out.push({
      name: name.replace(/^\d{4}\s+/, ''),
      date: range.start,
      endDate: range.end,
      displayDate: item.displayDateRange_s,
      location: item.eventLocation_s ?? null,
      zone: OFFICIAL_ZONE[item.region_s] ?? null,
      category,
      status: 'upcoming',
      rk9: {},
    });
  }
  return out;
}

/** Country code -> Play! Pokémon rating zone. */
const ZONE = {
  US: 'NA', CA: 'NA',
  GB: 'EU', UK: 'EU', DE: 'EU', FR: 'EU', ES: 'EU', IT: 'EU', NL: 'EU', BE: 'EU', PT: 'EU',
  PL: 'EU', CZ: 'EU', AT: 'EU', CH: 'EU', SE: 'EU', NO: 'EU', DK: 'EU', FI: 'EU', IE: 'EU',
  RS: 'EU', BG: 'EU', HU: 'EU', RO: 'EU', GR: 'EU', SK: 'EU', SI: 'EU', HR: 'EU', LT: 'EU',
  LV: 'EU', EE: 'EU', LU: 'EU', IS: 'EU',
  BR: 'LA', MX: 'LA', AR: 'LA', CL: 'LA', CO: 'LA', PE: 'LA', EC: 'LA', UY: 'LA', PY: 'LA',
  BO: 'LA', CR: 'LA', GT: 'LA', PA: 'LA', DO: 'LA', PR: 'LA', VE: 'LA',
  AU: 'AP', NZ: 'AP',
  ZA: 'SO', AE: 'SO', SA: 'SO', IL: 'SO', EG: 'SO',
};

const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const get = async (url) => {
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  return r.text();
};

const categoryOf = (name) =>
  /\b(NAIC|EUIC|LAIC|OCIC|International)\b/i.test(name) ? 'international'
    : /Special/i.test(name) ? 'special'
      : /Regional/i.test(name) ? 'regional' : null;

/**
 * A Championship Series season runs September to the end of June, and rk9
 * prefixes every event name with the season it belongs to — "2027 Baltimore
 * Pokemon Regional Championships". That prefix is the reliable filter.
 *
 * This matters because rk9's /events/ page is NOT upcoming-only, which an
 * earlier version of this file assumed: it lists last season's completed events
 * alongside the new ones, so without a filter the catalog offers tournaments
 * that have already happened.
 */
const seasonOf = (name) => {
  const m = /^(\d{4})\s/.exec(name);
  return m ? Number(m[1]) : null;
};

/** Sanity check: a 2027-season event falls Sept 2026 to end of June 2027. */
function inSeasonWindow(dateText, season) {
  const year = /(\d{4})/.exec(dateText);
  if (!year) return true;                 // no year printed; trust the name prefix
  const y = Number(year[1]);
  return y === season - 1 || y === season;
}

/** Events for the target season, with one rk9 tournament id per game. */
async function upcoming() {
  const html = await get('https://rk9.gg/events/pokemon');
  const out = [];
  for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
    const ids = [...row.matchAll(/href="\/tournament\/([A-Za-z0-9_-]+)"/g)].map((m) => m[1]);
    if (cells.length < 4 || !ids.length) continue;
    const [date, , name, location] = cells;
    const category = categoryOf(name);
    if (!category) continue;

    // Drop anything from another season — chiefly last season's completed events.
    if (seasonOf(name) !== SEASON) continue;
    if (!inSeasonWindow(date, SEASON)) continue;
    const country = (location.match(/,\s*([A-Z]{2})\s*$/) ?? [])[1];
    // The game each id belongs to shows up twice inside its anchor: as a game
    // icon filename and as the trailing label. Read both; the anchors run long.
    const games = {};
    for (const m of row.matchAll(/href="\/tournament\/([A-Za-z0-9_-]+)"[^>]*>([\s\S]{0,900}?)<\/a>/g)) {
      const inner = m[2];
      const label = text(inner.replace(/<img[^>]*>/g, ' '));
      const icon = (inner.match(/\/static\/images\/(pokemon-go|tcg|vg)[^"]*/) ?? [])[1];
      const game =
        icon === 'pokemon-go' ? 'GO' : icon === 'tcg' ? 'TCG' : icon === 'vg' ? 'VGC'
        : /\bGO\b/i.test(label) ? 'GO' : /\bVG\b/i.test(label) ? 'VGC' : /\bTCG\b/i.test(label) ? 'TCG'
        : null;
      if (game && !games[game]) games[game] = m[1];
    }
    out.push({
      name: name.replace(/^\d{4}\s+/, '').trim(),
      date, location, country: country ?? null, zone: ZONE[country] ?? null,
      category, status: 'upcoming', rk9: games,
    });
  }
  return out;
}

/** Completed events this season, from Limitless, with Masters player counts. */
async function past(game, host, pcol) {
  const out = [];
  for (const type of ['regional', 'special', 'international']) {
    let html;
    try { html = await get(`https://${host}/tournaments?time=${PAST_CODE}&type=${type}&show=100`); }
    catch { continue; }
    for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const c = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => text(m[1]));
      if (c.length < 4 || !/^\d+$/.test(c[pcol] ?? '')) continue;
      out.push({ name: c[2], date: c[0], category: type, status: 'completed',
                 game, attendance: Number(c[pcol]) });
    }
  }
  return out;
}

const main = async () => {
  const official = await officialSeason();
  const listed = await upcoming();
  // Attach rk9 tournament ids where that event has been listed there.
  const byCity = new Map(listed.map((e) => [cityKey(e.name), e.rk9]));
  const up = official.map((e) => ({ ...e, rk9: byCity.get(cityKey(e.name)) ?? {} }));
  const done = [
    ...await past('VGC', 'limitlessvgc.com', 3),
    ...await past('TCG', 'limitlesstcg.com', 4),
  ];
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    season: SEASON,
    retrievedAt: new Date().toISOString(),
    sources: {
      season: OFFICIAL_FEED,
      tournamentIds: 'https://rk9.gg/events/pokemon',
      past: 'https://limitlessvgc.com/tournaments and https://limitlesstcg.com/tournaments',
    },
    note: 'rk9 exposes no past-events view, so completed majors come from Limitless, '
        + 'which is only days behind and carries Masters player counts.',
    upcoming: up,
    completed: done,
  }, null, 2) + '\n');
  console.log(`upcoming ${up.length}, completed ${done.length} -> ${OUT}`);
  const byZone = {};
  for (const e of up) byZone[e.zone ?? '??'] = (byZone[e.zone ?? '??'] ?? 0) + 1;
  console.log('by zone:', byZone,
    '| with rk9 ids:', up.filter((e) => Object.keys(e.rk9).length).length);
};
main().catch((e) => { console.error(e); process.exit(1); });
