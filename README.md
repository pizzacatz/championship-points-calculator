# Championship Points Calculator

Plan a 2027 Play! Pokémon Worlds run without doing Best Finish Limit arithmetic by hand.

**Live app → https://pizzacatz.github.io/championship-points-calculator/**

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

### The one unverified input

[`src/data/attendance-baselines.json`](src/data/attendance-baselines.json) holds the
projected field size used for **planned** major events. Play! Pokémon publishes no
machine-readable attendance feed, so unlike everything else here these numbers could
not be sourced — they are conservative placeholders, flagged `"verified": false`.

Consequently every planned-major projection that relies on them is labelled
*conditional on the kicker being met* in the UI, and the footer says so plainly.
Entering a real attendance on a planned event, or using the attendance-adjustment
control, replaces the projection. Completed events always use actual attendance and
are never affected.

To verify them: for each game and category, find the smallest Masters field among the
previous season's events, and record it with the event that produced it.

## Local setup

```bash
npm install
npm run dev        # http://localhost:5173/championship-points-calculator/
```

| Script | Purpose |
|---|---|
| `npm test` | 52 unit and fixture tests over the rules data, engine and generator |
| `npm run typecheck` | strict TypeScript, no emit |
| `npm run build` | typecheck, then production build to `dist/` |
| `npm run refresh:leaderboard` | re-read the live boundary from the official API |

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
tests/             52 unit and fixture tests, plus a browser smoke test
```

The engine is deliberately pure: `evaluatePath()` and `generatePaths()` take rules,
baselines and a path, and return totals, per-row explanations, bucket occupancy and
displacement. That is what makes the acceptance fixtures in `tests/calculate.test.ts`
possible, and it is why the rules live in JSON rather than in components.

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
