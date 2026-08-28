import { useState } from 'react';
import type { CatalogEvent, EventsCatalog, Game, RatingZoneId, SeasonRules } from '../domain/types';

const CATEGORY_TO_TYPE: Record<CatalogEvent['category'], string> = {
  regional: 'regional', special: 'special', international: 'international',
};

/**
 * The published majors, as a checklist grouped by rating zone and collapsed by
 * default. Bulk-add takes a whole zone; unchecking is how you pare it back to
 * what you can actually reach, which is the ergonomic that matters — adding an
 * event is the player asserting they can attend it.
 */
export function EventCatalog({
  catalog, rules, game, homeZone, addedNames, onToggle, onBulk,
}: {
  catalog: EventsCatalog;
  rules: SeasonRules;
  game: Game;
  homeZone: RatingZoneId;
  addedNames: Set<string>;
  onToggle: (event: CatalogEvent, typeId: string, add: boolean) => void;
  onBulk: (events: { event: CatalogEvent; typeId: string }[], add: boolean) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ [homeZone]: true });

  const byZone = new Map<RatingZoneId, CatalogEvent[]>();
  for (const e of catalog.upcoming) {
    if (!e.zone) continue;
    if (game === 'GO' && !e.rk9?.GO) continue;
    byZone.set(e.zone, [...(byZone.get(e.zone) ?? []), e]);
  }

  const zones = rules.ratingZones.filter((z) => byZone.has(z.id));

  return (
    <section className="panel" aria-labelledby="catalog-h">
      <header>
        <h2 id="catalog-h">Events</h2>
        <span className="panel-note">Add what you can get to. Uncheck what you can't.</span>
      </header>

      {zones.map((zone) => {
        const events = byZone.get(zone.id)!;
        const withTypes = events.map((e) => ({ event: e, typeId: CATEGORY_TO_TYPE[e.category] }));
        const added = events.filter((e) => addedNames.has(e.name)).length;
        const isOpen = open[zone.id] ?? false;

        return (
          <div className="zone" key={zone.id}>
            <div className="zone-head">
              <button type="button" className="zone-toggle" aria-expanded={isOpen}
                onClick={() => setOpen((o) => ({ ...o, [zone.id]: !isOpen }))}>
                <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span> {zone.label}
              </button>
              <span className="zone-count">{added} of {events.length}</span>
              <button type="button" className="ghost" onClick={() => onBulk(withTypes, true)}>Add all</button>
              <button type="button" className="ghost" onClick={() => onBulk(withTypes, false)}
                disabled={added === 0}>Clear</button>
            </div>

            {isOpen && (
              <ul className="zone-list">
                {withTypes.map(({ event, typeId }) => {
                  const on = addedNames.has(event.name);
                  const id = `cat-${zone.id}-${event.name.replace(/\W+/g, '')}`;
                  return (
                    <li key={event.name}>
                      <input type="checkbox" id={id} checked={on}
                        onChange={() => onToggle(event, typeId, !on)} />
                      <label htmlFor={id}>
                        {event.name}
                        <span className="zone-date">{event.date}</span>
                        {event.category !== 'regional' && (
                          <span className="badge muted">{event.category}</span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
