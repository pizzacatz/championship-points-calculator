/**
 * Deterministic path generation (PRD FR-4).
 *
 * Only events the player explicitly added are ever used, and each event is only
 * ever assigned a finish at least as good as the constraint the player set for
 * it. Direct-invite finishes are excluded from ordinary paths and surfaced
 * separately only when no CP path can reach the target.
 */
import { bandLabel, baselineAttendance, evaluatePath, ruleFor, tableFor } from './calculate';
import type {
  AttendanceBaselines, EventTypeRule, PlacementBand, PlannedEvent,
  QualificationPath, SeasonRules,
} from './types';

export type Assignment = {
  eventId: string;
  eventName: string;
  eventTypeLabel: string;
  committed: boolean;
  /** The finish the player would need. `null` means "do not attend". */
  placement: number | null;
  bandLabel: string | null;
  points: number;
};

export type GeneratedPath = {
  strategy: 'least-demanding' | 'fewest-events' | 'best-use-of-committed';
  label: string;
  description: string;
  feasible: boolean;
  /** Total CP the path reaches, including results already completed. */
  total: number;
  /** Events the player would attend, best finish first. */
  assignments: Assignment[];
  eventCount: number;
  /** Set when no combination of added events reaches the target. */
  shortfall: number | null;
  maxAttainable: number;
  notes: string[];
};

/** One option for one planned event: place at `placement` and earn `points`. */
type Option = { placement: number | null; band: PlacementBand | null; points: number; difficulty: number };

/**
 * The bands a planned event may be assigned, hardest-to-reach first.
 * `difficulty` is the band's index in the published table — 0 is winning the
 * event — so "least demanding" can compare finishes across event types.
 */
function optionsFor(
  event: PlannedEvent, rule: EventTypeRule, rules: SeasonRules,
  path: QualificationPath, baselines: AttendanceBaselines,
): Option[] {
  const table = tableFor(rules, rule);
  const baseline = baselineAttendance(baselines, path.game, rule);
  const attendance = event.attendance ?? (
    baseline ? Math.max(0, baseline.attendance + path.attendanceAdjustment) : null
  );

  // The player caps how good a finish the generator may assume.
  const bestAllowed = event.bestFinishConstraint ?? 1;
  // Direct-invite finishes never appear in ordinary generated paths.
  const floor = Math.max(bestAllowed, rule.directInvitePlacesThrough + 1);

  const options: Option[] = [{ placement: null, band: null, points: 0, difficulty: table.length }];
  table.forEach((band, index) => {
    if (band.maxPlace < floor) return;                 // entirely inside the direct-invite/constraint zone
    if (attendance != null && band.kicker > attendance) return;  // unreachable at the assumed field size
    const placement = Math.max(band.minPlace, floor);
    if (placement > band.maxPlace) return;
    options.push({ placement, band, points: band.points, difficulty: index });
  });
  return options;
}

type Candidate = {
  /** points per planned event id */
  picks: Map<string, Option>;
  total: number;
  eventCount: number;
  /** difficulty of the single hardest finish required */
  hardest: number;
  /** how many finishes sit at that difficulty */
  hardestCount: number;
  /** sum of band difficulty across all used events — lower is harder */
  difficultySum: number;
  committedUsed: number;
  optionalUsed: number;
};

/** Score a set of picks by re-running the real engine, so BFLs are respected. */
function score(
  picks: Map<string, Option>, path: QualificationPath, rules: SeasonRules, baselines: AttendanceBaselines,
): number {
  const events: PlannedEvent[] = path.events.map((e) => {
    if (e.status !== 'planned') return e;
    const pick = picks.get(e.id);
    if (!pick || pick.placement == null) return { ...e, placement: null, awardedPoints: null };
    return { ...e, placement: pick.placement, awardedPoints: null };
  });
  return evaluatePath({ ...path, events }, rules, baselines).projectedPoints;
}

const summarise = (picks: Map<string, Option>, total: number, path: QualificationPath): Candidate => {
  const used = [...picks.entries()].filter(([, o]) => o.placement != null);
  const difficulties = used.map(([, o]) => o.difficulty);
  const hardest = difficulties.length ? Math.min(...difficulties) : Number.POSITIVE_INFINITY;
  const committed = new Map(path.events.map((e) => [e.id, e.committed]));
  return {
    picks, total, eventCount: used.length, hardest,
    hardestCount: difficulties.filter((d) => d === hardest).length,
    difficultySum: difficulties.reduce((s, d) => s + d, 0),
    committedUsed: used.filter(([id]) => committed.get(id)).length,
    optionalUsed: used.filter(([id]) => !committed.get(id)).length,
  };
};

/** Lexicographic comparators, one per strategy. Lower is better. */
const COMPARATORS = {
  'least-demanding': (a: Candidate, b: Candidate) =>
    // Minimise the strongest required finish, then how many finishes at that
    // difficulty, then total difficulty, then event count.
    b.hardest - a.hardest || a.hardestCount - b.hardestCount ||
    b.difficultySum - a.difficultySum || a.eventCount - b.eventCount,
  'fewest-events': (a: Candidate, b: Candidate) =>
    a.eventCount - b.eventCount || b.hardest - a.hardest ||
    a.hardestCount - b.hardestCount || b.difficultySum - a.difficultySum,
  'best-use-of-committed': (a: Candidate, b: Candidate) =>
    b.committedUsed - a.committedUsed || a.optionalUsed - b.optionalUsed ||
    b.hardest - a.hardest || a.hardestCount - b.hardestCount || b.difficultySum - a.difficultySum,
} as const;

const STRATEGY_META = {
  'least-demanding': {
    label: 'Least demanding placements',
    description: 'Minimises the strongest finish you would need, then how many finishes at that level.',
  },
  'fewest-events': {
    label: 'Fewest events',
    description: 'Reaches the target from as few events as possible, breaking ties on placement difficulty.',
  },
  'best-use-of-committed': {
    label: 'Best use of committed events',
    description: 'Leans on events you marked committed and adds as few optional events as it can.',
  },
} as const;

const MAX_COMBINATIONS = 200_000;

export function generatePaths(
  path: QualificationPath, rules: SeasonRules, baselines: AttendanceBaselines, target: number | null,
): GeneratedPath[] {
  const planned = path.events.filter((e) => e.status === 'planned');
  const optionSets = planned.map((e) => {
    const rule = ruleFor(rules, e.eventTypeId);
    return {
      event: e,
      rule,
      options: rule ? optionsFor(e, rule, rules, path, baselines) : [{ placement: null, band: null, points: 0, difficulty: 0 }],
    };
  }).filter((s) => s.rule != null);

  const strategies = Object.keys(COMPARATORS) as (keyof typeof COMPARATORS)[];

  // Ceiling on the search: the product of the per-event option counts.
  const combinations = optionSets.reduce((n, s) => n * s.options.length, 1);
  const truncated = combinations > MAX_COMBINATIONS;

  const best = new Map<string, Candidate>();
  let maxAttainable = score(new Map(), path, rules, baselines);
  let bestByTotal: Candidate | null = null;

  const picks = new Map<string, Option>();
  let visited = 0;

  const walk = (i: number) => {
    if (visited > MAX_COMBINATIONS) return;
    if (i === optionSets.length) {
      visited += 1;
      const total = score(picks, path, rules, baselines);
      if (total > maxAttainable) maxAttainable = total;
      const cand = summarise(new Map(picks), total, path);
      if (!bestByTotal || total > bestByTotal.total ||
          (total === bestByTotal.total && COMPARATORS['least-demanding'](cand, bestByTotal) < 0)) {
        bestByTotal = cand;
      }
      if (target == null || total < target) return;
      for (const s of strategies) {
        const cur = best.get(s);
        if (!cur || COMPARATORS[s](cand, cur) < 0) best.set(s, cand);
      }
      return;
    }
    const set = optionSets[i];
    for (const opt of set.options) {
      picks.set(set.event.id, opt);
      walk(i + 1);
    }
    picks.delete(set.event.id);
  };
  walk(0);

  const nameOf = (e: PlannedEvent, rule: EventTypeRule) => e.name?.trim() || rule.label;

  const toAssignments = (cand: Candidate): Assignment[] =>
    optionSets
      .map(({ event, rule }) => ({ event, rule: rule!, opt: cand.picks.get(event.id) }))
      .filter((x) => x.opt?.placement != null)
      .sort((a, b) => b.opt!.points - a.opt!.points)
      .map(({ event, rule, opt }) => ({
        eventId: event.id,
        eventName: nameOf(event, rule),
        eventTypeLabel: rule.label,
        committed: event.committed,
        placement: opt!.placement,
        bandLabel: opt!.band ? bandLabel(opt!.band) : null,
        points: opt!.points,
      }));

  const directInviteRoute = (): string[] => {
    // Only when no CP path exists: is a direct-invite finish the sole remaining route?
    const notes: string[] = [];
    const inviteEvents = optionSets.filter(({ rule }) => rule!.directInvitePlacesThrough > 0);
    if (inviteEvents.length === 0) return notes;
    const labels = inviteEvents.map(({ event, rule }) =>
      `${nameOf(event, rule!)} (top ${rule!.directInvitePlacesThrough})`);
    notes.push(
      `No combination of the events you added reaches the target on Championship Points alone. ` +
      `Among these events the only remaining mathematical route to Worlds is a direct-invitation finish: ${labels.join(', ')}. ` +
      `That is a qualifying finish, not a points path — it is excluded from the paths above by design.`,
    );
    return notes;
  };

  return strategies.map((strategy): GeneratedPath => {
    const meta = STRATEGY_META[strategy];
    const cand = best.get(strategy);
    const notes: string[] = [];
    if (truncated) {
      notes.push(
        `This plan has more finish combinations (${combinations.toLocaleString()}) than the generator explores ` +
        `(${MAX_COMBINATIONS.toLocaleString()}). The result below is the best found within that limit, not a proven optimum.`,
      );
    }
    if (target == null) notes.push('Set a planning target to generate paths.');

    if (!cand) {
      const fallback = bestByTotal as Candidate | null;
      return {
        strategy, label: meta.label, description: meta.description,
        feasible: false,
        total: fallback?.total ?? maxAttainable,
        assignments: fallback ? toAssignments(fallback) : [],
        eventCount: fallback?.eventCount ?? 0,
        shortfall: target == null ? null : Math.max(0, target - maxAttainable),
        maxAttainable,
        notes: [...notes, ...(target != null ? directInviteRoute() : [])],
      };
    }
    return {
      strategy, label: meta.label, description: meta.description,
      feasible: true, total: cand.total, assignments: toAssignments(cand),
      eventCount: cand.eventCount, shortfall: null, maxAttainable, notes,
    };
  });
}
