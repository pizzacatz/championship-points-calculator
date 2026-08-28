#!/usr/bin/env node
/**
 * Builds src/data/attendance-baselines.json — the field size assumed for a
 * PLANNED major, used only to decide which payout bands its kicker unlocks.
 *
 *   Regional + Special : median of that ZONE's pool, both types together.
 *   International      : median of that event's last three seasons.
 *   Online events      : no baseline; kickers are assumed met.
 *
 * Median rather than mean: pooling Specials into a zone introduces low outliers
 * (Oceania's mean sits below three of its four actual events because of one
 * 43-player Auckland Special), and the median is unmoved by them.
 *
 * Source: Limitless, which permits crawling. Its player count is the Masters
 * count — cross-checked against rk9 (Seattle 2026 VGC: 822 vs 821 Masters with
 * a final standing) and Victory Road (Gdansk 2026 VGC: 418 vs "Attendance 418 MA").
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/data/attendance-baselines.json');
const UA = 'championship-points-calculator/1.0 (+https://github.com/pizzacatz/championship-points-calculator)';

const SEASON = Number(process.argv[process.argv.indexOf('--season') + 1]) || 2027;
// n=1 is the previous COMPLETED season: for 2027 that is "2526". n=0 would be
// the season in progress, which has no final attendance figures yet.
const prevCode = (n) => String(SEASON - 2000 - n - 1) + String(SEASON - 2000 - n);
const GAMES = { VGC: ['limitlessvgc.com', 3], TCG: ['limitlesstcg.com', 4] };
const ZONES = { na: 'NA', eu: 'EU', la: 'LA', oc: 'AP' };
const ICS = { NAIC: 'NA', EUIC: 'EU', LAIC: 'LA', OCIC: 'AP' };

const text = (h) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
/** Median, rounding down on an even count — conservative, and matches the CP rule. */
const median = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };

async function rows(host, code, type, region, pcol) {
  const url = `https://${host}/tournaments?time=${code}&type=${type}&show=100`
            + (region ? `&region=${region}` : '');
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  const html = await res.text();
  const out = [];
  for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const c = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => text(m[1]));
    if (c.length > pcol && /^\d+$/.test(c[pcol])) out.push({ name: c[2], players: Number(c[pcol]) });
  }
  return out;
}

async function main() {
  const baselines = {}, observations = {};

  for (const [game, [host, pcol]] of Object.entries(GAMES)) {
    baselines[game] = { zones: {}, internationals: {} };
    observations[game] = {};

    // Regional + Special pooled per zone, previous season.
    for (const [code, zone] of Object.entries(ZONES)) {
      const pool = [
        ...await rows(host, prevCode(1), 'regional', code, pcol),
        ...await rows(host, prevCode(1), 'special', code, pcol),
      ];
      if (!pool.length) continue;
      const v = pool.map((r) => r.players);
      baselines[game].zones[zone] = { attendance: median(v), events: v.length, basis: 'median' };
      observations[game][zone] = { events: v.length, min: Math.min(...v), max: Math.max(...v) };
      console.log(`${game} ${zone}: n=${v.length} median=${median(v)}`);
    }

    // Each International over its own last three seasons.
    const byIc = {};
    for (const n of [1, 2, 3]) {
      for (const r of await rows(host, prevCode(n), 'international', '', pcol)) {
        const key = Object.keys(ICS).find((k) => r.name.toUpperCase().startsWith(k));
        if (key) (byIc[key] ??= []).push(r.players);
      }
    }
    for (const [ic, v] of Object.entries(byIc)) {
      baselines[game].internationals[ic] = {
        attendance: median(v), zone: ICS[ic], seasons: v.length, basis: 'median of last 3 seasons',
      };
      console.log(`${game} ${ic}: ${v.join(', ')} -> ${median(v)}`);
    }
  }

  // No published field size for GO majors, and none for online events by design.
  baselines.GO = { zones: {}, internationals: {}, unavailable: true };

  writeFileSync(OUT, JSON.stringify({
    season: SEASON,
    previousSeason: SEASON - 1,
    retrievedAt: new Date().toISOString(),
    statistic: 'median',
    description:
      'Projected Masters field size for a PLANNED major, used only to decide which '
      + 'payout bands its kicker unlocks. Regionals and Specials are pooled per rating '
      + 'zone; each International is the median of its own last three seasons.',
    provenance:
      'Limitless (limitlesstcg.com, limitlessvgc.com), which permits crawling. Its '
      + 'player count is the Masters count, cross-checked against rk9 (Seattle 2026 VGC '
      + '822 vs 821 Masters with a final standing) and Victory Road (Gdansk 2026 VGC 418 '
      + 'vs "Attendance 418 MA").',
    onlineEvents:
      'Global/Grand Challenges and the GO Battle League Leaderboard Challenge have no '
      + 'published field size and are not regional. Every kicker is assumed met: Pokemon '
      + 'Champions has 10M+ downloads and the GO leaderboard is ranked globally.',
    observations,
    baselines,
  }, null, 2) + '\n');
  console.log(`\nwrote ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
