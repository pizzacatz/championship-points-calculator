/**
 * The ladder: the lowest finishes that still reach the target.
 *
 * One question, one answer. Given the events the player has added, what is the
 * worst they can do at each and still hit their number? Demands are relaxed
 * lexicographically by event type, hardest events first, so the plan never opens
 * by asking for a top-32 at a 1,100-player International when winning two
 * 40-player Cups is the more realistic ask.
 */
import { evaluatePath, bandLabel, isResult, ruleFor, tableFor, projectedField } from './calculate';
import type {
  AttendanceBaselines, EventTypeRule, PlacementBand, PlannedEvent,
  QualificationPath, SeasonRules,
} from './types';

/**
 * Concessions are handed out a tier at a time, hardest tier first, and every
 * event type inside a tier is relaxed in lockstep — asked for the same finishing
 * bracket as its neighbours, never a deeper one.
 *
 * The first tier holds the Internationals, Regionals, Specials and the online
 * Challenges together, because a Global or Grand Challenge is taken to be as
 * hard as a Regional. Relaxing them one type at a time is what produced plans
 * asking for Top 512 at an International and Top 8 at a Global Challenge in the
 * same breath: whichever type came first drained the whole concession and left
 * the next one holding the target up.
 *
 * "The same finishing bracket" is the operational reading of equally hard, and
 * it is exact here: `major`, `international` and `onlineChallenge` share
 * identical bracket boundaries (1, 2, 4, 8 … 1024), so Top 64 means Top 64
 * everywhere in the tier. It is a placement measure, not a percentile one — if a
 * Global Challenge fields far more players than a Regional, this asks less of it
 * than parity would.
 */
const RELAX_TIERS = [
  ['international', 'regional', 'special', 'vgc-global-challenge', 'go-leaderboard-challenge'],
  ['league-cup'],
  ['league-challenge'],
];

export type LadderRow = {
  eventTypeId: string;
  label: string;
  /** Events of this type the ladder is solving for. */
  count: number;
  /** How many of them can actually contribute, after the Best Finish Limit. */
  counting: number;
  band: PlacementBand | null;
  bandLabel: string | null;
  pointsEach: number;
  /** counting x pointsEach — what this row is really worth. */
  pointsTotal: number;
  /** Deepest band this event type's projected field actually unlocks. */
  deepestPayable: PlacementBand | null;
  projectedField: number | null;
  /** True when the field size is assumed rather than observed. */
  fieldAssumed: boolean;
};

export type Ladder = {
  rows: LadderRow[];
  feasible: boolean;
  projectedTotal: number;
  target: number | null;
  shortfall: number | null;
  /** Best total reachable if every unsolved event is won outright. */
  maxAttainable: number;
  notes: string[];
};

/** Bands this event type can actually pay at its projected field size. */
export function payableBands(
  rule: EventTypeRule, rules: SeasonRules, path: QualificationPath, baselines: AttendanceBaselines,
): { bands: PlacementBand[]; field: number | null; assumed: boolean } {
  const table = tableFor(rules, rule);
  // An online Challenge uses a stated assumption where one has been chosen, and
  // otherwise meets every kicker: the GO Battle League leaderboard is ranked
  // globally, so there is no field size to hold it back.
  if (rule.scale === 'online') {
    const assumed = projectedField(baselines, path.game, rule, path);
    if (assumed == null) return { bands: table, field: null, assumed: true };
    return { bands: table.filter((b) => b.kicker <= assumed), field: assumed, assumed: true };
  }

  // Locals are unlisted, so both the ladder and scoring work from an assumed
  // turnout — the same figure, so what the ladder asks for is what a result of
  // that shape would actually score.
  if (rule.scale === 'local') {
    const assumed = projectedField(baselines, path.game, rule, path);
    if (assumed == null) return { bands: table, field: null, assumed: true };
    return { bands: table.filter((b) => b.kicker <= assumed), field: assumed, assumed: true };
  }

  const field = projectedField(baselines, path.game, rule, path);
  if (field == null) return { bands: table, field: null, assumed: true };
  return { bands: table.filter((b) => b.kicker <= field), field, assumed: false };
}

const applyBand = (events: PlannedEvent[], ids: Set<string>, band: PlacementBand | null): PlannedEvent[] =>
  events.map((e) => (ids.has(e.id)
    ? { ...e, placement: band ? band.minPlace : null }
    : e));

/**
 * The band a "no worse than Nth" demand resolves to for one event type: the
 * deepest band it can actually be paid at that is no deeper than N.
 *
 * A type whose field is too small to pay at N stops at the deepest band its
 * field does reach, rather than dropping out of the tier.
 */
const bandAtDepth = (bands: PlacementBand[], depth: number): PlacementBand | null => {
  let found: PlacementBand | null = null;
  for (const b of bands) if (b.maxPlace <= depth) found = b;
  return found ?? bands[0] ?? null;
};

/**
 * Solve the ladder. Events the player left blank are the unknowns; anything with
 * a placement already entered is a fixed constraint the solver works around.
 */
export function solveLadder(
  path: QualificationPath, rules: SeasonRules, baselines: AttendanceBaselines, target: number | null,
): Ladder {
  // Blank rows are the unknowns; anything carrying a placement is a fixed constraint.
  // An event whose date has passed with no result entered is neither: it cannot be
  // played any more, so solving for it would inflate the projection with points
  // that are no longer available.
  const today = new Date().toISOString().slice(0, 10);
  const unsolved = path.events.filter(
    (e) => !isResult(e) && !(e.date != null && e.date < today),
  );

  const tiers = RELAX_TIERS
    .map((ids) => ids
      .map((id) => ({ rule: ruleFor(rules, id), events: unsolved.filter((e) => e.eventTypeId === id) }))
      .filter((g): g is { rule: EventTypeRule; events: PlannedEvent[] } =>
        g.rule != null && g.events.length > 0))
    .filter((t) => t.length > 0);
  const groups = tiers.flat();

  const totalWith = (assign: Map<string, PlacementBand | null>): number => {
    let events = path.events;
    for (const g of groups) {
      const ids = new Set(g.events.map((e) => e.id));
      events = applyBand(events, ids, assign.get(g.rule.id) ?? null);
    }
    return evaluatePath({ ...path, events }, rules, baselines).projectedTotal;
  };

  const payable = new Map(groups.map((g) => [g.rule.id, payableBands(g.rule, rules, path, baselines)]));

  // Start everything at its best finish, then relax a tier at a time. Order is
  // what makes this meaningful, and lockstep inside a tier is what keeps one
  // event type from spending the whole concession on its own behalf.
  const assign = new Map<string, PlacementBand | null>();
  for (const g of groups) assign.set(g.rule.id, payable.get(g.rule.id)!.bands[0] ?? null);

  const maxAttainable = totalWith(assign);

  if (target != null) {
    for (const tier of tiers) {
      // Every bracket any member of this tier can be asked for, shallowest first.
      const depths = [...new Set(tier.flatMap((g) =>
        payable.get(g.rule.id)!.bands.map((b) => b.maxPlace)))].sort((a, b) => a - b);
      const best = new Map(tier.map((g) => [g.rule.id, assign.get(g.rule.id) ?? null]));
      for (const depth of depths) {
        const trial = new Map(assign);
        for (const g of tier) {
          trial.set(g.rule.id, bandAtDepth(payable.get(g.rule.id)!.bands, depth));
        }
        // A deeper bracket is an easier finish, so keep going while it still holds.
        if (totalWith(trial) >= target) {
          for (const g of tier) best.set(g.rule.id, trial.get(g.rule.id) ?? null);
        }
      }
      for (const [id, band] of best) assign.set(id, band);
    }
  }

  const projectedTotal = totalWith(assign);
  const feasible = target != null && projectedTotal >= target;

  // How many of each type actually reach the total, once the Best Finish Limit
  // has taken its cut. Nine added Regionals sharing a bucket of five is five
  // contributions, not nine — saying "x9" asks for four finishes that cannot count.
  const solvedEvents = path.events.map((e) => {
    const g = groups.find((x) => x.events.some((y) => y.id === e.id));
    const band = g ? assign.get(g.rule.id) ?? null : null;
    return band ? { ...e, placement: band.minPlace } : e;
  });
  const counted = new Set(
    evaluatePath({ ...path, events: solvedEvents }, rules, baselines)
      .results.filter((r) => r.counted).map((r) => r.event.id),
  );

  const rows: LadderRow[] = groups.map((g) => {
    const p = payable.get(g.rule.id)!;
    const band = assign.get(g.rule.id) ?? null;
    const counting = g.events.filter((e) => counted.has(e.id)).length;
    return {
      eventTypeId: g.rule.id,
      label: g.rule.label,
      count: g.events.length,
      counting,
      band,
      bandLabel: band ? bandLabel(band) : null,
      pointsEach: band?.points ?? 0,
      pointsTotal: counting * (band?.points ?? 0),
      deepestPayable: p.bands[p.bands.length - 1] ?? null,
      projectedField: p.field,
      fieldAssumed: p.assumed,
    };
  });

  const notes: string[] = [];
  // An empty plan is not a shortfall — the panel's own empty state already says
  // what to do, and a warning on top of it is just noise.
  if (target == null) notes.push('Set a target to see what you need.');
  else if (!feasible && path.events.length > 0) {
    notes.push(
      `Winning every event you have added reaches ${maxAttainable.toLocaleString()} CP, `
      + `${(target - maxAttainable).toLocaleString()} short of ${target.toLocaleString()}. `
      + 'Add more events, or lower the target.',
    );
  }

  return {
    rows, feasible, projectedTotal, target,
    shortfall: target == null ? null : Math.max(0, target - projectedTotal),
    maxAttainable, notes,
  };
}
