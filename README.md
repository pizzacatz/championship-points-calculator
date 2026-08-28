# Championship Points Calculator

Plan a 2027 Play! Pokémon Worlds run without doing Best Finish Limit arithmetic by hand.

**Live app → https://points.georgiaplayevents.com/**

Adding up the published Championship Point value of every tournament you intend to
enter gives the wrong answer. CP depends on attendance kickers, on which Best Finish
Limit bucket an event falls into, and on which of your existing results a new result
displaces. This tool models all three, for Masters players in VGC, the TCG, or
Pokémon GO.

It answers one question: *given my results so far and the events I can actually get
to, what counts, what gets displaced, and what finishes would put me near my target?*

## What it does

- **Scores results correctly.** Exact placement → published band → kicker check →
  Best Finish Limit. League Challenges and League Cups get separate buckets of four;
  Regionals, Specials and Internationals share one bucket of five.
- **Explains every row.** Each result says what it is worth and why it counts, or why
  it does not: below kicker, excluded by BFL, unverified attendance, needs correction.
- **Shows displacement.** "This result adds 190 net CP by replacing Orlando Regional
  worth 160 CP."
- **Separates current from projected.** Planned results move projected CP and never
  touch your current total.
- **Generates three paths** from the events you added — least demanding placements,
  fewest events, and best use of the events you marked committed — respecting the
  best finish you allow it to assume for each event.
- **Tracks direct invitations** separately from points, and never proposes one as an
  ordinary path.
- **Keeps a path per game.** Points never combine across VGC, TCG and GO, so neither
  do paths. Everything is stored in your browser, with JSON export and import.

## What it does not claim

Reaching your planning target is **not** qualification. The season-end cutoff is not
knowable in advance, and this tool does not forecast one or state a probability of
qualifying. It shows two benchmarks and lets you set your own target:

- the **previous-season cutoff** — the CP total held by the player at the last Masters
  invitation slot for your game and rating zone at the end of the 2026 season; and
- the **live boundary** — the same figure for the current season, refreshed daily.

The default target is the greater of the two, and is freely editable. Only a direct
invitation guarantees a place.

Also out of scope: Junior and Senior divisions, travel, cost, registration, and any
match-win-rate-to-placement simulation.

## Data sources

Every CP table, Best Finish Limit, invitation-slot count and direct-invitation rule in
[`src/data/rules-2027.json`](src/data/rules-2027.json) is transcribed from the official
2027 Play! Pokémon pages and checked twice against the page source:

- [Championship Series overview](https://championships.pokemon.com/en-us/about/) — BFL concept, rating zones, invitation slots, direct invites
- [League Challenges and League Cups](https://championships.pokemon.com/en-us/about/league-challenges-and-league-cup)
- [Regional and Special Championships](https://championships.pokemon.com/en-us/about/pokemon-regional-and-special-championships)
- [International Championships](https://championships.pokemon.com/en-us/about/international-championships)
- [VGC Global Challenge and Grand Challenge](https://championships.pokemon.com/en-us/about/pokemon-vgc-global-challenge-grand-challenge)
- [Pokémon GO Battle League Leaderboard Challenges](https://championships.pokemon.com/en-us/about/pokemon-pgo-gbl-leaderboard-challenge)
- [Official leaderboards](https://championships.pokemon.com/en-us/competitors/leaderboards)

Cutoffs in [`src/data/cutoffs.json`](src/data/cutoffs.json) are read from the official
leaderboard API, not from community tables. The app displays its rules version and
verification date, and says so when the live boundary is stale or unavailable.

### Projected attendance for planned majors

[`src/data/attendance-baselines.json`](src/data/attendance-baselines.json) holds the field
size assumed for a **planned** major: the smallest Masters field observed in that category
during the previous season. Play! Pokémon publishes no attendance feed, so these come from
the community databases that do, via
[`scripts/refresh-attendance.mjs`](scripts/refresh-attendance.mjs):

| Game | Source | Status |
|---|---|---|
| TCG | [limitlesstcg.com](https://limitlesstcg.com/tournaments) | 36 events, final standings |
| VGC | [limitlessvgc.com](https://limitlessvgc.com/tournaments) | 35 events, final standings |
| GO | [rk9.gg](https://rk9.gg) rosters | 31 events, **roster counts** — see below |

Limitless's player count is the Masters count. Two independent spot-checks against
[rk9.gg](https://rk9.gg), the official tournament software, and
[Victory Road](https://victoryroad.pro):

| Event | Limitless | Cross-check |
|---|---:|---|
| Seattle 2026 VGC | 822 | 821 Masters with a final standing (rk9 roster) |
| Gdańsk 2026 VGC | 418 | "Attendance 418 MA" (Victory Road) |

Regionals, Specials and Internationals each carry their own baseline. They share a payout
table and one Best Finish Limit, but their fields differ by an order of magnitude — the
smallest 2026 VGC Regional held 180 players and the smallest Special 43 — so one shared
figure would misprice two of the three. That refines the recommendation in PRD §16 with the
observed data. Baselines are *not* split by the player's home rating zone: kicker
eligibility depends on attendance at the event actually entered.

| | Regional | Special | International |
|---|---:|---:|---:|
| **TCG** | 617 | 80 | 2,117 |
| **VGC** | 180 | 43 | 518 |
| **GO** | 38 | 93 † | 266 |

### Pokémon GO, and the rk9 harvester

Limitless does not cover Pokémon GO, so
[`scripts/harvest-rk9.mjs`](scripts/harvest-rk9.mjs) reads rk9 rosters directly.

**rk9.gg/robots.txt disallows `/roster/`.** This script reads it anyway, at the explicit
direction of the repository owner. That is a deliberate choice to override a site
operator's stated access policy, and the consequences of it land on whoever runs the
script. It is not wired into CI for that reason — run it by hand, rarely.

Because rk9 is the software running live tournaments, the harvester is written to cost that
service as little as possible: Pokémon GO only by default (TCG and VGC already come from a
source that permits crawling), event discovery through `/event/`, which robots.txt permits,
one sequential request every four seconds, and an on-disk cache so a re-run costs nothing.
Rosters are counted and discarded — player names, countries, screen names and Play! Pokémon
IDs are never parsed or written out. The only thing that leaves the script is a count.

Two limits on the GO figures, both recorded in the data file and surfaced in the app:

- **They count the roster, not the field that played, and the error runs in an unresolved
  direction.** GO rosters carry no Standing column, so unlike the TCG and VGC rosters there
  is no way to tell who actually finished. The obvious guess — that a roster over-counts
  because of no-shows — is contradicted by the one independent check available: for Orlando
  2026 GO the rk9 roster holds **156** where Liquipedia's `player_number` reports **174**.
  An 11% disagreement in the opposite direction, unexplained. The rk9 roster may list only
  players who consented to appear on it. Until that is resolved, treat the GO figures as
  approximate in both directions.
- **† Only 2 of the 6 Special Events are on rk9 at all**, so the GO Special figure is the
  lowest of a partial set rather than of the season, and is probably too high. The four
  missing events — Lima, San Juan, Auckland, Buenos Aires — return 500 on rk9, which
  suggests they run on other software entirely.

Because of both, every GO category is flagged `verified: false`, and planned GO majors stay
labelled *conditional on the kicker being met* in the UI. A category is only marked verified
when the sweep covered every event in it **and** those rosters published final standings.

Note this data is only ever used for *planned* majors. Completed events always use their
actual attendance, and entering an attendance on a planned event overrides the projection.

## Local setup

```bash
npm install
npm run dev        # http://localhost:5173/
```

| Script | Purpose |
|---|---|
| `npm test` | 52 unit and fixture tests over the rules data, engine and generator |
| `npm run typecheck` | strict TypeScript, no emit |
| `npm run build` | typecheck, then production build to `dist/` |
| `npm run refresh:leaderboard` | re-read the live boundary from the official API |
| `npm run refresh:attendance` | rebuild the attendance baselines from Limitless and Liquipedia |

The end-to-end smoke test drives the built app in a real browser:

```bash
npm run build
npx vite preview --port 4188 --strictPort &
node tests/smoke.spec.mjs
```

## Updating the rules

CP values are configuration, because the official pages state they may change.

1. Re-read the official pages listed above.
2. Edit `src/data/rules-2027.json`. Bump `rulesVersion`, and set `verifiedAt` and
   `verifiedBy` to record who checked what, when.
3. Update the fixtures in `tests/rules.test.ts` that assert the published tables
   verbatim — they exist to make a silent transcription change impossible.
4. `npm test`, then commit. Deployment is automatic.

`validateRules()` independently checks that every table is contiguous and that points
decrease monotonically, so a mistyped band fails the suite rather than shipping.

## Architecture

```
src/
├── data/          rules, cutoffs and attendance baselines — versioned JSON, never inline in components
├── domain/        calculate.ts · generate.ts · schema.ts · types.ts — pure, no DOM, no network
├── components/    PlanRow.tsx
├── brand/         tokens.css — vendored GeorgiaPlayEvents primitives
├── store.ts       localStorage persistence
└── App.tsx
scripts/           refresh-leaderboard.mjs — daily boundary refresh
                   refresh-attendance.mjs  — previous-season attendance baselines
tests/             52 unit and fixture tests, plus a browser smoke test
```

The engine is deliberately pure: `evaluatePath()` and `generatePaths()` take rules,
baselines and a path, and return totals, per-row explanations, bucket occupancy and
displacement. That is what makes the acceptance fixtures in `tests/calculate.test.ts`
possible, and it is why the rules live in JSON rather than in components.

The site is served from `points.georgiaplayevents.com` at the domain root — `public/CNAME`
holds the custom domain, and `vite.config.ts` therefore builds with `base: '/'`. The DNS
record is a `CNAME` from `points` to `pizzacatz.github.io`.

The site is fully static. A scheduled GitHub Action reads the official leaderboard
once a day and commits a snapshot, so there is no runtime backend and no user account
anywhere in the system. If a refresh fails, the last valid snapshot is kept and the
failure is recorded rather than silently serving a gap.

Colours come from the shared
[GeorgiaPlayEvents palette](../GeorgiaPlayEventsAssets/docs/COLOR-SCHEME.md); the
primitives in `src/brand/tokens.css` are a vendored copy, following the same
copy-don't-depend convention as the icons.

## Licence

MIT. Not affiliated with, endorsed by, or sponsored by The Pokémon Company
International. Pokémon and all respective names are trademarks of Nintendo,
Creatures Inc. and GAME FREAK inc.
