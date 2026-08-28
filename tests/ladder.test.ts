import { describe, expect, it } from 'vitest';
import { solveLadder, payableBands } from '../src/domain/ladder';
import { ruleFor } from '../src/domain/calculate';
import { baselines, ev, path, rules } from './helpers';

const solve = (events: Parameters<typeof path>[0], target: number | null, over = {}) =>
  solveLadder(path(events, over), rules, baselines, target);
const blank = (id: string) => ev({ eventTypeId: id });
const row = (l: ReturnType<typeof solve>, id: string) => l.rows.find((r) => r.eventTypeId === id);

describe('payable bands', () => {
  it('offers only bands whose kicker the projected field meets', () => {
    // NA VGC majors project from a 705-player median, so the 257-512 band
    // (kicker 1,025) cannot pay and must never be offered.
    const p = payableBands(ruleFor(rules, 'regional')!, rules, path([]), baselines);
    expect(p.field).toBe(705);
    expect(p.bands.at(-1)).toMatchObject({ minPlace: 129, maxPlace: 256 });
    expect(p.bands.some((b) => b.kicker > 705)).toBe(false);
  });

  it('assumes every kicker is met for online events', () => {
    // No published field size, and Pokémon Champions has 10M+ downloads.
    const p = payableBands(ruleFor(rules, 'vgc-global-challenge')!, rules, path([]), baselines);
    expect(p.assumed).toBe(true);
    expect(p.bands.at(-1)).toMatchObject({ minPlace: 513 });
  });

  it('projects an International from itself, not from the zone', () => {
    const p = payableBands(ruleFor(rules, 'international')!, rules, path([]), baselines);
    expect(p.field).toBe(1096);                       // NAIC three-season median
    expect(p.bands.at(-1)).toMatchObject({ minPlace: 257, maxPlace: 512 });
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

  it('relaxes Internationals before Regionals', () => {
    const l = solve([blank('international'), blank('regional'), blank('regional')], 700);
    const ic = row(l, 'international')!, reg = row(l, 'regional')!;
    // The IC should be pushed deeper into its table than the Regionals are.
    expect(ic.band!.minPlace).toBeGreaterThan(reg.band!.minPlace);
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
    const done = ev({ eventTypeId: 'regional', awardedPoints: 350 });
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
      ev({ eventTypeId: 'regional', awardedPoints: 200 }),   // banked
      ev({ eventTypeId: 'league-cup', awardedPoints: 32 }),  // banked
      blank('international'),
      ...Array.from({ length: 3 }, () => blank('regional')),
      ...Array.from({ length: 2 }, () => blank('vgc-global-challenge')),
      ...Array.from({ length: 2 }, () => blank('league-cup')),
      ...Array.from({ length: 2 }, () => blank('league-challenge')),
    ];
    const l = solve(events, 842);
    expect(l.feasible).toBe(true);
    expect(l.projectedTotal).toBeGreaterThanOrEqual(842);
    // Hardest events relaxed first: the IC sits at its deepest payable band.
    expect(row(l, 'international')!.band).toEqual(row(l, 'international')!.deepestPayable);
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
      ...Array.from({ length: 5 }, () => ev({ eventTypeId: 'regional', awardedPoints: 350 })),
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
    const played = ev({ eventTypeId: 'regional', date: '2020-01-01', awardedPoints: 350 });
    const l = solve([played, blank('regional')], 400);
    expect(l.projectedTotal).toBeGreaterThanOrEqual(400);
  });
});
