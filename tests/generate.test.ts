import { describe, expect, it } from 'vitest';
import { generatePaths } from '../src/domain/generate';
import { baselines, ev, path, rules } from './helpers';

const gen = (p: ReturnType<typeof path>, target: number | null) =>
  generatePaths(p, rules, baselines, target);
const byStrategy = (p: ReturnType<typeof path>, target: number | null) =>
  Object.fromEntries(gen(p, target).map((g) => [g.strategy, g]));

const planned = (typeId: string, extra: Record<string, unknown> = {}) =>
  ev({ eventTypeId: typeId, status: 'planned', attendance: 800, ...extra });

describe('path generation', () => {
  it('uses only events the player added', () => {
    const a = planned('regional', { name: 'Atlanta' });
    const result = byStrategy(path([a]), 200);
    expect(result['least-demanding'].assignments.map((x) => x.eventId)).toEqual([a.id]);
  });

  // PRD fixture 7.
  it('drops a removed event from every generated path', () => {
    const a = planned('regional', { name: 'Atlanta' });
    const b = planned('regional', { name: 'Orlando' });
    const withBoth = gen(path([a, b]), 400);
    expect(withBoth.every((g) => g.feasible)).toBe(true);
    const withoutB = gen(path([a]), 400);
    for (const g of withoutB) {
      expect(g.assignments.some((x) => x.eventId === b.id)).toBe(false);
    }
  });

  it('respects the best finish the player allows for an event', () => {
    const a = planned('regional', { name: 'Atlanta', bestFinishConstraint: 9 });
    const result = byStrategy(path([a]), 200);
    // Constrained to 9th or worse, so 200 CP is the ceiling — 350 is unreachable.
    expect(result['least-demanding'].assignments[0].placement).toBeGreaterThanOrEqual(9);
    expect(gen(path([a]), 350)[0].feasible).toBe(false);
  });

  it('never proposes a direct-invite finish as an ordinary path', () => {
    const a = planned('regional', { name: 'Atlanta' });
    const b = planned('international', { name: 'NAIC' });
    for (const g of gen(path([a, b]), 600)) {
      for (const x of g.assignments) {
        const depth = x.eventTypeLabel.startsWith('International') ? 4 : 1;
        expect(x.placement!).toBeGreaterThan(depth);
      }
    }
  });

  it('picks the least demanding finish that still reaches the target', () => {
    const a = planned('regional', { name: 'Atlanta' });
    const b = planned('regional', { name: 'Orlando' });
    // 320 is reachable as 200+160 (two 9–16/17–32 finishes) rather than one 2nd place.
    const least = byStrategy(path([a, b]), 320)['least-demanding'];
    expect(least.feasible).toBe(true);
    expect(least.total).toBeGreaterThanOrEqual(320);
    // No finish better than 5th is demanded.
    expect(Math.min(...least.assignments.map((x) => x.placement!))).toBeGreaterThanOrEqual(5);
  });

  it('trades placement difficulty for event count between the two strategies', () => {
    const events = Array.from({ length: 3 }, (_, i) => planned('regional', { name: `R${i}` }));
    const result = byStrategy(path(events), 480);
    const least = result['least-demanding'];
    const fewest = result['fewest-events'];
    expect(least.feasible && fewest.feasible).toBe(true);
    // Fewest-events never uses more events than least-demanding...
    expect(fewest.eventCount).toBeLessThanOrEqual(least.eventCount);
    // ...and least-demanding never needs a harder single finish than fewest-events.
    const hardest = (g: typeof least) => Math.min(...g.assignments.map((x) => x.placement!));
    expect(hardest(least)).toBeGreaterThanOrEqual(hardest(fewest));
  });

  it('prefers committed events when asked to', () => {
    const committed = planned('regional', { name: 'Committed', committed: true });
    const optional = planned('regional', { name: 'Optional' });
    const best = byStrategy(path([committed, optional]), 200)['best-use-of-committed'];
    expect(best.assignments).toHaveLength(1);
    expect(best.assignments[0].eventName).toBe('Committed');
  });

  it('reports the shortfall and maximum attainable CP when the target is out of reach', () => {
    const a = planned('league-cup', { name: 'Local Cup' });
    const result = gen(path([a]), 5000);
    for (const g of result) {
      expect(g.feasible).toBe(false);
      expect(g.maxAttainable).toBe(50);
      expect(g.shortfall).toBe(4950);
    }
  });

  it('names a direct-invite finish only when no CP path is left', () => {
    const a = planned('regional', { name: 'Atlanta' });
    const infeasible = gen(path([a]), 5000)[0];
    expect(infeasible.notes.join(' ')).toMatch(/direct-invitation finish/);
    const feasible = gen(path([a]), 200)[0];
    expect(feasible.notes.join(' ')).not.toMatch(/direct-invitation/);
  });

  it('counts completed results toward the target it must reach', () => {
    const done = ev({ eventTypeId: 'regional', placement: 1 }); // 350
    const plan = planned('regional', { name: 'Atlanta' });
    const result = byStrategy(path([done, plan]), 500)['least-demanding'];
    expect(result.feasible).toBe(true);
    // Only 150 CP is missing, so a 17–32 finish (160) suffices.
    expect(result.assignments[0].points).toBeLessThanOrEqual(200);
  });

  it('accounts for the Best Finish Limit when a bucket is already full', () => {
    const five = Array.from({ length: 5 }, () =>
      ev({ eventTypeId: 'regional', placement: 2, attendance: 800 })); // 325 each = 1625
    const plan = planned('regional', { name: 'Sixth major' });
    // Winning is a direct-invite finish, so the best the generator may assume is
    // 2nd place — which only ties the counted 325s and therefore displaces nothing.
    const result = gen(path([...five, plan]), 1700);
    expect(result.every((g) => !g.feasible)).toBe(true);
    expect(result[0].maxAttainable).toBe(1625);
    expect(result[0].assignments).toHaveLength(0);
  });

  it('is deterministic across repeated runs', () => {
    const events = Array.from({ length: 3 }, (_, i) => planned('regional', { name: `R${i}` }));
    const p = path(events);
    const a = JSON.stringify(gen(p, 500));
    const b = JSON.stringify(gen(p, 500));
    expect(a).toBe(b);
  });

  it('asks for a target before generating anything', () => {
    const a = planned('regional', { name: 'Atlanta' });
    const result = gen(path([a]), null);
    expect(result[0].notes.join(' ')).toMatch(/Set a planning target/);
  });
});
