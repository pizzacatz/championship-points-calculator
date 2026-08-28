/** Local persistence. Multiple independent paths, one game each, no accounts. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Game, PlannedEvent, QualificationPath, RatingZoneId } from './domain/types';

const KEY = 'cpc.paths.v1';
const ACTIVE = 'cpc.activePath.v1';

export const newId = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

export function blankPath(game: Game = 'VGC', ratingZone: RatingZoneId = 'NA'): QualificationPath {
  return {
    id: newId(),
    schemaVersion: 1,
    name: `${game} — Masters`,
    game,
    ratingZone,
    ageDivision: 'MASTERS',
    targetOverride: null,
    events: [],
    updatedAt: new Date().toISOString(),
  };
}

export function blankEvent(eventTypeId: string): PlannedEvent {
  return {
    id: newId(),
    name: '',
    eventTypeId,
    date: null,
    placement: null,
    awardedPoints: null,
    attendance: null,
  };
}

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown): void => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode, quota — non-fatal */ }
};

export function usePaths() {
  const [paths, setPaths] = useState<QualificationPath[]>(() => {
    const stored = read<QualificationPath[]>(KEY, []);
    return stored.length ? stored : [blankPath()];
  });
  const [activeId, setActiveId] = useState<string>(() => {
    const stored = read<string | null>(ACTIVE, null);
    return stored ?? '';
  });

  // Autosave.
  useEffect(() => { write(KEY, paths); }, [paths]);
  useEffect(() => { if (activeId) write(ACTIVE, activeId); }, [activeId]);

  const active = useMemo(
    () => paths.find((p) => p.id === activeId) ?? paths[0],
    [paths, activeId],
  );

  useEffect(() => {
    if (active && active.id !== activeId) setActiveId(active.id);
  }, [active, activeId]);

  const update = useCallback((patch: Partial<QualificationPath>) => {
    setPaths((all) => all.map((p) =>
      p.id === active?.id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p));
  }, [active?.id]);

  const updateEvent = useCallback((id: string, patch: Partial<PlannedEvent>) => {
    setPaths((all) => all.map((p) => p.id !== active?.id ? p : {
      ...p,
      events: p.events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      updatedAt: new Date().toISOString(),
    }));
  }, [active?.id]);

  const addEvent = useCallback((event: PlannedEvent) => {
    setPaths((all) => all.map((p) => p.id !== active?.id ? p : {
      ...p, events: [...p.events, event], updatedAt: new Date().toISOString(),
    }));
  }, [active?.id]);

  const addEvents = useCallback((events: PlannedEvent[]) => {
    if (!events.length) return;
    setPaths((all) => all.map((p) => p.id !== active?.id ? p : {
      ...p, events: [...p.events, ...events], updatedAt: new Date().toISOString(),
    }));
  }, [active?.id]);

  const removeEvents = useCallback((ids: string[]) => {
    if (!ids.length) return;
    const drop = new Set(ids);
    setPaths((all) => all.map((p) => p.id !== active?.id ? p : {
      ...p, events: p.events.filter((e) => !drop.has(e.id)), updatedAt: new Date().toISOString(),
    }));
  }, [active?.id]);

  const removeEvent = useCallback((id: string) => {
    setPaths((all) => all.map((p) => p.id !== active?.id ? p : {
      ...p, events: p.events.filter((e) => e.id !== id), updatedAt: new Date().toISOString(),
    }));
  }, [active?.id]);

  const duplicateEvent = useCallback((id: string) => {
    setPaths((all) => all.map((p) => {
      if (p.id !== active?.id) return p;
      const index = p.events.findIndex((e) => e.id === id);
      if (index < 0) return p;
      const copy = { ...p.events[index], id: newId() };
      const events = [...p.events];
      events.splice(index + 1, 0, copy);
      return { ...p, events, updatedAt: new Date().toISOString() };
    }));
  }, [active?.id]);

  const moveEvent = useCallback((id: string, direction: -1 | 1) => {
    setPaths((all) => all.map((p) => {
      if (p.id !== active?.id) return p;
      const index = p.events.findIndex((e) => e.id === id);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= p.events.length) return p;
      const events = [...p.events];
      [events[index], events[next]] = [events[next], events[index]];
      return { ...p, events, updatedAt: new Date().toISOString() };
    }));
  }, [active?.id]);

  const createPath = useCallback((game: Game, zone: RatingZoneId) => {
    const created = blankPath(game, zone);
    setPaths((all) => [...all, created]);
    setActiveId(created.id);
  }, []);

  const importPath = useCallback((imported: QualificationPath) => {
    const withId = { ...imported, id: newId() };
    setPaths((all) => [...all, withId]);
    setActiveId(withId.id);
  }, []);

  const deletePath = useCallback((id: string) => {
    setPaths((all) => {
      const rest = all.filter((p) => p.id !== id);
      const next = rest.length ? rest : [blankPath()];
      setActiveId(next[0].id);
      return next;
    });
  }, []);

  return {
    paths, active, setActiveId, update, updateEvent, addEvent, addEvents,
    removeEvent, removeEvents, duplicateEvent, moveEvent, createPath, deletePath, importPath,
  };
}

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('cpc.theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('cpc.theme', theme); } catch { /* non-fatal */ }
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
}
