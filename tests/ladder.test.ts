import { describe, expect, it } from 'vitest';
import { solveLadder, payableBands } from '../src/domain/ladder';
import { evaluatePath, isResult, ruleFor } from '../src/domain/calculate';
import type { PlannedEvent } from '../src/domain/types';
import { baselines, ev, path, rules } from './helpers';

const solve = (events: Parameters<typeof path>[0], target: number | null, over = {}) =>
  solveLadder(path(events, over), rules, baselines, target);
const blank = (id: string) => ev({ eventTypeId: id });
const row = (l: ReturnType<typeof solve>, id: string) => l.rows.find((r) => r.eventTypeId === id);

describe('payable bands', () => {
  it('offers only bands whose kicker the stated field meets', () => {
    // VGC Regionals are stated at 500, so the 129-256 band (kicker 513) cannot
    // pay and must never be offered.
    const p = payableBands(ruleFor(rules, 'regional')!, rules, path([]), baselines);
    expect(p.field).toBe(500);
    expect(p.bands.at(-1)).toMatchObject({ minPlace: 65, maxPlace: 128 });
    expect(p.bands.some((b) => b.kicker > 500)).toBe(false);
  });

  it('lets one event override the season-wide figure for itself alone', () => {
    // VGC Regionals are stated at 500, which cannot reach the 129-256 band. A
    // player who knows one Regional will draw 900 says so on that row, and only
    // that row is projected differently.
    const big = ev({ eventTypeId: 'regional', attendance: 900 });
    const p = payableBands(ruleFor(rules, 'regional')!, rules, path([big]), baselines, big);
    expect(p.field).toBe(900);
    expect(p.bands.at(-1)).toMatchObject({ minPlace: 129, maxPlace: 256 });
    expect(p.assumed).toBe(false);
  });

  it('asks less of an event the player says will be bigger', () => {
    // Two identical Regionals, declared at 900. A 900-player field reaches the
    // 129-256 band that 500 cannot, so the ladder may ask for Top 256 there
    // where the stated figure would have forced Top 128.
    const plain = solve([ev({ eventTypeId: 'regional' }), ev({ eventTypeId: 'regional' })], 120);
    const big = solve([
      ev({ eventTypeId: 'regional', attendance: 900 }),
      ev({ eventTypeId: 'regional', attendance: 900 }),
    ], 120);
    expect(plain.rows[0].projectedField).toBe(500);
    expect(big.rows[0].projectedField).toBe(900);
    expect(big.rows[0].band!.maxPlace).toBeGreaterThan(plain.rows[0].band!.maxPlace);
  });

  it('leaves a game with no stated figure on its observed median', () => {
    // The whole reason the override is per game: a TCG Regional really does run
    // about 2,270, so a flat 500 would be wrong there.
    const p = payableBands(ruleFor(rules, 'regional')!, rules, path([], { game: 'TCG' }), baselines);
    expect(p.field).toBe(2270);
    expect(p.assumed).toBe(false);
  });

  it('holds a VGC Global Challenge to its stated 3,000-player field', () => {
    // Nobody publishes a field size for these. At 3,000 every kicker in the
    // table is met, including the 2,049 the last band needs.
    const p = payableBands(ruleFor(rules, 'vgc-global-challenge')!, rules, path([]), baselines);
    expect(p.assumed).toBe(true);
    expect(p.field).toBe(3000);
    expect(p.bands.at(-1)).toMatchObject({ minPlace: 513, maxPlace: 1024, points: 3 });
  });

  it('still assumes every kicker is met where no figure is stated', () => {
    // The GO Battle League leaderboard is ranked globally: there is no field
    // size to hold it back, so its whole table stays payable.
    const p = payableBands(ruleFor(rules, 'go-leaderboard-challenge')!, rules,
      path([], { game: 'GO' }), baselines);
    expect(p.field).toBe(null);
    expect(p.bands.at(-1)).toMatchObject({ minPlace: 513 });
  });

  it('scores a placement against the same figure the ladder plans with', () => {
    // The assumption has to be one number, or the panel would ask for a finish
    // that then scores nothing.
    const gc = ev({ eventTypeId: 'vgc-global-challenge', placement: 600 });   // needs 2049
    const reg = ev({ eventTypeId: 'regional', placement: 200 });              // needs 513, has 500
    expect(evaluatePath(path([gc]), rules, baselines).currentTotal).toBe(3);
    expect(evaluatePath(path([reg]), rules, baselines).currentTotal).toBe(0);
  });

  it('projects an International from its own figure, not the Regional one', () => {
    const p = payableBands(ruleFor(rules, 'international')!, rules, path([]), baselines);
    expect(p.field).toBe(1000);                       // stated for VGC
    expect(p.bands.at(-1)).toMatchObject({ minPlace: 129, maxPlace: 256 });
  });
});

describe('the ladder', () => {
  it('answers "what is the worst I can do" with the easiest finish that reaches', () => {
    const l = solve([blank('regional'), blank('regional')], 400);
    expect(l.feasible).toBe(true);
    expect(l.projectedTotal).toBeGreaterThanOrEqual(400);
    // 2 x 200 clears 400, so nothing better than a 9-16 should be demanded.
    expect(row(l, 'regional')!.band!.minPlace).toBeGreaterThanOrEqual(9);
  });

  it('asks the same finish of every event in the top tier', () => {
    // Internationals, Regionals, Specials and the online Challenges are taken to
    // be equally hard, so none of them may be relaxed further than its
    // neighbours. Relaxing one type at a time produced plans that wanted Top 512
    // at an International and Top 8 at a Global Challenge at once.
    const l = solve([
      blank('international'), blank('regional'), blank('special'),
      blank('vgc-global-challenge'),
    ], 700);
    const depths = ['international', 'regional', 'special', 'vgc-global-challenge']
      .map((id) => row(l, id)!.band!.maxPlace);
    expect(new Set(depths).size).toBe(1);
  });

  it('lets a type stop short when its own field cannot pay that deep', () => {
    // Lockstep is a ceiling, not a requirement: a Cup assumed at 32 players
    // cannot pay below 5th-8th, so it stops there rather than leaving the tier.
    const l = solve([blank('league-cup'), blank('league-challenge')], 20);
    const cup = row(l, 'league-cup')!;
    expect(cup.band!.kicker).toBeLessThanOrEqual(cup.projectedField!);
  });

  it('pushes residual demand onto the smallest events', () => {
    // Cup is late in the relax order, so it absorbs what the majors give up.
    const l = solve([blank('international'), blank('regional'), blank('league-cup')], 900);
    expect(l.feasible).toBe(true);
    expect(row(l, 'league-cup')!.band!.minPlace).toBeLessThanOrEqual(4);
  });

  it('never demands a finish the projected field cannot pay', () => {
    const l = solve([blank('regional'), blank('regional')], 100);
    const r = row(l, 'regional')!;
    expect(r.band!.kicker).toBeLessThanOrEqual(r.projectedField!);
  });

  it('solves only blank events and treats filled ones as constraints', () => {
    const done = ev({ eventTypeId: 'regional', placement: 1 });
    const open = blank('regional');
    const l = solve([done, open], 500);
    expect(l.rows).toHaveLength(1);
    expect(l.rows[0].count).toBe(1);
    // 350 is banked, so only 150 remains and a 17-32 finish suffices.
    expect(l.rows[0].pointsEach).toBeLessThanOrEqual(200);
  });

  it('respects the Best Finish Limit when counting what a plan can reach', () => {
    // Six blank majors, but only the best five can ever count.
    const l = solve(Array.from({ length: 6 }, () => blank('regional')), 99999);
    expect(l.feasible).toBe(false);
    expect(l.maxAttainable).toBe(350 * 5);
  });

  it('reports the shortfall when the target is out of reach', () => {
    const l = solve([blank('league-cup')], 5000);
    expect(l.feasible).toBe(false);
    expect(l.maxAttainable).toBe(50);
    expect(l.notes.join(' ')).toMatch(/4,950 short/);
  });

  it('asks for a target before answering', () => {
    expect(solve([blank('regional')], null).notes.join(' ')).toMatch(/Set a target/);
  });

  it('is deterministic', () => {
    const events = [blank('international'), blank('regional'), blank('league-cup')];
    const a = JSON.stringify(solve(events, 800));
    const b = JSON.stringify(solve(events, 800));
    expect(a).toBe(b);
  });

  it('reproduces the worked example from the PRD', () => {
    const events = [
      ev({ eventTypeId: 'regional', placement: 9 }),   // banked, 200
      ev({ eventTypeId: 'league-cup', placement: 3 }),  // banked, 32
      blank('international'),
      ...Array.from({ length: 3 }, () => blank('regional')),
      ...Array.from({ length: 2 }, () => blank('vgc-global-challenge')),
      ...Array.from({ length: 2 }, () => blank('league-cup')),
      ...Array.from({ length: 2 }, () => blank('league-challenge')),
    ];
    const l = solve(events, 842);
    expect(l.feasible).toBe(true);
    expect(l.projectedTotal).toBeGreaterThanOrEqual(842);
    // The International, the Regionals and the Global Challenges are one tier, so
    // they are all asked for the same bracket rather than the International being
    // relaxed to Top 512 while the Challenges are held at Top 8.
    const depths = ['international', 'regional', 'vgc-global-challenge']
      .map((id) => row(l, id)!.band!.maxPlace);
    expect(new Set(depths).size).toBe(1);
  });
});

describe('v2.1 — counting, locals and past events', () => {
  it('reports how many of a type can actually count, not how many were added', () => {
    // Nine Regionals share a Best Finish Limit of five, so a row reading x9
    // would ask for four finishes that cannot contribute to anything.
    const l = solve(Array.from({ length: 9 }, () => blank('regional')), 842);
    const r = row(l, 'regional')!;
    expect(r.count).toBe(9);
    expect(r.counting).toBe(5);
    expect(r.pointsTotal).toBe(5 * r.pointsEach);
  });

  it('marks a type that contributes nothing rather than printing a requirement', () => {
    // Five Regionals fill the major bucket; an International worth less cannot
    // displace any of them.
    const events = [
      ...Array.from({ length: 5 }, () => ev({ eventTypeId: 'regional', placement: 1 })),
      blank('international'),
    ];
    const l = solve(events, 842);
    expect(row(l, 'international')!.counting).toBe(0);
    expect(row(l, 'international')!.pointsTotal).toBe(0);
  });

  it('never asks for deeper than a top 4 at a Challenge or a top 8 at a Cup', () => {
    const l = solve([blank('league-challenge'), blank('league-cup')], 60);
    expect(row(l, 'league-challenge')!.band!.maxPlace).toBeLessThanOrEqual(4);
    expect(row(l, 'league-cup')!.band!.maxPlace).toBeLessThanOrEqual(8);
  });

  it('leaves out an event whose date has passed with nothing entered', () => {
    // You cannot go back and compete in a tournament that has finished, so
    // solving for it would inflate the projection.
    const past = ev({ eventTypeId: 'regional', date: '2020-01-01' });
    const future = ev({ eventTypeId: 'regional', date: '2099-01-01' });
    const l = solve([past, future], 200);
    expect(row(l, 'regional')!.count).toBe(1);
  });

  it('still solves a past event once its result is entered', () => {
    const played = ev({ eventTypeId: 'regional', date: '2020-01-01', placement: 1 });
    const l = solve([played, blank('regional')], 400);
    expect(l.projectedTotal).toBeGreaterThanOrEqual(400);
  });
});

/**
 * The ladder's answer is a claim: no easier set of finishes reaches the target.
 * These check it against brute force rather than against itself — every legal
 * combination of demands is enumerated and scored by the same engine the app
 * uses, and the solver's answer has to be the easiest one that reaches.
 *
 * "Easiest" is the stated policy, made precise: relax the top tier as deep as it
 * will go, then the Cups, then the Challenges, with every event type inside a
 * tier held to the same bracket.
 */
describe('the ladder is provably the easiest plan that reaches', () => {
  const TIERS = [
    ['international', 'regional', 'special', 'vgc-global-challenge'],
    ['league-cup'],
    ['league-challenge'],
  ];

  /** Score one plan directly, with each type's demand set to a bracket. */
  const scoreAt = (events: PlannedEvent[], depths: number[]): number => {
    const applied = events.map((e) => {
      const tier = TIERS.findIndex((t) => t.includes(e.eventTypeId));
      if (tier < 0 || isResult(e)) return e;
      const rule = ruleFor(rules, e.eventTypeId)!;
      const bands = payableBands(rule, rules, path(events), baselines).bands;
      let band = bands[0];
      for (const b of bands) if (b.maxPlace <= depths[tier]) band = b;
      return { ...e, placement: band.minPlace };
    });
    return evaluatePath(path(applied), rules, baselines).projectedTotal;
  };

  const BRACKETS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];

  /** Every reachable plan, ordered easiest first by the stated policy. */
  const bestByBruteForce = (events: PlannedEvent[], target: number): number[] | null => {
    const all: number[][] = [];
    for (const a of BRACKETS) for (const b of BRACKETS) for (const c of BRACKETS) {
      if (scoreAt(events, [a, b, c]) >= target) all.push([a, b, c]);
    }
    if (!all.length) return null;
    all.sort((x, y) => (y[0] - x[0]) || (y[1] - x[1]) || (y[2] - x[2]));
    return all[0];
  };

  const cases: [string, PlannedEvent[], number][] = [
    ['the PRD example', [
      ev({ eventTypeId: 'regional', placement: 9 }), ev({ eventTypeId: 'league-cup', placement: 3 }),
      blank('international'),
      ...Array.from({ length: 3 }, () => blank('regional')),
      ...Array.from({ length: 2 }, () => blank('vgc-global-challenge')),
      ...Array.from({ length: 2 }, () => blank('league-cup')),
      ...Array.from({ length: 2 }, () => blank('league-challenge')),
    ], 842],
    ['a plan with more majors than the limit', [
      ...Array.from({ length: 8 }, () => blank('regional')),
      ...Array.from({ length: 3 }, () => blank('international')),
      ...Array.from({ length: 4 }, () => blank('vgc-global-challenge')),
      blank('league-cup'), blank('league-challenge'),
    ], 842],
    ['a plan carrying banked results', [
      ev({ eventTypeId: 'regional', placement: 17 }), ev({ eventTypeId: 'regional', placement: 17 }),
      ...Array.from({ length: 3 }, () => blank('international')),
      ...Array.from({ length: 6 }, () => blank('regional')),
      ...Array.from({ length: 9 }, () => blank('vgc-global-challenge')),
      blank('league-cup'), blank('league-challenge'), blank('league-challenge'),
    ], 842],
    ['a modest target', [
      blank('regional'), blank('regional'), blank('league-cup'),
    ], 400],
  ];

  for (const [label, events, target] of cases) {
    it(`finds the easiest reaching plan: ${label}`, () => {
      const l = solveLadder(path(events), rules, baselines, target);
      const truth = bestByBruteForce(events, target);
      expect(truth).not.toBeNull();
      expect(l.feasible).toBe(true);

      // What the solver asks of each tier, as a bracket. A type whose own field
      // cannot pay that deep stops short, so take the deepest in the tier.
      const asked = TIERS.map((ids) => {
        const depths = ids.map((id) => row(l, id)?.band?.maxPlace).filter((d): d is number => d != null);
        return depths.length ? Math.max(...depths) : null;
      });

      // It reaches.
      expect(l.projectedTotal).toBeGreaterThanOrEqual(target);
      // And it asks no more than the easiest reaching plan brute force can find.
      // Brute force counts in raw brackets, which run past what some tables can
      // pay — a Cup assumed at 32 players stops at 5th-8th however deep it is
      // asked to go — so the demand is clamped to what the tier can actually
      // reach before the two are compared.
      const reachable = (i: number) => {
        const all = TIERS[i].flatMap((id) => {
          const rule = ruleFor(rules, id);
          const has = events.some((e) => e.eventTypeId === id && !isResult(e));
          return rule && has ? payableBands(rule, rules, path(events), baselines).bands : [];
        });
        return all.length ? Math.max(...all.map((b) => b.maxPlace)) : null;
      };
      for (const [i, want] of truth!.entries()) {
        const cap = reachable(i);
        if (asked[i] == null || cap == null) continue;
        expect(asked[i]).toBe(Math.min(want, cap));
      }
      // And one bracket harder at the top tier is not merely unnecessary — going
      // one bracket easier there genuinely falls short.
      const easier = BRACKETS[BRACKETS.indexOf(truth![0]) + 1];
      if (easier != null) {
        expect(scoreAt(events, [easier, truth![1], truth![2]])).toBeLessThan(target);
      }
    });
  }
});
