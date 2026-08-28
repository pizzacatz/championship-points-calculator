/**
 * Structural validation for imported paths and for the bundled rules data.
 * Hand-rolled rather than pulled from a validation library: the shapes are
 * small and fixed, and the app ships as a dependency-free static bundle.
 */
import type { Game, PlannedEvent, QualificationPath, RatingZoneId, SeasonRules } from './types';

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const GAMES: Game[] = ['VGC', 'GO', 'TCG'];
const ZONES: RatingZoneId[] = ['NA', 'EU', 'LA', 'AP', 'SO'];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isPosInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1;
const isNullableInt = (v: unknown): v is number | null =>
  v === null || (Number.isInteger(v) && (v as number) >= 0);

function parseEvent(raw: unknown, i: number, rules: SeasonRules, errors: string[]): PlannedEvent | null {
  if (!isObj(raw)) { errors.push(`events[${i}] is not an object.`); return null; }
  const at = (f: string) => `events[${i}].${f}`;
  const typeId = raw.eventTypeId;
  if (typeof typeId !== 'string' || !rules.eventTypes.some((t) => t.id === typeId)) {
    errors.push(`${at('eventTypeId')} is not a known event type.`);
    return null;
  }
  if (raw.status !== 'completed' && raw.status !== 'planned') {
    errors.push(`${at('status')} must be "completed" or "planned".`);
    return null;
  }
  if (raw.placement != null && !isPosInt(raw.placement)) {
    errors.push(`${at('placement')} must be a positive whole number.`);
    return null;
  }
  if (!isNullableInt(raw.awardedPoints)) { errors.push(`${at('awardedPoints')} must be a whole number or null.`); return null; }
  if (!isNullableInt(raw.attendance)) { errors.push(`${at('attendance')} must be a whole number or null.`); return null; }

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `imported-${i}`,
    status: raw.status,
    name: typeof raw.name === 'string' ? raw.name : '',
    eventTypeId: typeId,
    date: typeof raw.date === 'string' ? raw.date : null,
    placement: (raw.placement as number | null) ?? null,
    awardedPoints: (raw.awardedPoints as number | null) ?? null,
    attendance: (raw.attendance as number | null) ?? null,
    committed: raw.committed === true,
    bestFinishConstraint: isPosInt(raw.bestFinishConstraint) ? raw.bestFinishConstraint : null,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
  };
}

/** Validate an imported path document. Rejects anything the engine could not score. */
export function parsePath(raw: unknown, rules: SeasonRules): Validation<QualificationPath> {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['The file is not a JSON object.'] };
  if (raw.schemaVersion !== 1) errors.push('Unsupported schemaVersion — this file was written by a different version.');
  if (typeof raw.game !== 'string' || !GAMES.includes(raw.game as Game)) errors.push('game must be VGC, GO or TCG.');
  if (typeof raw.ratingZone !== 'string' || !ZONES.includes(raw.ratingZone as RatingZoneId)) errors.push('ratingZone is not a known rating zone.');
  if (raw.ageDivision !== 'MASTERS') errors.push('Only the Masters division is supported.');
  if (raw.targetOverride != null && !isPosInt(raw.targetOverride)) errors.push('targetOverride must be a positive whole number or null.');
  if (raw.attendanceAdjustment != null && !Number.isInteger(raw.attendanceAdjustment)) errors.push('attendanceAdjustment must be a whole number.');
  if (!Array.isArray(raw.events)) errors.push('events must be an array.');
  if (errors.length) return { ok: false, errors };

  const game = raw.game as Game;
  const events = (raw.events as unknown[])
    .map((e, i) => parseEvent(e, i, rules, errors))
    .filter((e): e is PlannedEvent => e !== null)
    // A path holds one game; anything that cannot belong to it is dropped, never carried across.
    .filter((e) => {
      const rule = rules.eventTypes.find((t) => t.id === e.eventTypeId)!;
      if (rule.games.includes(game)) return true;
      errors.push(`Dropped "${e.name || rule.label}": ${rule.label} does not award ${game} points.`);
      return false;
    });

  if (errors.some((m) => !m.startsWith('Dropped '))) return { ok: false, errors };

  return {
    ok: true,
    value: {
      id: typeof raw.id === 'string' && raw.id ? raw.id : `path-${Date.now()}`,
      schemaVersion: 1,
      name: typeof raw.name === 'string' && raw.name ? raw.name : `${game} path`,
      game,
      ratingZone: raw.ratingZone as RatingZoneId,
      ageDivision: 'MASTERS',
      targetOverride: (raw.targetOverride as number | null) ?? null,
      attendanceAdjustment: (raw.attendanceAdjustment as number) ?? 0,
      events,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    },
  };
}

/** Sanity-check the bundled rules file: every table referenced, every band ordered. */
export function validateRules(rules: SeasonRules): string[] {
  const errors: string[] = [];
  for (const type of rules.eventTypes) {
    const table = rules.placementTables[type.table];
    if (!table) { errors.push(`${type.id} references missing table "${type.table}".`); continue; }
    let previousMax = 0;
    for (const band of table) {
      if (band.minPlace !== previousMax + 1) {
        errors.push(`${type.table}: band ${band.minPlace}–${band.maxPlace} does not follow ${previousMax} contiguously.`);
      }
      if (band.maxPlace < band.minPlace) errors.push(`${type.table}: band ${band.minPlace}–${band.maxPlace} is inverted.`);
      previousMax = band.maxPlace;
    }
    const points = table.map((b) => b.points);
    if (points.some((p, i) => i > 0 && p > points[i - 1])) {
      errors.push(`${type.table}: points do not decrease monotonically down the table.`);
    }
  }
  return errors;
}
