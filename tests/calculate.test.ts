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

  it('asks for the CP when a local has no field size to resolve its kicker', () => {
    // Cups and Challenges are unlisted, so nothing can settle a 9-16 finish
    // except the CP itself. The form never asks for attendance.
    const e = ev({ eventTypeId: 'league-cup', placement: 13 });
    const r = evaluateResult(e, rules, path([e]), baselines);
    expect(r.reason).toBe('unverified-attendance');
    expect(r.explanation).toMatch(/Enter the CP you were awarded/);
  });

  it('resolves a placement at a major from the projected field', () => {
    // A 9-16 Regional needs 33 players; the NA zone median is 705, so it pays.
    const e = ev({ eventTypeId: 'regional', placement: 9 });
    const r = evaluateResult(e, rules, path([e]), baselines);
    expect(r.rawPoints).toBe(200);
    expect(r.attendanceSource).toBe('baseline');
  });

  it('resolves a completed result from the CP alone', () => {
    // Every CP value is unique within a table, so the award identifies the band.
    const e = ev({ eventTypeId: 'league-cup', awardedPoints: 20 });
    const r = evaluateResult(e, rules, path([e]), baselines);
    expect(r.rawPoints).toBe(20);
    expect(r.band).toMatchObject({ minPlace: 9, maxPlace: 16 });
  });

  it('rejects a CP value that is not a payout for that event type', () => {
    const e = ev({ eventTypeId: 'league-cup', awardedPoints: 35 });
    const r = evaluateResult(e, rules, path([e]), baselines);
    expect(r.reason).toBe('invalid');
    expect(r.error).toMatch(/not one of them/);
  });

  it('detects a direct invitation from the CP alone', () => {
    const e = ev({ eventTypeId: 'regional', awardedPoints: 350 });
    expect(evaluateResult(e, rules, path([e]), baselines).directInvite).toBe(true);
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
    const before = score(path(four)).currentTotal;
    const weaker = challenge(17, 4);
    const after = score(path([...four, weaker]));
    expect(before).toBe(54);
    expect(after.currentTotal).toBe(54);
    expect(after.results.find((r) => r.event.id === weaker.id)!.reason).toBe('excluded-by-bfl');
  });

  // PRD fixture 2.
  it('adds new CP minus displaced CP when a fifth League Challenge is stronger', () => {
    const four = [challenge(1, 15), challenge(2, 12), challenge(2, 12), challenge(17, 4)];
    const before = score(path(four)).currentTotal; // 15+12+12+4 = 43
    const stronger = challenge(1, 15);
    const after = score(path([...four, stronger])).currentTotal; // drops the 4
    expect(before).toBe(43);
    expect(after).toBe(before + 15 - 4);
  });

  it('keeps League Challenge and League Cup limits independent', () => {
    const challenges = Array.from({ length: 5 }, () => challenge(1, 15));
    const cups = Array.from({ length: 5 }, () => ev({ eventTypeId: 'league-cup', placement: 1, awardedPoints: 50 }));
    const result = score(path([...challenges, ...cups]));
    expect(result.currentTotal).toBe(4 * 15 + 4 * 50);
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
    expect(result.currentTotal).toBe(420 + 350 + 325 + 280 + 200);
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
    const baseTotal = score(path(five)).currentTotal;
    const sixthWeak = ev({ eventTypeId: 'regional', placement: 33, attendance: 400 }); // 120
    expect(score(path([...five, sixthWeak])).currentTotal).toBe(baseTotal);
    const sixthStrong = ev({ eventTypeId: 'regional', placement: 9, attendance: 400 }); // 200
    expect(score(path([...five, sixthStrong])).currentTotal).toBe(baseTotal - 160 + 200);
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

describe('results versus blanks', () => {
  it('treats a row with a number as a result and a blank row as intent', () => {
    const done = ev({ eventTypeId: 'regional', awardedPoints: 350 });
    const blank = ev({ eventTypeId: 'regional' });
    const result = score(path([done, blank]));
    // No status to toggle: the presence of a number is what distinguishes them.
    expect(result.currentTotal).toBe(350);
    expect(result.results[1].reason).toBe('incomplete');
    expect(result.results[1].rawPoints).toBe(0);
  });

  it('explains what a new result displaces once a bucket is full', () => {
    const five = [
      ev({ eventTypeId: 'regional', awardedPoints: 325 }),
      ev({ eventTypeId: 'regional', awardedPoints: 300 }),
      ev({ eventTypeId: 'regional', awardedPoints: 280 }),
      ev({ eventTypeId: 'regional', awardedPoints: 200 }),
      ev({ eventTypeId: 'regional', awardedPoints: 160 }),
    ];
    const sixth = ev({ eventTypeId: 'regional', awardedPoints: 350, name: 'Atlanta Regional' });
    const result = score(path([...five, sixth]));
    const d = result.displacements.find((x) => x.eventId === sixth.id)!;
    expect(d.netPoints).toBe(350 - 160);
    expect(d.message).toMatch(/adds 190 net CP by replacing/);
  });
});

describe('direct invitations', () => {
  // PRD fixture 5.
  it('flags a Regional win as a direct invite while still scoring its CP', () => {
    const win = ev({ eventTypeId: 'regional', placement: 1, name: 'Atlanta Regional' });
    const result = score(path([win]));
    expect(result.directInvites).toHaveLength(1);
    expect(result.currentTotal).toBe(350);
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

  it('does not treat a blank event as an earned invitation', () => {
    const blank = ev({ eventTypeId: 'regional' });
    expect(score(path([blank])).directInvites).toHaveLength(0);
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
    expect(result.currentTotal).toBe(75);
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
    const total = score(path(events)).currentTotal;
    expect(total).toBe(900);
    expect(gapTo(842, total)).toBe(0);
    expect(gapTo(842, 700)).toBe(142);
  });
});

describe('the ladder assumption never scores a real result', () => {
  it('asks for the CP rather than guessing a local field size', () => {
    // The ladder assumes a Cup holds 17 players so it will not demand a top 16.
    // Applying that to a placement the player entered would score a genuine
    // 20 CP finish at a 60-player Cup as 0.
    const e = ev({ eventTypeId: 'league-cup', placement: 13 });
    const r = evaluateResult(e, rules, path([e]), baselines);
    expect(r.rawPoints).toBe(0);
    expect(r.reason).toBe('unverified-attendance');
    expect(r.explanation).toMatch(/Enter the CP you were awarded/);
  });

  it('scores that same result correctly once the CP is given', () => {
    const e = ev({ eventTypeId: 'league-cup', awardedPoints: 20 });
    expect(evaluateResult(e, rules, path([e]), baselines).rawPoints).toBe(20);
  });
});
