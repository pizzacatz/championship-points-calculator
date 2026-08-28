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

/** Relax the hardest events first; whatever is last absorbs the residual demand. */
const RELAX_ORDER = [
  'international',
  'regional', 'special',
  'vgc-global-challenge', 'go-leaderboard-challenge',
  'league-cup',
  'league-challenge',
];

export type LadderRow = {
  eventTypeId: string;
  label: string;
  count: number;
  band: PlacementBand | null;
  bandLabel: string | null;
  pointsEach: number;
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
  // Online events publish no field size and are not regional. Every kicker is
  // assumed met: Pokémon Champions has 10M+ downloads and the GO Battle League
  // leaderboard is ranked globally.
  if (rule.scale === 'online') return { bands: table, field: null, assumed: true };

  const field = projectedField(baselines, path.game, rule, path);
  if (field == null) return { bands: table, field: null, assumed: true };
  return { bands: table.filter((b) => b.kicker <= field), field, assumed: false };
}

const applyBand = (events: PlannedEvent[], ids: Set<string>, band: PlacementBand | null): PlannedEvent[] =>
  events.map((e) => (ids.has(e.id)
    ? { ...e, placement: band ? band.minPlace : null, awardedPoints: band ? band.points : null }
    : e));

/**
 * Solve the ladder. Events the player left blank are the unknowns; anything with
 * a CP or placement already entered is a fixed constraint the solver works around.
 */
export function solveLadder(
  path: QualificationPath, rules: SeasonRules, baselines: AttendanceBaselines, target: number | null,
): Ladder {
  // Blank rows are the unknowns; anything carrying a number is a fixed constraint.
  const unsolved = path.events.filter((e) => !isResult(e));

  const groups = RELAX_ORDER
    .map((id) => ({ rule: ruleFor(rules, id), events: unsolved.filter((e) => e.eventTypeId === id) }))
    .filter((g): g is { rule: EventTypeRule; events: PlannedEvent[] } =>
      g.rule != null && g.events.length > 0);

  const totalWith = (assign: Map<string, PlacementBand | null>): number => {
    let events = path.events;
    for (const g of groups) {
      const ids = new Set(g.events.map((e) => e.id));
      events = applyBand(events, ids, assign.get(g.rule.id) ?? null);
    }
    return evaluatePath({ ...path, events }, rules, baselines).projectedTotal;
  };

  const payable = new Map(groups.map((g) => [g.rule.id, payableBands(g.rule, rules, path, baselines)]));

  // Start everything at its best finish, then relax each type as far as it will
  // go while the target still holds. Order is what makes this meaningful.
  const assign = new Map<string, PlacementBand | null>();
  for (const g of groups) assign.set(g.rule.id, payable.get(g.rule.id)!.bands[0] ?? null);

  const maxAttainable = totalWith(assign);

  if (target != null) {
    for (const g of groups) {
      const bands = payable.get(g.rule.id)!.bands;
      let best = assign.get(g.rule.id) ?? null;
      for (const band of bands) {
        const trial = new Map(assign);
        trial.set(g.rule.id, band);
        if (totalWith(trial) >= target) best = band;   // deeper band = easier finish
      }
      assign.set(g.rule.id, best);
    }
  }

  const projectedTotal = totalWith(assign);
  const feasible = target != null && projectedTotal >= target;

  const rows: LadderRow[] = groups.map((g) => {
    const p = payable.get(g.rule.id)!;
    const band = assign.get(g.rule.id) ?? null;
    return {
      eventTypeId: g.rule.id,
      label: g.rule.label,
      count: g.events.length,
      band,
      bandLabel: band ? bandLabel(band) : null,
      pointsEach: band?.points ?? 0,
      deepestPayable: p.bands[p.bands.length - 1] ?? null,
      projectedField: p.field,
      fieldAssumed: p.assumed,
    };
  });

  const notes: string[] = [];
  if (target == null) notes.push('Set a target to see what you need.');
  else if (!feasible) {
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
