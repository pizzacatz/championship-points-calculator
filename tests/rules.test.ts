import { describe, expect, it } from 'vitest';
import { validateRules, parsePath } from '../src/domain/schema';
import { bandFor, tableFor, ruleFor } from '../src/domain/calculate';
import { rules, ev } from './helpers';
import cutoffs from '../src/data/cutoffs.json';

describe('bundled rules data', () => {
  it('has contiguous, monotonically decreasing placement tables', () => {
    expect(validateRules(rules)).toEqual([]);
  });

  it('preserves the published Regional/Special table verbatim', () => {
    const major = rules.placementTables.major;
    expect(major.map((b) => [b.minPlace, b.maxPlace, b.kicker, b.points])).toEqual([
      [1, 1, 0, 350], [2, 2, 4, 325], [3, 4, 8, 300], [5, 8, 17, 280],
      [9, 16, 33, 200], [17, 32, 65, 160], [33, 64, 129, 120], [65, 128, 257, 80],
      [129, 256, 513, 60], [257, 512, 1025, 45], [513, 1024, 2049, 22],
    ]);
  });

  it('puts Regional, Special and International in one shared bucket of five', () => {
    for (const id of ['regional', 'special', 'international']) {
      const rule = ruleFor(rules, id)!;
      expect(rule.bflBucket).toBe('major');
      expect(rule.bestFinishLimit).toBe(5);
    }
  });

  it('keeps League Challenge and League Cup in separate buckets of four', () => {
    const challenge = ruleFor(rules, 'league-challenge')!;
    const cup = ruleFor(rules, 'league-cup')!;
    expect(challenge.bflBucket).not.toBe(cup.bflBucket);
    expect(challenge.bestFinishLimit).toBe(4);
    expect(cup.bestFinishLimit).toBe(4);
  });

  it('offers each game only the event types that apply to it', () => {
    expect(ruleFor(rules, 'vgc-global-challenge')!.games).toEqual(['VGC']);
    expect(ruleFor(rules, 'go-leaderboard-challenge')!.games).toEqual(['GO']);
    expect(ruleFor(rules, 'regional')!.games.sort()).toEqual(['GO', 'TCG', 'VGC']);
  });

  it('records the direct-invite depth published for each event type', () => {
    expect(ruleFor(rules, 'regional')!.directInvitePlacesThrough).toBe(1);
    expect(ruleFor(rules, 'special')!.directInvitePlacesThrough).toBe(1);
    expect(ruleFor(rules, 'international')!.directInvitePlacesThrough).toBe(4);
    expect(ruleFor(rules, 'league-cup')!.directInvitePlacesThrough).toBe(0);
  });

  it('maps an exact placement onto the published band', () => {
    const table = tableFor(rules, ruleFor(rules, 'regional')!);
    expect(bandFor(table, 13)).toMatchObject({ minPlace: 9, maxPlace: 16, points: 200 });
    expect(bandFor(table, 1025)).toBeNull();
  });
});

describe('previous-season cutoffs', () => {
  it('carries the officially published VGC US-and-Canada Masters boundary', () => {
    // PRD §3 cites 842 as the 2026 90th-place total; this is the official row.
    expect(cutoffs.boundaries.VGC.NA).toMatchObject({ rank: 90, championshipPoints: 842 });
  });

  it('has a boundary for every game and rating zone', () => {
    for (const game of ['VGC', 'TCG', 'GO'] as const) {
      for (const zone of ['NA', 'EU', 'LA', 'AP', 'SO'] as const) {
        expect(cutoffs.boundaries[game][zone]?.championshipPoints).toBeGreaterThan(0);
      }
    }
  });
});

describe('path import', () => {
  it('rejects a path whose events belong to another game', () => {
    const result = parsePath({
      schemaVersion: 1, game: 'TCG', ratingZone: 'NA', ageDivision: 'MASTERS',
      targetOverride: null, attendanceAdjustment: 0,
      events: [{ ...ev({ eventTypeId: 'vgc-global-challenge', placement: 1 }) }],
    }, rules);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.events).toHaveLength(0);
  });

  it('rejects a malformed placement', () => {
    const result = parsePath({
      schemaVersion: 1, game: 'VGC', ratingZone: 'NA', ageDivision: 'MASTERS',
      targetOverride: null, attendanceAdjustment: 0,
      events: [{ eventTypeId: 'regional', status: 'completed', placement: 0 }],
    }, rules);
    expect(result.ok).toBe(false);
  });
});
