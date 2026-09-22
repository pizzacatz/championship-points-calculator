# Technical Vocabulary — this project, three ways

The same story told three times: (1) in full industry jargon, (2) in plain
language with the matching technical term after each phrase, (3) as a
glossary table anchoring every term to the moment it appeared in this
project. Read 1 to test yourself, 2 to decode it, 3 to make it stick.

---

## 1. The jargon-dense version

### What the system is

The Championship Points Calculator is a **static single-page application**
(React + TypeScript, built with **Vite**, served from **GitHub Pages** on a
**custom domain** via a **CNAME** record) that plans a 2027 Play! Pokémon
Worlds qualification run for Masters players in VGC, the TCG and Pokémon GO.
The domain model is the official **Championship Points (CP)** system: each
event type has a **payout table** of **placement bands**, most bands are gated
by a **kicker** (a minimum **field size**), results are capped per category by
a **Best Finish Limit (BFL)** so a new result only adds what it **displaces**,
and qualification is decided against the **invitation boundary** — the CP held
by whoever sits at the last **invitation slot** in the player's **rating zone**
(rank 90 in VGC US-and-Canada, 842 CP last season). Top finishes at majors also
earn a **direct invitation** that bypasses the leaderboard entirely.

There is **no runtime backend**. Everything the app needs ships as **versioned
JSON** — the **rules as data** (`rules-2027.json`), the previous season's
**cutoffs**, the **attendance baselines** and the **event catalog** — plus one
**static snapshot** of the live leaderboard boundary that a scheduled job
commits daily. Plans persist to **localStorage** with **autosave**, and move
between devices only as **JSON export/import**.

### The engine and the solver

The core is a **pure function** engine (`src/domain/`): no DOM, no network, no
storage — rules, baselines and a plan arrive as arguments, which is what makes
it **deterministic** and fixture-testable. `evaluateResult()` is a **lookup**,
`(placement, turnout) → CP`; `evaluatePath()` then applies each BFL bucket,
sorting by CP with a **stable tie-break** on input order.

On top sits the **ladder**, a small **constraint solver**. Blank rows are the
**unknowns**; rows carrying a placement are fixed **constraints**; a past event
with no result is **excluded** rather than solved for. Demands are relaxed by
**lexicographic relaxation** over **tiers** (majors and online Challenges
first, then Cups, then Challenges), each tier relaxed in **lockstep** — every
type in it asked for the same finishing **bracket** — via a **greedy**,
tier-at-a-time search that keeps the deepest bracket still reaching the
target. It reports **feasibility** and **shortfall**, and it is verified by
**brute-force enumeration**: every combination of brackets is scored by the
same engine, and the solver must match the easiest one that reaches.

Field sizes for unplayed events are **projections** from a **baseline**: the
**median** (not the mean — robust to **outliers** like a 43-player Special) of
last season's fields, or a flat **stated assumption** where the owner chose
one (VGC Regionals 500). A player-entered turnout is a **per-event override**.
The design is explicit about **asymmetric error**: a too-low assumption shows a
visible zero and invites correction, a too-high one silently overstates — so
real attendance is counted for finished majors.

### The data pipeline

Five Node scripts do **web scraping** of the sources that feed the JSON. The
leaderboard boundary comes from an **undocumented API** discovered by grepping
the official site's **bundle**, with period IDs pulled out of a **CMS
payload** embedded in the page. Event lists and field sizes are **regex-parsed
HTML** from Limitless and rk9. The scrapers identify themselves with a
descriptive **user-agent**, respect or knowingly override **robots.txt**, apply
**rate limiting** (sequential requests, a 4-second delay), keep an **on-disk
cache** so re-runs cost nothing, and practise **data minimization**: rosters
are counted and discarded, never stored. Figures are **cross-checked** against
independent sources. The catalog scraper is a **publish guard** that refuses an
empty or out-of-season result, and the attendance scripts default to a **dry
run** (`--write` to save).

**GitHub Actions** runs the scrapers on a **cron schedule**, commits only real
changes, and then fires the deploy by **workflow_dispatch** — because commits
made with the **GITHUB_TOKEN** never trigger other workflows. On failure the
last good snapshot is kept: **graceful degradation** to stale-but-labelled
data. The deploy job is a **CI gate** (typecheck → unit tests → build →
**end-to-end smoke test**) under a **concurrency group**.

### The interface

The UI is **React function components** with **hooks**; derived figures are
**memoized** with `useMemo`. Number fields are **controlled inputs** driven by
one **custom hook**, `useNumberField`, which holds a local **draft state**
because `null` was doing double duty as a **sentinel value** ("nothing
entered" *and* "cleared"). Stored plans are repaired on load by a **data
migration**, and imports pass **hand-rolled validation** returning a
**discriminated union**. Presentation leans on **design tokens** (vendored
**CSS custom properties**), a **sticky header**, **tabular figures**,
**responsive** breakpoints, **ARIA** state attributes, the
**prefers-color-scheme** and **prefers-reduced-motion** media features, and
**progressive enhancement** for the date picker. A **build-time constant**
stamps the version into the footer.

### The build process

The project was specified in a **PRD**, shipped as v1, judged
**over-engineered**, and rebuilt as v2 the same day; `DESIGN-RATIONALE.md` is
the **retrospective** on why each decision was made and unmade. Releases follow
**semantic versioning** with a **changelog** entry explaining *why*. The rules
tables are locked by **verbatim fixture tests** plus a structural validator,
the engine by **unit tests** (Vitest), and the built site by a **Playwright**
smoke test in a **headless browser**; new browser checks were confirmed to
**fail against the old build** first, the mark of a real **regression test**.
The project's scrape-commit-deploy pattern is **borrowed** from the sibling
pokemon-majors-map, and its palette from GeorgiaPlayEventsAssets.

---

## 2. The plain-language version

This is a website that helps a Pokémon tournament player figure out how to
qualify for the World Championships. Players earn points at tournaments
(**Championship Points**), and the best players in each part of the world
(**rating zone**) get invited to Worlds — there's a fixed number of invitations
per area (**invitation slots**), so the question is always "how many points did
the last invited person have?" (**invitation boundary / cutoff**). Last season
in the US and Canada that was 842.

Adding up points is harder than it sounds. Each tournament type has a price
list — 1st pays this, 2nd pays that, 3rd–4th pay this (**payout table** made of
**placement bands**). Most prizes only pay if enough people showed up (**kicker**,
measured against the **field size**). And only your best few results of each
kind count (**Best Finish Limit**), so a new good result only helps by pushing
out a weaker one (**displacement**). Winning a big tournament can skip all this
and hand you an invitation outright (**direct invitation**).

The whole site is just files — no server doing work in the background (**static
single-page application**, **no runtime backend**). It's built with a popular
toolkit for interactive pages (**React**, **TypeScript**, bundled by **Vite**)
and hosted free by GitHub (**GitHub Pages**) under its own web address
(**custom domain**, set up with a **CNAME** record). All the official rules live
in data files rather than inside the program (**rules as data**, **versioned
JSON**), along with last season's thresholds (**cutoffs**), typical tournament
sizes (**attendance baselines**), this season's schedule (**event catalog**),
and a once-a-day photo of the live leaderboard (**static snapshot**). Your plans
save automatically inside your own browser (**localStorage**, **autosave**) and
can be moved as a downloadable file (**JSON export/import**).

The math lives in one sealed box that only takes inputs and returns answers,
never touching the screen or the internet (**pure function**). That means the
same inputs always give the same answer (**deterministic**), and ties are broken
the same way every time (**stable tie-break**). Scoring one result is just
looking it up in the price list (**lookup**).

The main feature, "the ladder," works backwards: it asks *what's the worst I
can do at each tournament and still make it?* (**constraint solver**).
Tournaments you haven't played are the blanks to fill (**unknowns**); ones you
have played are fixed facts (**constraints**); ones whose date passed without a
result are left out (**excluded**). It starts by assuming you win everything,
then eases off the hardest tournaments first (**lexicographic relaxation**), in
groups (**tiers**) where every event is eased by the same amount at once
(**lockstep**, measured in finishing ranges like Top 8 or Top 64 —
**brackets**). It eases each group as far as it can before moving on
(**greedy** search). It tells you whether the goal is reachable at all
(**feasibility**) and by how much you'd fall short (**shortfall**). To prove it
isn't fooling itself, the tests try every possible combination and check the
ladder picked the easiest one that works (**brute-force enumeration**).

Since you can't know how many people will attend a future tournament, the app
estimates (**projection**) from last season (**baseline**), using the middle
value rather than the average (**median** vs mean) so one tiny event doesn't
drag it down (**outlier**) — or uses a round number the owner chose on purpose
(**stated assumption**). You can type your own guess for any one event
(**per-event override**). The project is careful about which mistakes you'd
notice: guessing too small shows a suspicious zero, guessing too big quietly
over-counts (**asymmetric error**), so real attendance is looked up once events
finish.

The data comes from small programs that read other websites automatically
(**web scraping**). The official leaderboard has a hidden data feed nobody
advertises (**undocumented API**), found by searching the site's own code
(**bundle**); some IDs are tucked inside the page's content data (**CMS
payload**). Other sites are read by pattern-matching their page text (**regex
parsing** of **HTML**). The scripts announce who they are (**user-agent**),
check each site's "please don't crawl here" file (**robots.txt**) — one script
knowingly overrides it at the owner's direction — go slowly, one request every
four seconds (**rate limiting**), save pages locally so a re-run doesn't ask
again (**on-disk cache**), and keep only a head count, never names (**data
minimization**). Numbers are compared against other sources
(**cross-check**). The schedule script refuses to save an empty or
last-season list (**publish guard**), and the counting scripts only print what
they'd change unless told to save (**dry run**).

GitHub's built-in robot (**GitHub Actions**) runs these daily on a timer
(**cron schedule**), saves only real changes, then deliberately pokes the
publishing step (**workflow_dispatch**), because robot-made saves don't set off
other robots (**GITHUB_TOKEN** rule). If a fetch fails, the old data stays,
clearly labelled as old (**graceful degradation**). Before anything goes live,
the code must pass type checks, tests, a build and a real-browser click-through
(**CI gate**, **end-to-end smoke test**), one publish at a time (**concurrency
group**).

On screen, the page is built from reusable pieces (**React function
components**) with built-in helpers for memory and behaviour (**hooks**), and
it avoids redoing expensive math unless inputs change (**memoized**). The
number boxes are fully controlled by the program (**controlled inputs**)
through one shared helper (**custom hook**) that remembers exactly what you're
typing (**draft state**) — this fixed a bug where an empty box snapped back
because "empty" and "use the default" were stored the same way (**sentinel
value**). Plans saved by older versions get converted when loaded (**data
migration**), and imported files are checked by hand-written rules that answer
either "ok, here it is" or "no, here's why" (**hand-rolled validation**,
**discriminated union**). The look comes from a shared colour kit copied into
the project (**design tokens**, **CSS custom properties**); the totals stay
pinned at the top while you scroll (**sticky header**); digits are all the same
width so columns line up (**tabular figures**); it reshapes for phones
(**responsive**); buttons announce their state to screen readers (**ARIA**); it
follows your light/dark and reduced-animation settings
(**prefers-color-scheme**, **prefers-reduced-motion**); and the calendar button
uses a newer browser feature where available, falling back gracefully
(**progressive enhancement**). The version number is baked in when the site is
built (**build-time constant**).

We wrote a requirements document first (**PRD**), shipped version 1, decided it
asked far too much of the user (**over-engineered**), and rebuilt it the same
day, writing down why each choice was made and reversed (**retrospective**).
Each release gets a numbered version (**semantic versioning**) and a note
explaining why (**changelog**). The official price lists are pinned by tests
that compare them word for word (**verbatim fixture tests**); the math by small
automated checks (**unit tests**); and the finished site by a robot that clicks
through it in an invisible browser (**Playwright**, **headless browser**). New
checks were proven to catch the old bug before being kept (**regression
test**, **fail against the old build**). The daily-update routine was
**borrowed** from the sibling pokemon-majors-map project.

---

## 3. Glossary — term → meaning → where it happened here

### Play! Pokémon rules (the domain)

| Term | Plain meaning | In this project |
|---|---|---|
| **Championship Points (CP)** | the points that decide who gets invited to Worlds | every total on the page; tables in `src/data/rules-2027.json` |
| **rating zone** | the region of the world you compete for invites in | NA, EU, LA, AP, SO — chosen per plan; drives cutoffs and baselines |
| **invitation slot** | one of a fixed number of Worlds invites per zone | `invitationSlots`: 90 for VGC NA, 140 for TCG NA |
| **invitation boundary / cutoff** | the points held by the last person who got in | 842 CP = VGC NA rank 90 in 2026 (`cutoffs.json`); the default CP Goal |
| **payout table** | the price list: how many points each finish earns | `placementTables` — leagueChallenge, leagueCup, major, international, onlineChallenge |
| **placement band** | a range of finishes that pays the same | e.g. 3rd–4th = one band; "3rd place" never appears alone, so it reads "Top 4" (`finish.ts`) |
| **kicker** | the minimum turnout for a band to pay at all | a Top 512 Regional pays 0 with 1,024 players and 45 CP with 1,025 (`calculate.test.ts`) |
| **field size / turnout** | how many players entered | the Players box; real counts for finished majors, assumed for the rest |
| **Best Finish Limit (BFL)** | only your best N results of a kind count | Regional/Special/International share one limit of 5; Cups 4; Challenges 4; the `BFL 3/5` chip |
| **displacement** | a new result counts only by pushing out a weaker one | `applyBfl()`; why AVAILABLE shows 1,750 for eight blank majors, not 2,800 |
| **direct invitation** | a finish that earns a Worlds invite outright | 1st at a Regional/Special, top 4 at an International (`directInvitePlacesThrough`) |
| **locals vs majors vs online** | small in-store events, big weekend championships, internet ladders | `scale`: local (Cup, Challenge), major (Regional, Special, International), online (Global/Grand Challenge, GBL) |

### Planning & the solver

| Term | Plain meaning | In this project |
|---|---|---|
| **pure function** | code that only turns inputs into outputs, touching nothing else | the whole `src/domain/` engine; the app injects scraped turnout *before* calling it to keep it pure |
| **deterministic** | same inputs, same answer, every time | a `solveLadder` test asserts it; ties never depend on luck |
| **stable tie-break** | when two things are equal, keep their original order | BFL sorting falls back to the row's input order |
| **lookup** (vs judgment) | reading an answer off a table instead of deciding | v2.8 made `(placement, turnout) → CP` a pure table lookup |
| **constraint solver** | a program that finds values meeting a goal under fixed rules | `solveLadder()` in `ladder.ts` |
| **unknowns / constraints** | what the solver picks vs what it must respect | blank rows are solved for; rows with a placement are fixed |
| **excluded (past, unplayed)** | dropped because it can no longer happen | an event whose date passed with no result is not solved for (v2.1 fix) |
| **lexicographic relaxation** | easing demands in a strict priority order, hardest first | never asks Top 32 at a 1,100-player International when winning two Cups is easier |
| **tier / lockstep** | a group eased together, all by the same step | `RELAX_TIERS`; fixed "Top 512 at an International and Top 8 at a Global Challenge" (v2.9) |
| **bracket** | a finishing depth: 1, 2, 4, 8 … 1024 | shared by the major, international and online tables, so Top 64 means Top 64 everywhere |
| **greedy search** | take the best step now, one group at a time, never go back | each tier is pushed to its deepest reaching bracket before the next |
| **feasibility / shortfall** | can the goal be reached, and by how much it misses | "Winning every event you have added reaches X CP, Y short" note |
| **brute-force enumeration** | try every combination and pick the best | the test scoring all 11³ bracket combinations against four plans |
| **invariant** | a rule that is always true | a band's kicker always exceeds its own last place, so a too-small turnout already scores 0 (tested across every table) |

### Estimating attendance

| Term | Plain meaning | In this project |
|---|---|---|
| **projection** | an estimate of a future number | field size for a planned major (`projectedField()`) |
| **baseline** | the reference figure an estimate starts from | `attendance-baselines.json`, built from last season |
| **median vs mean** | the middle value vs the average | median chosen because one 43-player Auckland Special dragged Oceania's mean below three of its four events |
| **outlier** | one value far from the rest | that 43-player Special; the smallest-2026-Regional-at-180 figure v1 applied everywhere |
| **stated assumption** | a round figure chosen on purpose, not measured | VGC: Regionals/Specials 500, Internationals 1,000, Global Challenges 3,000; Cups 32, Challenges 16 |
| **per-event override** | your own number for one row beats the season figure | a Regional declared at 900 unlocks the 129–256 band that 500 cannot (v2.10.1) |
| **asymmetric error** | one kind of mistake is visible, the other silent | a too-high median scored a worthless 17th at 160 CP silently — why real turnout is now counted |

### Data & state

| Term | Plain meaning | In this project |
|---|---|---|
| **rules as data** | keep rules in data files, not in program code | CP tables in JSON with `rulesVersion`, `verifiedAt`, `verifiedBy` |
| **versioned JSON** | structured text data with a version stamp | `rules-2027.json` (2027.1.0), plan files with `schemaVersion: 1` |
| **static snapshot** | a saved copy of live data, refreshed on a timer | `public/data/leaderboard-snapshot.json`, fetched once at page load |
| **localStorage / autosave** | the browser's small private storage, saved on every change | keys `cpc.paths.v1`, `cpc.activePath.v1`, `cpc.theme` in `store.ts` |
| **JSON export/import** | save a plan as a file, load it elsewhere | Blob download and file-input import in `App.tsx` |
| **data migration** | converting old saved data to the new shape on load | `migrateAward()` turns a pre-v2.8 CP award into the placement + turnout that produce it |
| **sentinel value** | a special value that means "nothing here" | `null` meant both "not entered" and "cleared" — why fields couldn't be emptied |
| **hand-rolled validation** | checking data with your own code, not a library | `parsePath()` / `validateRules()` in `schema.ts`, to stay dependency-free |
| **discriminated union** | a type that is one of several labelled shapes | `Validation<T>` = `{ ok: true, value }` or `{ ok: false, errors }` |
| **ISO 8601 date** | the `YYYY-MM-DD` date format | every date in the app; Global Challenges use `2026-09-00` for "month only" |

### Scraping & the data pipeline

| Term | Plain meaning | In this project |
|---|---|---|
| **web scraping** | a program reading a website to extract data | the five `scripts/*.mjs` |
| **undocumented API** | a data endpoint that exists but isn't advertised | `api.play.pokemon.com/services/spar/leaderboards/`, found by grepping the site's `bundle.js` |
| **bundle** | the single combined code file a website ships | the official site's `bundle.js`, where the API call was visible in cleartext |
| **CMS payload** | page content data embedded by a content system | the `encodedData` blob holding `periodsjson_t` season GUIDs |
| **regex parsing of HTML** | pulling data out of page text with pattern matching | Limitless tournament tables read with `/<tr…>/` patterns, no HTML library |
| **user-agent** | the name a program gives when it visits a site | `championship-points-calculator/1.0 (+github URL)` |
| **robots.txt** | a site's file saying what crawlers may visit | rk9 disallows `/roster/`; two scripts override it at the owner's direction, so they are not in CI |
| **rate limiting** | deliberately slowing requests to avoid burdening a site | sequential, 4,000 ms `DELAY_MS` between rk9 requests |
| **on-disk cache** | saved copies so a re-run needn't fetch again | `.cache/rk9/*.html` (git-ignored) |
| **data minimization** | keep only the data you actually need | rosters counted and discarded — one integer per event leaves the script |
| **cross-check** | confirm a number against an independent source | Seattle 2026 VGC: Limitless 822 vs rk9 821; Orlando GO 156 vs 174 still unresolved |
| **publish guard** | refuse to save data that looks wrong | `refresh-catalog.mjs` rejects an empty or out-of-season catalog — the first version silently published last season's events |
| **dry run** | show what would change without changing it | `refresh-event-attendance.mjs` defaults to printing; `--write` saves |

### Build, deploy & CI

| Term | Plain meaning | In this project |
|---|---|---|
| **static single-page application** | a site that is just files, one page updated in place | the whole app; **no runtime backend**, no accounts |
| **React / TypeScript** | a UI-building library / JavaScript with type checking | `App.tsx`, `components/`; `tsconfig.json` in `strict` mode |
| **Vite** | a fast build tool and dev server | `npm run dev` on :5173; `vite build` to `dist/` with source maps |
| **build-time constant** | a value baked into the code when it's built | `__APP_VERSION__` from `package.json`, via Vite `define` |
| **GitHub Pages / custom domain / CNAME** | free GitHub hosting / your own web address / the DNS record pointing to it | `points.georgiaplayevents.com` → `pizzacatz.github.io`; `public/CNAME`; `base: '/'` |
| **GitHub Actions / cron schedule** | GitHub's automation robots / run on a timer | `refresh-leaderboard.yml` (09:17 UTC) and `refresh-events.yml` (09:41 UTC) daily |
| **workflow_dispatch / GITHUB_TOKEN** | manually triggering a workflow / the robot's own login | robot commits can't trigger deploys, so each refresh runs `gh workflow run deploy.yml` |
| **graceful degradation** | lose freshness, not the whole feature | a failed refresh keeps the last snapshot, labelled stale; a failed scrape files a GitHub issue |
| **CI gate** | checks that must pass before release | `deploy.yml`: typecheck → Vitest → build → Playwright smoke → publish |
| **concurrency group** | only one run of a job at a time | `group: pages`, `cancel-in-progress: false` so a live deploy is never left half-done |

### Interface

| Term | Plain meaning | In this project |
|---|---|---|
| **function components / hooks** | UI pieces written as functions / React's built-in helpers for state and effects | `PlanRow`, `LadderPanel`, `EventCatalog`; `useState`, `useEffect` |
| **memoization** | remember a computed result until its inputs change | `useMemo` around `evaluatePath` and `solveLadder` in `App.tsx` |
| **controlled input** | a form box whose value the program owns | every number field; value always comes from state |
| **custom hook / draft state** | your own reusable helper / what's being typed right now | `useNumberField` — one fix for Placement, Players and CP Goal (v2.10.3) |
| **design tokens / CSS custom properties** | named shared style values / CSS variables | `src/brand/tokens.css`, **vendored** (copied, not linked) from GeorgiaPlayEventsAssets |
| **sticky header** | a bar that stays at the top while you scroll | the CP NOW · TO GO · GOAL · AVAILABLE totals |
| **tabular figures** | digits all the same width so numbers line up | `font-variant-numeric: tabular-nums` on dates and CP columns (v2.5) |
| **responsive** | layout that adapts to screen size | `@media (max-width: 560px)`; the 320px overflow check in the smoke test |
| **ARIA** | labels that tell screen readers what controls do | `aria-pressed` on filters and theme toggle, `aria-expanded` on zone toggles |
| **prefers-color-scheme / prefers-reduced-motion** | the user's OS-level dark-mode and animation settings | `useTheme()` default; animations off in `styles.css` |
| **progressive enhancement** | use a newer feature where supported, fall back otherwise | date button calls `showPicker()`, else just focuses the input |

### Process & engineering practice

| Term | Plain meaning | In this project |
|---|---|---|
| **PRD** | a product requirements document | `Championship-Points-Calculator-PRD.md` (v2); v1 archived in `docs/` |
| **over-engineered** | more machinery than the problem needs | v1's 34 inputs to log three events; three path generators replaced by one ladder |
| **retrospective** | a write-up of what was decided, reversed, and learned | `docs/DESIGN-RATIONALE.md` — "what would have to change for it to stop being needed?" |
| **semantic versioning / changelog** | major.minor.patch numbers / a log of every release and why | `package.json` 2.10.4; `CHANGELOG.md` |
| **unit tests (Vitest)** | small automated checks of individual functions | `tests/calculate.test.ts`, `ladder.test.ts`, `rules.test.ts` |
| **verbatim fixture tests** | tests pinning data exactly as published | `rules.test.ts` asserts the Regional/Special table word for word so a typo can't ship |
| **end-to-end smoke test / Playwright / headless browser** | drive the real built site in an invisible browser | `tests/smoke.spec.mjs` against `vite preview` on port 4188 |
| **regression test** | a test that stops an old bug coming back | the "every number field can be cleared" sweep, confirmed to **fail against the old build** first |
| **borrowed pattern** | reusing a proven approach from another project | scrape → never publish a failed scrape → commit only changes → kick the deploy, from sibling **pokemon-majors-map** |
