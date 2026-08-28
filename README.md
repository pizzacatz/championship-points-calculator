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
| TCG | [limitlesstcg.com](https://limitlesstcg.com/tournaments) | observed, 36 events |
| VGC | [limitlessvgc.com](https://limitlessvgc.com/tournaments) | observed, 35 events |
| GO | — | **not sourced** |

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

**Pokémon GO has no baseline.** Limitless does not cover it, and Liquipedia — which does,
via its `player_number` field — rate-limits hard enough that the sweep has not completed.
Rather than invent a field size, a planned GO major asks you to assume an attendance or a
CP outcome, and the app says so. Completed GO events are unaffected, since they use actual
attendance. To fill it in: `node scripts/refresh-attendance.mjs`.

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
