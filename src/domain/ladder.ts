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

/**
 * Bands this event type can actually pay at its projected field size.
 *
 * `event` narrows that to one row: a turnout the player has entered on an event
 * they have not played yet is a statement about that event, and it overrides the
 * season-wide figure for it alone. Two Regionals in the same plan can then be
 * projected differently, which is the point of the field being editable before
 * the event rather than only after it.
 */
export function payableBands(
  rule: EventTypeRule, rules: SeasonRules, path: QualificationPath, baselines: AttendanceBaselines,
  event?: PlannedEvent,
): { bands: PlacementBand[]; field: number | null; assumed: boolean } {
  const table = tableFor(rules, rule);

  if (event?.attendance != null) {
    return { bands: table.filter((b) => b.kicker <= event.attendance!), field: event.attendance, assumed: false };
  }
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

/**
 * The band a "no worse than Nth" demand resolves to for one event: the deepest
 * band it can actually be paid at that is no deeper than N.
 *
 * An event whose field is too small to pay at N stops at the deepest band its
 * own field does reach, rather than dropping out of the tier.
 */
const bandAtDepth = (bands: PlacementBand[], depth: number): PlacementBand | null => {
  let found: PlacementBand | null = null;
  for (const b of bands) if (b.maxPlace <= depth) found = b;
  return found ?? bands[0] ?? null;
};

/** The value occurring most often, ties going to the first seen. */
function modal<T>(values: T[], key: (v: T) => string): T | null {
  const counts = new Map<string, { n: number; v: T }>();
  for (const v of values) {
    const k = key(v);
    counts.set(k, { n: (counts.get(k)?.n ?? 0) + 1, v: counts.get(k)?.v ?? v });
  }
  let best: { n: number; v: T } | null = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  return best?.v ?? null;
}

/**
 * Solve the ladder. Events the player left blank are the unknowns; anything with
 * a placement already entered is a fixed constraint the solver works around.
 *
 * Demands are made per tier as a finishing bracket, and each event resolves that
 * bracket against its own field size. Two Regionals in one plan can therefore be
 * worth different CP for the same finish, if the player has said one of them is
 * bigger than the season-wide assumption.
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

  // What each individual event can be paid, at its own field size.
  const payableOf = new Map<string, ReturnType<typeof payableBands>>();
  const tierOf = new Map<string, number>();
  tiers.forEach((tier, ti) => {
    for (const g of tier) for (const e of g.events) {
      payableOf.set(e.id, payableBands(g.rule, rules, path, baselines, e));
      tierOf.set(e.id, ti);
    }
  });

  /** Resolve every unsolved event against a bracket per tier, and score it. */
  const bandsAt = (depths: number[]): Map<string, PlacementBand | null> => {
    const out = new Map<string, PlacementBand | null>();
    for (const [id, p] of payableOf) {
      out.set(id, bandAtDepth(p.bands, depths[tierOf.get(id)!]));
    }
    return out;
  };
  const totalAt = (depths: number[]): number => {
    const bands = bandsAt(depths);
    const events = path.events.map((e) =>
      (bands.has(e.id) ? { ...e, placement: bands.get(e.id)?.minPlace ?? null } : e));
    return evaluatePath({ ...path, events }, rules, baselines).projectedTotal;
  };

  // Start everything at its best finish, then relax a tier at a time. Order is
  // what makes this meaningful, and lockstep inside a tier is what keeps one
  // event type from spending the whole concession on its own behalf.
  const depths = tiers.map(() => 1);
  const maxAttainable = totalAt(depths);

  if (target != null) {
    tiers.forEach((tier, ti) => {
      // Every bracket any event in this tier can be asked for, shallowest first.
      const options = [...new Set(tier.flatMap((g) => g.events.flatMap((e) =>
        payableOf.get(e.id)!.bands.map((b) => b.maxPlace))))].sort((a, b) => a - b);
      let best = depths[ti];
      for (const depth of options) {
        const trial = [...depths];
        trial[ti] = depth;
        // A deeper bracket is an easier finish, so keep going while it holds.
        if (totalAt(trial) >= target) best = depth;
      }
      depths[ti] = best;
    });
  }

  const solvedBands = bandsAt(depths);
  const projectedTotal = totalAt(depths);
  const feasible = target != null && projectedTotal >= target;

  // How many of each type actually reach the total, once the Best Finish Limit
  // has taken its cut. Nine added Regionals sharing a bucket of five is five
  // contributions, not nine — saying "x9" asks for four finishes that cannot count.
  const solvedEvents = path.events.map((e) => {
    const band = solvedBands.get(e.id);
    return band ? { ...e, placement: band.minPlace } : e;
  });
  const counted = new Set(
    evaluatePath({ ...path, events: solvedEvents }, rules, baselines)
      .results.filter((r) => r.counted).map((r) => r.event.id),
  );

  const rows: LadderRow[] = groups.map((g) => {
    // Events of one type usually share a field, so the row speaks for the common
    // case and the individual rows carry any exception.
    const resolved = g.events.map((e) => solvedBands.get(e.id)).filter((b): b is PlacementBand => b != null);
    const band = modal(resolved, (b) => `${b.minPlace}`);
    const fields = g.events.map((e) => payableOf.get(e.id)!);
    const common = modal(fields, (p) => String(p.field));
    const counting = g.events.filter((e) => counted.has(e.id)).length;
    return {
      eventTypeId: g.rule.id,
      label: g.rule.label,
      count: g.events.length,
      counting,
      band,
      bandLabel: band ? bandLabel(band) : null,
      pointsEach: band?.points ?? 0,
      // Summed over the events that actually count, so a plan mixing field sizes
      // still adds up rather than multiplying one representative figure.
      pointsTotal: g.events
        .filter((e) => counted.has(e.id))
        .reduce((sum, e) => sum + (solvedBands.get(e.id)?.points ?? 0), 0),
      deepestPayable: common?.bands[common.bands.length - 1] ?? null,
      projectedField: common?.field ?? null,
      fieldAssumed: common?.assumed ?? true,
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
