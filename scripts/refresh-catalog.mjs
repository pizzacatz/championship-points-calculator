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

/** Upcoming events, with one rk9 tournament id per game. */
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
  const up = await upcoming();
  const done = [
    ...await past('VGC', 'limitlessvgc.com', 3),
    ...await past('TCG', 'limitlesstcg.com', 4),
  ];
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    season: SEASON,
    retrievedAt: new Date().toISOString(),
    sources: {
      upcoming: 'https://rk9.gg/events/pokemon',
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
  console.log('upcoming by zone:', byZone);
};
main().catch((e) => { console.error(e); process.exit(1); });
