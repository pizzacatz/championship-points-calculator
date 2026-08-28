import { describe, expect, it } from 'vitest';
import { evaluatePath, evaluateResult, gapTo, planningTarget } from '../src/domain/calculate';
import { baselines, ev, path, rules } from './helpers';

const score = (p: ReturnType<typeof path>) => evaluatePath(p, rules, baselines);
const of = (p: ReturnType<typeof path>, id: string) =>
  score(p).results.find((r) => r.event.id === id)!;

describe('kickers', () => {
  // PRD fixture 4.
  it('pays 0 CP for a Top 512 Regional with 1,024 players, and 45 CP with 1,025', () => {
    const short = ev({ eventTypeId: 'regional', placement: 500, attendance: 1024 });
    const met = ev({ eventTypeId: 'regional', placement: 500, attendance: 1025 });
    expect(evaluateResult(short, rules, path([short]), baselines)).toMatchObject({
      rawPoints: 0, reason: 'below-kicker',
    });
    expect(evaluateResult(met, rules, path([met]), baselines)).toMatchObject({
      rawPoints: 45, reason: 'counts',
    });
  });

  it('explains why a below-kicker finish earned nothing', () => {
    const e = ev({ eventTypeId: 'regional', placement: 500, attendance: 900 });
    expect(evaluateResult(e, rules, path([e]), baselines).explanation)
      .toMatch(/needs 1025 players; 900 attended/);
  });

  it('pays a no-kicker band without needing attendance at all', () => {
    const e = ev({ eventTypeId: 'regional', placement: 1 });
    expect(evaluateResult(e, rules, path([e]), baselines)).toMatchObject({ rawPoints: 350, reason: 'counts' });
  });
});

describe('completed local results', () => {
  // PRD fixture 9.
  it('accepts 13th place plus the published award with no roster size', () => {
    const e = ev({ eventTypeId: 'league-cup', placement: 13, awardedPoints: 20 });
    const r = evaluateResult(e, rules, path([e]), baselines);
    expect(r).toMatchObject({ rawPoints: 20, reason: 'counts', error: null });
    // The award proves only that the kicker minimum was met — no invented roster.
    expect(r.attendanceUsed).toBe(48);
    expect(r.attendanceSource).toBe('implied-by-award');
  });

  // PRD fixture 10.
  it('asks for CP or attendance when a kicker-dependent band has neither', () => {
    const e = ev({ eventTypeId: 'league-cup', placement: 13 });
    const r = evaluateResult(e, rules, path([e]), baselines);
    expect(r.reason).toBe('unverified-attendance');
    expect(r.error).toMatch(/CP awarded or the total attendance/);
  });

  it('rejects an impossible placement and CP combination', () => {
    const e = ev({ eventTypeId: 'league-cup', placement: 13, awardedPoints: 32 });
    const r = evaluateResult(e, rules, path([e]), baselines);
    expect(r.reason).toBe('invalid');
    expect(r.error).toMatch(/pays 20 CP/);
  });

  it('keeps roster optional for a completed 0 CP result', () => {
    const e = ev({ eventTypeId: 'league-cup', placement: 13, awardedPoints: 0 });
    const r = evaluateResult(e, rules, path([e]), baselines);
    expect(r).toMatchObject({ rawPoints: 0, reason: 'below-kicker', error: null });
  });
});

describe('Best Finish Limits', () => {
  const challenge = (place: number, points: number) =>
    ev({ eventTypeId: 'league-challenge', placement: place, awardedPoints: points });

  // PRD fixture 1.
  it('adds nothing when a fifth League Challenge is weaker than the counted four', () => {
    const four = [challenge(1, 15), challenge(1, 15), challenge(2, 12), challenge(2, 12)];
    const before = score(path(four)).currentPoints;
    const weaker = challenge(17, 4);
    const after = score(path([...four, weaker]));
    expect(before).toBe(54);
    expect(after.currentPoints).toBe(54);
    expect(after.results.find((r) => r.event.id === weaker.id)!.reason).toBe('excluded-by-bfl');
  });

  // PRD fixture 2.
  it('adds new CP minus displaced CP when a fifth League Challenge is stronger', () => {
    const four = [challenge(1, 15), challenge(2, 12), challenge(2, 12), challenge(17, 4)];
    const before = score(path(four)).currentPoints; // 15+12+12+4 = 43
    const stronger = challenge(1, 15);
    const after = score(path([...four, stronger])).currentPoints; // drops the 4
    expect(before).toBe(43);
    expect(after).toBe(before + 15 - 4);
  });

  it('keeps League Challenge and League Cup limits independent', () => {
    const challenges = Array.from({ length: 5 }, () => challenge(1, 15));
    const cups = Array.from({ length: 5 }, () => ev({ eventTypeId: 'league-cup', placement: 1, awardedPoints: 50 }));
    const result = score(path([...challenges, ...cups]));
    expect(result.currentPoints).toBe(4 * 15 + 4 * 50);
    const buckets = Object.fromEntries(result.buckets.map((b) => [b.bucket, b.slotsUsed]));
    expect(buckets.leagueChallenge).toBe(4);
    expect(buckets.leagueCup).toBe(4);
  });

  // PRD fixture 3.
  it('counts only the best five across Regional, Special and International results', () => {
    const events = [
      ev({ eventTypeId: 'regional', placement: 1 }),                    // 350
      ev({ eventTypeId: 'international', placement: 3, attendance: 900 }), // 420
      ev({ eventTypeId: 'special', placement: 2, attendance: 400 }),    // 325
      ev({ eventTypeId: 'regional', placement: 5, attendance: 400 }),   // 280
      ev({ eventTypeId: 'regional', placement: 9, attendance: 400 }),   // 200
      ev({ eventTypeId: 'regional', placement: 17, attendance: 400 }),  // 160 — sixth, excluded
    ];
    const result = score(path(events));
    expect(result.currentPoints).toBe(420 + 350 + 325 + 280 + 200);
    expect(result.results[5].reason).toBe('excluded-by-bfl');
    expect(result.buckets.find((b) => b.bucket === 'major')!.slotsUsed).toBe(5);
  });

  it('counts a sixth major only when it displaces a weaker counted major', () => {
    const five = [
      ev({ eventTypeId: 'regional', placement: 1 }),                   // 350
      ev({ eventTypeId: 'regional', placement: 2, attendance: 400 }),  // 325
      ev({ eventTypeId: 'regional', placement: 3, attendance: 400 }),  // 300
      ev({ eventTypeId: 'regional', placement: 5, attendance: 400 }),  // 280
      ev({ eventTypeId: 'regional', placement: 17, attendance: 400 }), // 160
    ];
    const baseTotal = score(path(five)).currentPoints;
    const sixthWeak = ev({ eventTypeId: 'regional', placement: 33, attendance: 400 }); // 120
    expect(score(path([...five, sixthWeak])).currentPoints).toBe(baseTotal);
    const sixthStrong = ev({ eventTypeId: 'regional', placement: 9, attendance: 400 }); // 200
    expect(score(path([...five, sixthStrong])).currentPoints).toBe(baseTotal - 160 + 200);
  });

  it('reports what a new result must beat to improve a full bucket', () => {
    const five = Array.from({ length: 5 }, () => ev({ eventTypeId: 'regional', placement: 17, attendance: 400 }));
    const bucket = score(path(five)).buckets.find((b) => b.bucket === 'major')!;
    expect(bucket.weakestCountedPoints).toBe(160);
    expect(bucket.pointsToImprove).toBe(161);
  });

  it('breaks ties by input order, so inclusion is never nondeterministic', () => {
    const events = Array.from({ length: 6 }, () => ev({ eventTypeId: 'regional', placement: 17, attendance: 400 }));
    const first = score(path(events));
    const second = score(path(events));
    const excluded = (r: ReturnType<typeof score>) => r.results.filter((x) => !x.counted).map((x) => x.event.id);
    expect(excluded(first)).toEqual(excluded(second));
    expect(excluded(first)).toEqual([events[5].id]); // the last one entered
  });
});

describe('planned versus completed', () => {
  // PRD fixture: a planned result moves projected CP only.
  it('leaves current CP untouched and moves projected CP', () => {
    const done = ev({ eventTypeId: 'regional', placement: 1 });
    const plan = ev({ eventTypeId: 'regional', status: 'planned', placement: 9, attendance: 400 });
    const result = score(path([done, plan]));
    expect(result.currentPoints).toBe(350);
    expect(result.projectedPoints).toBe(350 + 200);
  });

  it('explains what a planned result displaces', () => {
    const five = [
      ev({ eventTypeId: 'regional', placement: 2, attendance: 400 }),  // 325
      ev({ eventTypeId: 'regional', placement: 3, attendance: 400 }),  // 300
      ev({ eventTypeId: 'regional', placement: 5, attendance: 400 }),  // 280
      ev({ eventTypeId: 'regional', placement: 9, attendance: 400 }),  // 200
      ev({ eventTypeId: 'regional', placement: 17, attendance: 400 }), // 160
    ];
    const plan = ev({ eventTypeId: 'regional', status: 'planned', placement: 1, name: 'Atlanta Regional' });
    const result = score(path([...five, plan]));
    const d = result.displacements.find((x) => x.eventId === plan.id)!;
    expect(d.netPoints).toBe(350 - 160);
    expect(d.displacedPoints).toBe(160);
    expect(d.message).toMatch(/adds 190 net CP by replacing/);
  });

  it('projects a planned major from the verified previous-season low', () => {
    const plan = ev({ eventTypeId: 'regional', status: 'planned', placement: 9 });
    const r = of(path([plan]), plan.id);
    // Smallest 2026 VGC Regional Masters field: Curitiba, 180 players.
    expect(r.attendanceSource).toBe('baseline');
    expect(r.attendanceUsed).toBe(180);
    // The baseline is a real observation now, so the result is not conditional.
    expect(r.conditional).toBe(false);
    expect(r.rawPoints).toBe(200);
  });

  it('gives Regionals, Specials and Internationals their own baseline', () => {
    // Field sizes differ by an order of magnitude, so one shared figure would
    // misprice two of the three.
    const at = (id: string) => {
      const plan = ev({ eventTypeId: id, status: 'planned', placement: 9 });
      return of(path([plan]), plan.id).attendanceUsed;
    };
    expect(at('regional')).toBe(180);
    expect(at('special')).toBe(43);
    expect(at('international')).toBe(518);
  });

  it('applies the attendance adjustment to the planned-major baseline', () => {
    const plan = ev({ eventTypeId: 'regional', status: 'planned', placement: 257 });
    // VGC regional baseline is 180; the 257–512 band needs a 1,025-player kicker.
    expect(of(path([plan]), plan.id).rawPoints).toBe(0);
    const raised = of(path([plan], { attendanceAdjustment: 900 }), plan.id);
    expect(raised.attendanceUsed).toBe(1080);
    expect(raised.rawPoints).toBe(45);
  });

  it('keeps a projection conditional when its baseline is not fully verified', () => {
    // The Pokémon GO baselines come from rk9 rosters that publish no final
    // standings, so they count registrations. The projection is still useful,
    // but it must not pose as an observation.
    const plan = ev({ eventTypeId: 'regional', status: 'planned', placement: 9 });
    const r = of(path([plan], { game: 'GO' }), plan.id);
    expect(r.attendanceUsed).toBe(38);          // smallest 2026 GO Regional roster
    expect(r.conditional).toBe(true);
    expect(r.explanation).toMatch(/unverified baseline/);
  });

  it('still asks for an assumption when a category has no baseline at all', () => {
    // A null baseline must never be silently treated as a field size of zero.
    const emptied = {
      ...baselines,
      baselines: { ...baselines.baselines,
        GO: { ...baselines.baselines.GO,
          regional: { attendance: null, sourceEvent: null, verified: false } } },
    };
    const plan = ev({ eventTypeId: 'regional', status: 'planned', placement: 9 });
    const p = path([plan], { game: 'GO' });
    const r = evaluatePath(p, rules, emptied).results[0];
    expect(r.attendanceUsed).toBeNull();
    expect(r.reason).toBe('unverified-attendance');
    expect(r.rawPoints).toBe(0);
  });

  it('marks a planned local positive CP outcome as conditional on the kicker', () => {
    const plan = ev({ eventTypeId: 'league-cup', status: 'planned', placement: 13, awardedPoints: 20 });
    const r = of(path([plan]), plan.id);
    expect(r.conditional).toBe(true);
    expect(r.explanation).toMatch(/assuming the 48-player kicker is met/);
  });
});

describe('direct invitations', () => {
  // PRD fixture 5.
  it('flags a Regional win as a direct invite while still scoring its CP', () => {
    const win = ev({ eventTypeId: 'regional', placement: 1, name: 'Atlanta Regional' });
    const result = score(path([win]));
    expect(result.directInvites).toHaveLength(1);
    expect(result.currentPoints).toBe(350);
  });

  it('records a direct invite independently of whether the result improves the total', () => {
    const stronger = Array.from({ length: 5 }, () =>
      ev({ eventTypeId: 'international', placement: 1, attendance: 900 })); // 500 each
    const win = ev({ eventTypeId: 'regional', placement: 1 });              // 350 — excluded by BFL
    const result = score(path([...stronger, win]));
    const r = result.results.find((x) => x.event.id === win.id)!;
    expect(r.counted).toBe(false);
    expect(r.reason).toBe('excluded-by-bfl');
    expect(r.directInvite).toBe(true);
  });

  it('does not treat a planned finish as an earned invitation', () => {
    const plan = ev({ eventTypeId: 'regional', status: 'planned', placement: 1 });
    expect(score(path([plan])).directInvites).toHaveLength(0);
  });
});

describe('game separation', () => {
  it('refuses to score a VGC-only event inside a TCG path', () => {
    const e = ev({ eventTypeId: 'vgc-global-challenge', placement: 1 });
    const r = of(path([e], { game: 'TCG' }), e.id);
    expect(r.reason).toBe('invalid');
    expect(r.error).toMatch(/not a TCG event/);
  });

  it('scores the GO Battle League Leaderboard Challenge in its own bucket', () => {
    const e = ev({ eventTypeId: 'go-leaderboard-challenge', placement: 1 });
    const result = score(path([e], { game: 'GO' }));
    expect(result.currentPoints).toBe(75);
    expect(result.buckets.find((b) => b.bucket === 'onlineGo')!.slotsUsed).toBe(1);
  });
});

describe('planning target', () => {
  // PRD fixture 8.
  it('prefers the live boundary once it exceeds the previous cutoff', () => {
    expect(planningTarget(path([]), 842, 900)).toEqual({ target: 900, source: 'live' });
    expect(planningTarget(path([]), 842, 700)).toEqual({ target: 842, source: 'previous' });
  });

  it('honours an explicit override over both benchmarks', () => {
    expect(planningTarget(path([], { targetOverride: 500 }), 842, 900))
      .toEqual({ target: 500, source: 'override' });
  });

  it('falls back to whichever benchmark exists', () => {
    expect(planningTarget(path([]), 842, null)).toEqual({ target: 842, source: 'previous' });
    expect(planningTarget(path([]), null, null)).toEqual({ target: null, source: 'none' });
  });

  // PRD fixture 6.
  it('reports the gap to the 2026 VGC US-and-Canada benchmark of 842', () => {
    const events = [
      ev({ eventTypeId: 'international', placement: 1, attendance: 900 }), // 500
      ev({ eventTypeId: 'regional', placement: 1 }),                       // 350
      ev({ eventTypeId: 'league-cup', placement: 1 }),                     // 50
    ];
    const total = score(path(events)).currentPoints;
    expect(total).toBe(900);
    expect(gapTo(842, total)).toBe(0);
    expect(gapTo(842, 700)).toBe(142);
  });
});
