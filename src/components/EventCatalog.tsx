import { useState } from 'react';
import type { CatalogEvent, EventsCatalog, Game, RatingZoneId, SeasonRules } from '../domain/types';

// Zone-grouped majors map their category onto an event type. Online events name
// their own, since a month's Global Challenge is not a category of place.
const CATEGORY_TO_TYPE: Partial<Record<CatalogEvent['category'], string>> = {
  regional: 'regional', special: 'special', international: 'international',
};

/**
 * The published majors, as a checklist grouped by rating zone and collapsed by
 * default. Bulk-add takes a whole zone; unchecking is how you pare it back to
 * what you can actually reach, which is the ergonomic that matters — adding an
 * event is the player asserting they can attend it.
 */
export function EventCatalog({
  catalog, rules, game, homeZone, addedNames, onToggle, onBulk, manualTypes, onAddManual,
}: {
  catalog: EventsCatalog;
  rules: SeasonRules;
  game: Game;
  homeZone: RatingZoneId;
  addedNames: Set<string>;
  onToggle: (event: CatalogEvent, typeId: string, add: boolean) => void;
  onBulk: (events: { event: CatalogEvent; typeId: string }[], add: boolean) => void;
  /** Cups and Challenges are unlisted, so they are added by hand — but adding is
   *  one job, so the buttons belong here rather than inside the plan. */
  manualTypes: { id: string; label: string }[];
  onAddManual: (typeId: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ [homeZone]: true });

  const byZone = new Map<RatingZoneId, CatalogEvent[]>();
  for (const e of catalog.upcoming) {
    if (!e.zone) continue;
    if (game === 'GO' && !e.rk9?.GO) continue;
    byZone.set(e.zone, [...(byZone.get(e.zone) ?? []), e]);
  }


  const zones = rules.ratingZones.filter((z) => byZone.has(z.id));

  // Global and Grand Challenges are not regional — points are ranked within your
  // own zone — so they get their own group rather than sitting under a region.
  const online = (catalog.online ?? []).filter((e) => e.games?.includes(game));
  const onlineAdded = online.filter((e) => addedNames.has(e.name)).length;
  const onlineOpen = open.online ?? false;

  return (
    <section className="panel" aria-labelledby="catalog-h">
      <header>
        <h2 id="catalog-h">Events</h2>
        <span className="row catalog-actions">
          <button type="button" className="ghost"
            onClick={() => setOpen(Object.fromEntries(
              [...zones.map((z) => [z.id, true] as const), ['online', true] as const]))}>
            Expand all
          </button>
          <button type="button" className="ghost" onClick={() => setOpen({})}>Collapse all</button>
        </span>
      </header>

      {zones.map((zone) => {
        const events = byZone.get(zone.id)!;
        const withTypes = events.map((e) => ({ event: e, typeId: CATEGORY_TO_TYPE[e.category]! }));
        const added = events.filter((e) => addedNames.has(e.name)).length;
        const isOpen = open[zone.id] ?? false;

        return (
          <div className="zone" key={zone.id}>
            <div className="zone-head">
              <button type="button" className="zone-toggle" aria-expanded={isOpen}
                onClick={() => setOpen((o) => ({ ...o, [zone.id]: !isOpen }))}>
                <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span> {zone.label}
              </button>
              {/* Split so every count lines up on the word "of" across zones. */}
            <span className="zone-count"><b>{added}</b> of <b>{events.length}</b></span>
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
                        {/* No category chip: "…International Championships" already says so. */}
                        <span className="ev-name">{event.name}</span>
                        <span className="zone-date">{event.date}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      {online.length > 0 && (
        <div className="zone" key="online">
          <div className="zone-head">
            <button type="button" className="zone-toggle" aria-expanded={onlineOpen}
              onClick={() => setOpen((o) => ({ ...o, online: !onlineOpen }))}>
              <span aria-hidden="true">{onlineOpen ? '▾' : '▸'}</span> Global &amp; Grand Challenges
            </button>
            <span className="zone-count"><b>{onlineAdded}</b> of <b>{online.length}</b></span>
            <button type="button" className="ghost"
              onClick={() => onBulk(online.map((e) => ({ event: e, typeId: e.eventTypeId! })), true)}>
              Add all
            </button>
            <button type="button" className="ghost" disabled={onlineAdded === 0}
              onClick={() => onBulk(online.map((e) => ({ event: e, typeId: e.eventTypeId! })), false)}>
              Clear
            </button>
          </div>

          {onlineOpen && (
            <ul className="zone-list">
              {online.map((event) => {
                const on = addedNames.has(event.name);
                const id = `cat-online-${event.name.replace(/\W+/g, '')}`;
                return (
                  <li key={event.name}>
                    <input type="checkbox" id={id} checked={on}
                      onChange={() => onToggle(event, event.eventTypeId!, !on)} />
                    <label htmlFor={id}>
                      {event.name.replace(/ — .*/, '')}
                      <span className="zone-date">{event.displayDate ?? event.date}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="row add-manual">
        {manualTypes
          // Global and Grand Challenges have their own group above.
          .filter((t) => t.id !== 'vgc-global-challenge')
          .map((t) => (
            <button key={t.id} type="button" onClick={() => onAddManual(t.id)}>+ {t.label}</button>
          ))}
      </div>
    </section>
  );
}
