/**
 * Pure Championship Point engine. No browser, DOM, storage or network access —
 * everything it needs arrives as arguments so the whole thing is testable.
 */
import type {
  AttendanceBaselines, BucketSummary, EvaluatedResult, Evaluation,
  EventTypeRule, Game, PlacementBand, PlannedEvent, QualificationPath, SeasonRules,
} from './types';

export const bandFor = (table: PlacementBand[], placement: number): PlacementBand | null =>
  table.find((b) => placement >= b.minPlace && placement <= b.maxPlace) ?? null;

export const bandLabel = (b: PlacementBand): string =>
  b.minPlace === b.maxPlace ? `${b.minPlace}` : `${b.minPlace}–${b.maxPlace}`;

export const ruleFor = (rules: SeasonRules, id: string): EventTypeRule | null =>
  rules.eventTypes.find((t) => t.id === id) ?? null;

export const eventTypesForGame = (rules: SeasonRules, game: Game): EventTypeRule[] =>
  rules.eventTypes.filter((t) => t.games.includes(game));

export const tableFor = (rules: SeasonRules, rule: EventTypeRule): PlacementBand[] =>
  rules.placementTables[rule.table] ?? [];

/**
 * Projected field size for a planned major, used only to decide which payout
 * bands its kicker unlocks.
 *
 * Regionals and Specials share their rating zone's median; each International
 * carries the median of its own last three seasons. Online events have no
 * baseline at all and assume every kicker is met.
 */
export function projectedField(
  baselines: AttendanceBaselines, game: Game, rule: EventTypeRule, path: QualificationPath,
): number | null {
  // Cups and Challenges are unlisted, so a turnout is assumed rather than looked
  // up. Assuming one lets a placement be scored instead of the app refusing to
  // and asking for the CP — which the player can still supply as evidence.
  if (rule.scale === 'local') {
    return baselines.assumedLocalField?.[rule.id]?.attendance ?? null;
  }
  if (rule.scale !== 'major') return null;
  const forGame = baselines.baselines[game];
  if (!forGame || forGame.unavailable) return null;

  if (rule.id === 'international') {
    // An International is projected from itself, not from a zone. Prefer the one
    // hosted in the player's own zone; otherwise take the largest, which is the
    // conservative choice for kickers.
    const all = Object.values(forGame.internationals ?? {});
    if (!all.length) return null;
    const home = all.find((ic) => ic.zone === path.ratingZone);
    return (home ?? all.reduce((x, y) => (y.attendance > x.attendance ? y : x))).attendance;
  }
  return forGame.zones?.[path.ratingZone]?.attendance ?? null;
}

/**
 * Every CP value is distinct within a table, so an award identifies its band.
 * Nothing scores from CP any more — this survives only so the storage migration
 * can turn a saved award back into the placement and turnout that produced it.
 */
export const bandForPoints = (table: PlacementBand[], points: number): PlacementBand | null =>
  table.find((b) => b.points === points) ?? null;

/**
 * A result is a placement. A blank row is an event the player intends to attend
 * and has not played yet, which is what the ladder solves for. Nothing needs to
 * be toggled — the presence of a placement says which it is.
 */
export const isResult = (e: PlannedEvent): boolean =>
  e.placement != null && Number.isInteger(e.placement) && e.placement >= 1;

const ordinal = (n: number): string => {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

/**
 * The turnout a row scores against when the player has not overridden it.
 *
 * This is what the Players field shows before it is touched, and what the engine
 * falls back to. Online events return null because no field size exists for
 * them: every kicker is assumed met.
 */
export function defaultAttendance(
  baselines: AttendanceBaselines, game: Game, rule: EventTypeRule, path: QualificationPath,
): number | null {
  return projectedField(baselines, game, rule, path);
}

/**
 * Resolve one result to the CP it is worth, independent of any Best Finish Limit.
 *
 * Two inputs, both required on a played row: where you finished and how many
 * people were there. That makes this a lookup rather than a judgment — there is
 * no case here that decides whether an assumption is safe enough to use, because
 * the turnout is always a value the player can see and correct.
 */
export function evaluateResult(
  event: PlannedEvent, rules: SeasonRules, path: QualificationPath, baselines: AttendanceBaselines,
): EvaluatedResult {
  const rule = ruleFor(rules, event.eventTypeId);
  const base = {
    event, rule: rule as EventTypeRule, band: null as PlacementBand | null, rawPoints: 0,
    counted: false, directInvite: false, conditional: false,
    attendanceUsed: null as number | null, attendanceSource: 'unknown' as const,
  };

  if (!rule) {
    return { ...base, reason: 'invalid', explanation: 'Unknown event type.', error: 'Unknown event type.' };
  }
  if (!rule.games.includes(path.game)) {
    return {
      ...base, reason: 'invalid',
      explanation: `${rule.label} does not award ${path.game} Championship Points.`,
      error: `${rule.label} is not a ${path.game} event.`,
    };
  }
  const table = tableFor(rules, rule);

  if (event.placement != null && !(Number.isInteger(event.placement) && event.placement >= 1)) {
    return {
      ...base, reason: 'invalid',
      explanation: 'A placement has to be a whole number, 1 or more.',
      error: 'A placement has to be a whole number, 1 or more.',
    };
  }

  if (event.placement == null) {
    return {
      ...base, reason: 'incomplete',
      explanation: 'Enter where you finished.',
      error: null,
    };
  }

  const band = bandFor(table, event.placement);
  const placed = `${ordinal(event.placement)} place`;

  if (!band) {
    const last = table[table.length - 1];
    return {
      ...base, reason: 'below-kicker',
      explanation: `${placed} is outside the payout table, which stops at ${bandLabel(last)}. Worth 0 CP.`,
      error: null,
    };
  }

  const bandText = `${placed} → ${bandLabel(band)} band`;
  const directInvite = band.maxPlace <= rule.directInvitePlacesThrough;

  // Online events publish no field size at all — Pokémon Champions has 10M+
  // downloads and the GO Battle League leaderboard is ranked globally — so every
  // kicker is taken as met and no turnout is asked for.
  if (rule.scale === 'online' || band.kicker === 0) {
    return {
      ...base, band, rawPoints: band.points, directInvite, reason: 'counts',
      explanation: band.kicker === 0
        ? `${bandText}, worth ${band.points} CP. This band has no kicker.`
        : `${bandText}, worth ${band.points} CP.`,
      error: null,
    };
  }

  const fallback = defaultAttendance(baselines, path.game, rule, path);
  const turnout = event.attendance ?? fallback;
  const source = event.attendance != null ? 'entered' as const : 'baseline' as const;

  if (turnout == null) {
    // No assumption exists for this event type and none was entered. Rather than
    // invent one, say so — this is the only unscoreable shape left.
    return {
      ...base, band, directInvite, reason: 'unverified-attendance',
      explanation: `${bandText} pays ${band.points} CP only if at least ${band.kicker} players entered. Enter the turnout.`,
      error: null,
    };
  }

  // A turnout below the placement is a contradiction, and it needs no error of
  // its own: a band's kicker is always larger than its own last place, so a
  // turnout too small to hold the placement is necessarily too small to pay it.
  // The row already scores it 0 for the right reason. Complaining as well only
  // ever fired at someone half-way through retyping a number.

  if (turnout < band.kicker) {
    return {
      ...base, band, directInvite, reason: 'below-kicker',
      attendanceUsed: turnout, attendanceSource: source,
      explanation: `${bandText} needs ${band.kicker} players; ${turnout.toLocaleString()} `
        + `${source === 'entered' ? 'attended' : 'assumed'}. Worth 0 CP.`,
      error: null,
    };
  }

  return {
    ...base, band, rawPoints: band.points, directInvite, reason: 'counts',
    attendanceUsed: turnout, attendanceSource: source,
    explanation: `${bandText}, worth ${band.points} CP `
      + `with ${turnout.toLocaleString()} players ${source === 'entered' ? 'entered' : 'assumed'} (kicker ${band.kicker}).`,
    error: null,
  };
}

/**
 * Apply each Best Finish Limit to a set of already-scored results.
 * Sorted by raw CP descending, ties broken by input order so the outcome is
 * never nondeterministic.
 */
function applyBfl(
  results: EvaluatedResult[], rules: SeasonRules,
): { counted: Set<string>; buckets: BucketSummary[] } {
  const groups = new Map<string, EvaluatedResult[]>();
  for (const r of results) {
    if (!r.rule || r.rawPoints <= 0) continue;
    const list = groups.get(r.rule.bflBucket) ?? [];
    list.push(r);
    groups.set(r.rule.bflBucket, list);
  }

  const order = new Map(results.map((r, i) => [r.event.id, i]));
  const counted = new Set<string>();
  const buckets: BucketSummary[] = [];

  const bucketOrder = [...new Set(rules.eventTypes.map((t) => t.bflBucket))];
  for (const bucket of bucketOrder) {
    const rule = rules.eventTypes.find((t) => t.bflBucket === bucket)!;
    const list = (groups.get(bucket) ?? []).slice().sort((a, b) =>
      b.rawPoints - a.rawPoints || order.get(a.event.id)! - order.get(b.event.id)!);
    const limit = rule.bestFinishLimit;
    const keep = limit == null ? list : list.slice(0, limit);
    for (const r of keep) counted.add(r.event.id);

    if (!groups.has(bucket) && list.length === 0) {
      buckets.push({
        bucket, label: rule.bflBucketLabel, bestFinishLimit: limit,
        slotsUsed: 0, countedPoints: 0, weakestCountedPoints: null,
        pointsToImprove: limit == null ? 1 : 1,
      });
      continue;
    }
    const weakest = keep.length ? keep[keep.length - 1].rawPoints : null;
    const full = limit != null && keep.length >= limit;
    buckets.push({
      bucket, label: rule.bflBucketLabel, bestFinishLimit: limit,
      slotsUsed: keep.length,
      countedPoints: keep.reduce((s, r) => s + r.rawPoints, 0),
      weakestCountedPoints: weakest,
      pointsToImprove: full && weakest != null ? weakest + 1 : 1,
    });
  }
  return { counted, buckets };
}

/** Score a whole path: current CP, projected CP, BFL occupancy and displacement. */
export function evaluatePath(
  path: QualificationPath, rules: SeasonRules, baselines: AttendanceBaselines,
): Evaluation {
  const scored = path.events.map((e) => evaluateResult(e, rules, path, baselines));

  // Current CP uses completed results only; projected uses everything.
  const completed = scored.filter((r) => isResult(r.event));
  const current = applyBfl(completed, rules);
  const projected = applyBfl(scored, rules);

  const results = scored.map((r): EvaluatedResult => {
    const isCounted = projected.counted.has(r.event.id);
    if (r.rawPoints <= 0 || r.reason === 'invalid' || r.reason === 'incomplete') return r;
    if (isCounted) {
      return { ...r, counted: true, reason: isResult(r.event) ? 'counts' : 'planned-counts' };
    }
    return {
      ...r, counted: false, reason: 'excluded-by-bfl',
      explanation: `${r.explanation} Earned, but outside the ${r.rule.bflBucketLabel} Best Finish Limit of ${r.rule.bestFinishLimit}.`,
    };
  });

  const sum = (b: BucketSummary[]) => b.reduce((s, x) => s + x.countedPoints, 0);

  return {
    results,
    currentTotal: sum(current.buckets),
    projectedTotal: sum(projected.buckets),
    buckets: projected.buckets,
    directInvites: results.filter((r) => r.directInvite),
    errors: results.filter((r) => r.error).map((r) => ({ eventId: r.event.id, message: r.error! })),
  };
}

/** The planning target: the greater of the two benchmarks, unless overridden. */
export function planningTarget(
  path: QualificationPath, previousCutoff: number | null, liveBoundary: number | null,
): { target: number | null; source: 'override' | 'live' | 'previous' | 'none' } {
  if (path.targetOverride != null) return { target: path.targetOverride, source: 'override' };
  if (previousCutoff == null && liveBoundary == null) return { target: null, source: 'none' };
  if (liveBoundary == null) return { target: previousCutoff, source: 'previous' };
  if (previousCutoff == null) return { target: liveBoundary, source: 'live' };
  return liveBoundary >= previousCutoff
    ? { target: liveBoundary, source: 'live' }
    : { target: previousCutoff, source: 'previous' };
}

export const gapTo = (target: number | null, total: number): number | null =>
  target == null ? null : Math.max(0, target - total);
