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

**One question:** *if I attend these events, what is the worst I can do and still
qualify?*

- **Pick events from a checklist**, grouped by rating zone and collapsed by default.
  Add a whole zone at once, then uncheck what you cannot reach.
- **One number per event** — the CP you earned, or your finishing place. Each
  derives the other, because every CP value is unique within its payout table.
  350 at a Regional *is* 1st place, no kicker, direct invitation.
- **Leave an event blank** and it becomes what the app solves for.
- **The ladder** tells you the lowest finishes that still reach your target,
  relaxing the hardest events first: it will not ask for a top-32 at a
  1,100-player International when winning two 40-player Cups is more realistic.
  It reports how many of each type can **actually count** — nine Regionals share
  a Best Finish Limit of five, so it says "5 of 9" rather than asking for four
  finishes that cannot contribute.
- **A finished event you never logged drops out.** You cannot go back and compete
  in it, so solving for it would inflate the projection. It is flagged instead.
- **Best Finish Limits and displacement** are handled throughout — adding twelve
  Regionals cannot inflate anything, because only five ever count.

Plans are stored in your browser. Multiple plans, JSON export and import, no
accounts, nothing sent anywhere.

## Documents

| | |
|---|---|
| [`Championship-Points-Calculator-PRD.md`](Championship-Points-Calculator-PRD.md) | Current spec (v2) |
| [`docs/PRD-DIFF-v1-to-v2.md`](docs/PRD-DIFF-v1-to-v2.md) | What changed between the two specs |
| [`docs/DESIGN-RATIONALE.md`](docs/DESIGN-RATIONALE.md) | Why each decision was made, then unmade |
| [`docs/PRD-v1.0-2026-08-28.md`](docs/PRD-v1.0-2026-08-28.md) | v1, archived |
| [`docs/DATA-SOURCES.md`](docs/DATA-SOURCES.md) | Every endpoint and cross-check |
| [`docs/NEXT-VERSION.md`](docs/NEXT-VERSION.md) | Design notes and open questions |

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
| TCG | [limitlesstcg.com](https://limitlesstcg.com/tournaments) | per-zone medians |
| VGC | [limitlessvgc.com](https://limitlessvgc.com/tournaments) | per-zone medians |
| GO | — | none published; a GO major asks for the CP instead |

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
| `npm run refresh:catalog` | rebuild the season's Regional / Special / International list |

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

Two scheduled workflows keep the data current, both following the framework
[pokemon-majors-map](https://github.com/pizzacatz/pokemon-majors-map) uses: scrape
on a schedule, never publish a failed scrape, commit only real changes, and kick
the deploy explicitly afterwards — commits made with `GITHUB_TOKEN` do not trigger
other workflows, so without that last step refreshed data sits in git and never
reaches the site.

| Workflow | Refreshes |
|---|---|
| `refresh-events.yml` | the season's Regionals, Specials and Internationals |
| `refresh-leaderboard.yml` | the live Worlds-invitation boundary |

`refresh-catalog.mjs` refuses to publish a catalog that is empty, or that contains
an event outside the season window — September to the end of June. That guard
exists because the first version of this failed silently: the list looked full, it
was just full of last season's finished events.

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
