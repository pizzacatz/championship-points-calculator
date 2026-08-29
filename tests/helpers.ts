import rulesJson from '../src/data/rules-2027.json';
import baselinesJson from '../src/data/attendance-baselines.json';
import type { AttendanceBaselines, Game, PlannedEvent, QualificationPath, SeasonRules } from '../src/domain/types';

export const rules = rulesJson as unknown as SeasonRules;
export const baselines = baselinesJson as unknown as AttendanceBaselines;

let seq = 0;
export function ev(partial: Partial<PlannedEvent> & { eventTypeId: string }): PlannedEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    name: '',
    date: null,
    placement: null,
    attendance: null,
    ...partial,
  };
}

export function path(events: PlannedEvent[], overrides: Partial<QualificationPath> = {}): QualificationPath {
  return {
    id: 'p1',
    schemaVersion: 1,
    name: 'Test path',
    game: 'VGC' as Game,
    ratingZone: 'NA',
    ageDivision: 'MASTERS',
    targetOverride: null,
    events,
    updatedAt: '2026-08-28T00:00:00.000Z',
    ...overrides,
  };
}
