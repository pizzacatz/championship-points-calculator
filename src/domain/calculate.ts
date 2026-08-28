/**
 * Pure Championship Point engine. No browser, DOM, storage or network access —
 * everything it needs arrives as arguments so the whole thing is testable.
 */
import type {
  AttendanceBaselines, BucketSummary, Displacement, EvaluatedResult, Evaluation,
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

/** Every CP value is distinct within a table, so an award identifies its band. */
export const bandForPoints = (table: PlacementBand[], points: number): PlacementBand | null =>
  table.find((b) => b.points === points) ?? null;

/**
 * A result is anything with a number on it. A blank row is an event the player
 * intends to attend and has not played yet, which is what the ladder solves for.
 * Nothing needs to be toggled — the presence of a number says which it is.
 */
export const isResult = (e: PlannedEvent): boolean =>
  e.awardedPoints != null || (e.placement != null && e.placement >= 1);

const ordinal = (n: number): string => {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

/**
 * Resolve one result to the CP it is worth, independent of any Best Finish Limit.
 *
 * The rules here follow PRD §6: a completed local result is settled by its
 * awarded CP alone (a positive award is itself proof the kicker was met), and
 * attendance is only ever demanded when it is the sole way to resolve a
 * kicker-dependent band.
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

  // One number, either kind. CP identifies its band outright; a placement gives
  // the band directly. Whichever is supplied, the other is derived.
  let band: PlacementBand | null = null;
  if (event.placement != null && Number.isInteger(event.placement) && event.placement >= 1) {
    band = bandFor(table, event.placement);
  } else if (event.awardedPoints != null && event.awardedPoints > 0) {
    band = bandForPoints(table, event.awardedPoints);
    if (!band) {
      return {
        ...base, reason: 'invalid',
        explanation: `${event.awardedPoints} CP is not a ${rule.label} payout.`,
        error: `${rule.label} pays ${table.map((b) => b.points).join(', ')} or 0. `
             + `${event.awardedPoints} is not one of them.`,
      };
    }
  } else if (event.awardedPoints === 0) {
    return {
      ...base, reason: 'below-kicker', error: null,
      explanation: 'Awarded 0 CP — the kicker was not met, or the finish was outside the table.',
    };
  } else {
    return {
      ...base, reason: 'incomplete',
      explanation: 'Enter the CP you earned, or your finishing place.',
      error: null,
    };
  }

  const placed = event.placement != null ? `${ordinal(event.placement)} place` : `${band!.points} CP`;

  if (!band) {
    const last = table[table.length - 1];
    return {
      ...base, reason: 'below-kicker',
      explanation: `${placed} is outside the payout table, which stops at ${bandLabel(last)}. Worth 0 CP.`,
      error: null,
    };
  }

  const bandText = `${placed} → ${bandLabel(band)} band`;
  const directInvite = isResult(event) && band.maxPlace <= rule.directInvitePlacesThrough;

  // ---- Recorded results ----------------------------------------------------
  if (isResult(event)) {
    if (event.awardedPoints != null) {
      // Validate the award against the published table before trusting it.
      if (event.awardedPoints !== band.points && event.awardedPoints !== 0) {
        return {
          ...base, band, reason: 'invalid',
          explanation: `${bandText} pays ${band.points} CP, but ${event.awardedPoints} CP was entered.`,
          error: `A ${bandLabel(band)} finish pays ${band.points} CP (or 0 if the kicker was not met). ${event.awardedPoints} CP is not a possible award — correct the placement or the CP.`,
        };
      }
      if (event.awardedPoints === 0) {
        return {
          ...base, band, reason: 'below-kicker', directInvite,
          attendanceUsed: event.attendance, attendanceSource: event.attendance != null ? 'entered' : 'unknown',
          explanation: band.kicker > 0
            ? `${bandText}, awarded 0 CP — the ${band.kicker}-player kicker was not met.`
            : `${bandText}, awarded 0 CP.`,
          error: null,
        };
      }
      // A positive, valid award proves the kicker minimum was met. Nothing more.
      return {
        ...base, band, rawPoints: band.points, directInvite,
        attendanceUsed: band.kicker > 0 ? band.kicker : null,
        attendanceSource: band.kicker > 0 ? 'implied-by-award' : 'unknown',
        reason: 'counts',
        explanation: band.kicker > 0
          ? `${bandText}, worth ${band.points} CP. The award confirms at least ${band.kicker} players attended.`
          : `${bandText}, worth ${band.points} CP.`,
        error: null,
      };
    }

    // No awarded CP. Only kicker-dependent bands then need attendance.
    if (band.kicker === 0) {
      return {
        ...base, band, rawPoints: band.points, directInvite, reason: 'counts',
        explanation: `${bandText}, worth ${band.points} CP. This band has no kicker.`, error: null,
      };
    }
    // Online events publish no field size and assume every kicker is met, so a
    // placement at one always scores.
    if (rule.scale === 'online') {
      return {
        ...base, band, rawPoints: band.points, directInvite, reason: 'counts',
        explanation: `${bandText}, worth ${band.points} CP.`, error: null,
      };
    }

    // Otherwise fall back to the projected field for this event type — a zone
    // median for a major, an assumed turnout for a local.
    const known = event.attendance ?? projectedField(baselines, path.game, rule, path);
    if (known == null) {
      return {
        ...base, band, directInvite, reason: 'unverified-attendance',
        explanation: `${bandText} pays ${band.points} CP only if at least ${band.kicker} players entered. Enter the CP you were awarded.`,
        error: null,
      };
    }
    if (known < band.kicker) {
      return {
        ...base, band, directInvite,
        reason: 'below-kicker',
        attendanceUsed: known,
        attendanceSource: event.attendance != null ? 'entered' : 'baseline',
        explanation: `${bandText} needs ${band.kicker} players; ${known.toLocaleString()} ${event.attendance != null ? 'attended' : 'projected'}. Worth 0 CP.`,
        error: null,
      };
    }
    return {
      ...base, band, rawPoints: band.points, directInvite,
      attendanceUsed: known,
      attendanceSource: event.attendance != null ? 'entered' : 'baseline',
      reason: 'counts',
      explanation: `${bandText}, worth ${band.points} CP.`,
      error: null,
    };
  }

  // ---- Planned results -----------------------------------------------------
  // Planned majors fall back to the historical-low baseline plus the player's
  // adjustment; planned locals may instead assert a hypothetical CP outcome.
  const field = projectedField(baselines, path.game, rule, path);
  const projected = event.attendance ?? field;
  const attendanceSource = event.attendance != null ? 'entered' : field != null ? 'baseline' : 'unknown';

  if (band.kicker === 0) {
    return {
      ...base, band, rawPoints: band.points, reason: 'planned-counts',
      attendanceUsed: projected, attendanceSource,
      explanation: `Planned ${bandText}, worth ${band.points} CP. This band has no kicker.`, error: null,
    };
  }

  if (projected != null) {
    if (projected < band.kicker) {
      return {
        ...base, band, reason: 'below-kicker', attendanceUsed: projected, attendanceSource,
        explanation: attendanceSource === 'baseline'
          ? `Planned ${bandText} needs ${band.kicker} players; the projected field is ${projected}. Worth 0 CP at this projection.`
          : `Planned ${bandText} needs ${band.kicker} players; ${projected} assumed. Worth 0 CP.`,
        error: null,
      };
    }
    const unverified = attendanceSource === 'baseline';
    return {
      ...base, band, rawPoints: band.points, reason: 'planned-counts',
      conditional: Boolean(unverified), attendanceUsed: projected, attendanceSource,
      explanation: unverified
        ? `Planned ${bandText}, worth ${band.points} CP — assuming the ${band.kicker}-player kicker is met. The ${projected}-player projection is an unverified baseline.`
        : `Planned ${bandText}, worth ${band.points} CP with ${projected} players assumed (kicker ${band.kicker}).`,
      error: null,
    };
  }

  // A hypothetical positive CP outcome with no attendance: explicitly conditional.
  if (event.awardedPoints != null && event.awardedPoints > 0) {
    if (event.awardedPoints !== band.points) {
      return {
        ...base, band, reason: 'invalid',
        explanation: `${bandText} pays ${band.points} CP, but ${event.awardedPoints} CP was entered.`,
        error: `A ${bandLabel(band)} finish pays ${band.points} CP. Correct the placement or the hypothetical CP.`,
      };
    }
    return {
      ...base, band, rawPoints: band.points, reason: 'planned-counts', conditional: true,
      explanation: `Planned ${bandText}, worth ${band.points} CP — assuming the ${band.kicker}-player kicker is met.`,
      error: null,
    };
  }

  return {
    ...base, band, reason: 'unverified-attendance',
    explanation: `Planned ${bandText} pays ${band.points} CP only if at least ${band.kicker} players attend. Assume an attendance or a CP outcome.`,
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

  // Displacement: what each planned result actually adds once the BFL settles.
  const displacements: Displacement[] = [];
  const plannedIds = scored.filter((r) => r.rawPoints > 0);
  for (const r of plannedIds) {
    const without = scored.filter((x) => x.event.id !== r.event.id);
    const before = applyBfl(without, rules);
    const beforeTotal = sum(before.buckets);
    const afterTotal = sum(projected.buckets);
    const net = afterTotal - beforeTotal;
    const dropped = [...before.counted].find((id) => !projected.counted.has(id)) ?? null;
    const droppedResult = dropped ? scored.find((x) => x.event.id === dropped) ?? null : null;
    displacements.push({
      eventId: r.event.id,
      netPoints: net,
      displacedEventId: dropped,
      displacedPoints: droppedResult?.rawPoints ?? 0,
      message: droppedResult
        ? `This result adds ${net} net CP by replacing ${droppedResult.event.name || droppedResult.rule.label} worth ${droppedResult.rawPoints} CP.`
        : net > 0
          ? `This result adds ${net} CP and displaces nothing.`
          : `This result adds 0 net CP — it does not beat any counted ${r.rule.bflBucketLabel} result.`,
    });
  }

  return {
    results,
    currentTotal: sum(current.buckets),
    projectedTotal: sum(projected.buckets),
    buckets: projected.buckets,
    displacements,
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
