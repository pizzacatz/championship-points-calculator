# Notes for the next version

Working notes, not a spec. Nothing here is implemented — the deployed site is
unchanged. Raised 2026-08-28 after the first version was judged over-engineered
and over-designed.

## Verdict on v1

2,511 lines across 17 files, a 247 KB bundle and a build toolchain, to add up
some numbers. The valuable output of that work is the **data** and the **CP
engine**; the rest is scaffolding added because the PRD listed it.

| Piece | Lines | Call |
|---|---:|---|
| Path generator — 3 strategies, brute-forces 200k combinations | 250 | Cut. Speculative, never asked for |
| Multi-path, switcher, JSON import/export, schema validation | 300 | Cut. One plan in localStorage covers it |
| Attendance baselines — 3 sources, generator, provenance panel | 400 | Cut from the app; a "players" field does the job |
| Daily leaderboard refresh workflow | 180 | Cut. The boundary moves once a season |
| React + Vite + TypeScript | — | 247 KB for a form and a sum |
| **CP engine — kickers, BFL, displacement** | 290 | **Keep. This is the product** |
| **Verified CP tables + cutoffs** | ~5 KB | **Keep. The expensive part to get right** |

Target shape: one HTML file, ~500 lines including CSS and inlined data. No npm,
no build, no CI. Deploy is `git push`.

## Requested changes

### Footer sections to remove

Delete these four blocks from the page entirely:

- **Method, sources and limits**
- **Direct invitations** (the list of direct-invite rules)
- **Official sources** (the list of championships.pokemon.com URLs)

The material is not lost — it lives in `README.md` and `docs/DATA-SOURCES.md`.

**What survives, and must:** the *"target reached ≠ qualified"* callout and the
*"below last season's minimum"* callout are rendered in the target strip, not the
footer, so removing the footer does not touch them. PRD §3 turns on those staying,
so re-check after the cut.

**What is genuinely lost:** PRD FR-8 asks the app to display the rules version,
the last verified date, official source links, and a notice when data is stale.
The subtle version string below is the proposed replacement — see the note there
about making it a link, which recovers most of FR-8 for almost no visual weight.

### Versioning in the page footer

Add a version string at the bottom of the page in **subtle, non-obvious text** —
present for anyone who goes looking, invisible to anyone who isn't. Low contrast,
small, no heading, no label.

Open questions for whoever builds it:

- **Make it a link?** If the string links to the repo (or to the exact commit),
  FR-8's source-transparency requirement is largely satisfied by one line of
  subtle text rather than three footer sections. Recommended.
- **What does it version — the app or the rules data?** These drift apart: the CP
  tables carry their own `rulesVersion` and `verifiedAt`. A player who cares is
  almost certainly asking "are the point values current?", which argues for
  surfacing the rules version, or both.

## The form — decided 2026-08-28

The stack is fine. React, Vite, TypeScript, the refresh scripts and the CP engine
all stay. **The problem is the form**: 7 settings fields, 9 fields per event, 7
panels and 6 stat cards. Logging three events means facing 34 inputs.

### CP is the input; placement is output

The key realisation. The engine needs, per completed result, only the **event type**
and the **CP awarded** — nothing else. Because:

> Every CP value is distinct within its event type's table. Verified across all
> five tables: League Challenge (6 bands), League Cup (7), Regional/Special (11),
> International (11), Online Challenge (11). No duplicates anywhere.

So CP is a unique key into the payout table, and typing it recovers the placement
band, the kicker threshold and direct-invite eligibility for free:

```
Regional, 350 CP  ->  1st          kicker 0      direct invitation
Regional, 200 CP  ->  9-16 band    kicker 33
Regional,  45 CP  ->  257-512      kicker 1,025
```

This deletes three fields at once. **Placement** is redundant. **Attendance** is
redundant, because a valid positive CP award already proves the kicker was met —
that logic is in `evaluateResult` today. And validation gets *stronger* while
getting simpler: a value is legal iff it appears in that event type's table (or is
0). No cross-field checks, no impossible placement/CP combinations to reconcile.

Placement moves to where it belongs — the generator's output. "Finish top 16 at
Orlando" is the answer, not the question.

### Resulting form

| | Today | Next |
|---|---:|---|
| Settings fields | 7 | Game, rating zone. Age division is always Masters — drop the disabled control |
| Fields per completed event | 9 | **1** — the CP |
| Fields per planned event | 9 | **0** — add it and let the generator say what you need |
| Stat cards | 6 | **3** — CP now, projected, to go |

The three target-related cards (planning target, previous cutoff, live boundary)
are one concept, not three. Collapse to a line under the cards:
`target 842 · 2026 cutoff · edit`.

### Input: placement OR CP, whichever you remember

Not everyone recalls that a 9th–16th at a Regional pays 200. So the row offers
**both** fields and you fill either one; each derives the other.

- **CP entered** -> band, kicker and direct-invite status all follow, since CP is a
  unique key into the table.
- **Placement entered** -> the band follows immediately, but if that band has a
  nonzero kicker the CP is unresolved until the field size is known.

That gap is closed by pulling real attendance from rk9 (below). Which produces a
clean split worth designing around:

| Event kind | On rk9? | Reliable input |
|---|---|---|
| Regional, Special, International | yes | **placement** — attendance comes from rk9 |
| League Cup, League Challenge | no | **CP** — nothing else can resolve the kicker |

CP is a plain number box, not a dropdown.

### Blank means "I'm going"

A **major** added with no CP and no placement is an expression of intent to attend.
It stays in the plan and participates in the final calculation and the generator —
that is how you ask "what do I need at the events I'm already going to?"

Every added event is assumed attended. **Commitment is implied by adding it**, so
the commitment field disappears.

> Consequence: this makes the third generator strategy degenerate. "Best use of
> committed events" maximises committed events used and minimises optional ones —
> but if everything is committed there are no optional ones left to minimise. It
> collapses toward "use every event", which is close to what least-demanding
> already returns. Either reframe it as an explicit *spread across everything*
> (maximise event count, then minimise difficulty — a genuinely different axis from
> least-demanding's ordering) or drop to two strategies. **Open.**

### Kill the field subtitles

Every field currently carries a `.hint` line explaining it. Remove them. With
attendance, commitment, best-finish, notes and date all gone, the remaining inputs
are self-evident from their labels.

### Attendance baselines: regional median, not global low

Two reversals of earlier decisions, both correct:

1. **A central figure, not the single lowest.** The PRD specified the lowest
   observed field.
2. **Split by the event's region**, which PRD §16 Q2 explicitly recommended against.
3. **Median, not mean** — see below. Pooling Specials in introduces low outliers,
   and the mean cannot survive them.

The data shows why. VGC Regionals, 2025–26, from Limitless (`&region=` filter):

| Region | n | min | avg | max |
|---|---:|---:|---:|---:|
| North America | 9 | 542 | **732** | 1,013 |
| Europe | 7 | 415 | **594** | 742 |
| Latin America | 7 | 180 | **226** | 282 |
| Oceania | 3 | 210 | **260** | 291 |

Today a single global baseline of 180 — Curitiba, a Latin American event — is
applied to every planned Regional, including North American ones averaging 732. A
4x understatement that suppresses bands NA players would comfortably reach.

Note this is the region of **the event**, not the player's home zone, which keeps
§16 Q2's actual reasoning intact: kicker eligibility depends on the field you turn
up to.

### Median, not mean — everywhere

Use the **median** for every baseline. The pooled per-region distributions are not
symmetric, and the outliers all sit on the low side because that is exactly what
folding Specials in introduces:

| Region | n | mean | **median** | values |
|---|---:|---:|---:|---|
| NA | 10 | 669 | **707** | 99, 542, 625, 676, 705, 709, 746, 750, 822, 1013 |
| EU | 9 | 633 | **661** | 415, 418, 558, 595, 661, 679, 688, 742, 940 |
| LA | 9 | 195 | **214** | 77, 93, 180, 185, 214, 220, 234, 270, 282 |
| OC | 4 | 206 | **244** | 43, 210, 278, 291 |

The median is higher in all four, but the size of the gap is not the point — the
shape is. Look at Oceania: the mean of 206 sits **below three of the four actual
events**. One 43-player Auckland Special drags the "typical Oceania field" beneath
almost every field Oceania actually ran. That is not a defensible projection. The
median of 244 sits inside the real cluster.

North America is the same story: nine events between 542 and 1,013 plus a single
99-player San Juan Special, and the mean quietly answers to that one event.

**Median also mitigates the Internationals' growth lag.** With three points from a
growing series the median is the middle year, which drops the oldest and smallest:

| | mean | **median** | most recent |
|---|---:|---:|---:|
| NAIC VGC | 1,049 | **1,096** | 1,096 |
| EUIC VGC | 1,229 | **1,257** | 1,455 |
| NAIC TCG | 3,419 | **3,752** | 3,752 |
| EUIC TCG | 3,325 | **3,361** | 4,010 |

So one change fixes both problems: outlier sensitivity in the pooled regional data,
and the trailing-mean bias flagged for the ICs.

**Even-count convention:** round **down** rather than interpolating. It matches the
CP rule elsewhere and keeps the projection on the conservative side.

> Trade-off, accepted: a central figure means roughly half of events run smaller
> than projected, so some bands will be claimed that are not reached. Exposure is
> limited to events that have not happened yet, because anything already run gets
> real attendance from rk9.

### Specials fold into their region's pool

Do not hold a separate Specials baseline. Assign each Special to the region it is
held in and average it together with that region's Regionals.

Checked before adopting, because it only works if the two are comparable — and
Specials turn out **not** to be systematically smaller:

| Region | Regionals | Specials | Combined | Shift |
|---|---|---|---:|---:|
| NA | n=9 avg 732 | San Juan 99 | **669** | −63 |
| EU | n=7 avg 594 | Turin 940, Seville 595 | **633** | +39 |
| LA | n=7 avg 226 | Lima 77, Buenos Aires 93 | **195** | −31 |
| OC | n=3 avg 260 | Auckland 43 | **206** | −54 |

Turin drew more than most Regionals; Auckland drew 43. Every shift is under 9%,
and merging fixes sample sizes of one or two events, so the combined pool is more
robust than either alone. (VGC, 2025–26.)

### Internationals: three-year median, per event

Each International keeps its own baseline, taken over the last three seasons —
they are not interchangeable and there is only one of each per year.

| | 23–24 | 24–25 | 25–26 | **3yr median** |
|---|---:|---:|---:|---:|
| NAIC VGC | 921 | 1,129 | 1,096 | **1,096** |
| EUIC VGC | 975 | 1,257 | 1,455 | **1,257** |
| LAIC VGC | 393 | 455 | 518 | **455** |
| NAIC TCG | 2,692 | 3,812 | 3,752 | **3,752** |
| EUIC TCG | 2,605 | 3,361 | 4,010 | **3,361** |
| LAIC TCG | 1,263 | 1,810 | 2,117 | **1,810** |

> Note: every series is growing, so any trailing figure under-projects. The median
> of three points is the middle year, which drops the oldest and smallest and so
> lags less than the mean would. Residual lag remains (EUIC VGC's 1,257 against a
> most-recent 1,455) and is the **safe** direction for kickers — fewer bands claimed
> than will be reached.

### Two plans, not three strategies

Replace least-demanding / fewest-events / best-use-of-committed with two plan
shapes that map to a decision players actually make:

- **Region plan** — using only events in your own rating zone.
- **International plan** — including the Internationals, i.e. what it takes if you
  are willing to travel.

This answers "do I have to fly to an IC to make it?", which is the real question,
and it dissolves the degenerate third strategy entirely. Default to the region
plan; tab or radio to the international plan; "View both" after.

One ordering rule still runs underneath both — **least demanding** is the natural
choice, so each plan returns the easiest set of finishes that reaches the target
from its own pool of events.

**Internationals belong to their host region.** An International sits in the plan
of the region that hosts it, because it genuinely is a more viable option for
someone already living there. For the 2027 season:

| International | Host region | In the home plan of |
|---|---|---|
| LAIC — São Paulo, Nov 2026 | Latin America | LA players |
| EUIC — London, Feb 2027 | Europe | EU players |
| NAIC — Chicago, Jun 2027 | North America | NA players |

So an NA player's home plan is NA Regionals + NA Specials + NAIC, and only EUIC
and LAIC require the travel plan. That is a sharper division than "majors here vs
Internationals" — it is **what I can reach without flying abroad** versus **what
opens up if I will**.

> **Naming hazard, now sharper.** With NAIC inside an NA player's region plan, a
> plan called "international" would exclude an International Championship while a
> plan called "region" contains one. Rename both: **Home plan** and **Travel plan**,
> or "without travel" / "with travel". Avoid "international" as a plan name — it
> already names an event type.

> **Second naming hazard, unchanged.** Host region governs *plan membership only*.
> It does not change which baseline an International uses — NAIC still projects
> from its own three-season median of 1,096, whether it appears in a home plan or a
> travel plan. Keep "which plan is this event in" and "which baseline does it draw
> from" visibly separate.

> **Asymmetry to surface honestly.** No International is hosted in Oceania or in
> Middle East & South Africa, so players in those zones have no IC in their home
> plan at all — every IC is a travel event for them. Combined with small local
> fields and few slots (VGC: AP 20, SO 5), their home plan is structurally thinner
> than an NA or EU player's. The UI should not imply parity between the two plans
> across zones.

### Rating zone stays a dropdown

Do **not** infer the player's rating zone from the regions of the events they add.
Considered and rejected. CP is portable but leaderboards are not — a Georgia player
who wins EUIC banks 500 CP on the *North America* leaderboard — so event locations
carry no information about which leaderboard a player is ranked on.

The decisive failure: Middle East & South Africa has almost no local majors, so a SO
player's plan is mostly European events and the inference would classify them EU.
That shows them a VGC target of 799 instead of **257**, and 90 slots instead of 5. A
qualified player at 300 CP would be told they are 500 short. The error is systematic,
it targets the players with the fewest local options, and it points in the direction
that makes people quit.

Lesser flaws: the classification flips as events are added, silently moving the
headline gap-to-target; ties are undefined; a single event makes it "certain".

Using event location to decide **which events to suggest** and **what belongs to the
home plan** is fine — that genuinely is geography. Only wiring it to rating zone,
which drives the target and the leaderboard, breaks.

### Blank solves, filled constrains

- An event left **blank** is what the app solves for — it computes the finish you
  would need there.
- An event with a **CP or placement filled in** is a fixed constraint, and the
  remaining blank events are calculated around it.

So a plan is a mix of knowns and unknowns, and the generator fills the unknowns.

### Cups and Challenges: auto-filled default

A planned Cup or Challenge auto-fills with **the middle CP a player can earn,
assuming they earn anything at all** — the midpoint of that event's payout tiers
excluding 0, rounded **down** when the count is even.

| Event | Tiers (excluding 0) | Default | Finish |
|---|---|---:|---|
| League Challenge | 4, 6, 8, 10, 12, 15 | **8 CP** | 5th–8th |
| League Cup | 13, 16, 20, 25, 32, 40, 50 | **25 CP** | 5th–8th |

Both land on a 5th–8th finish, which is a sane default for a planned local.

This is not a statistical mean over the player's history. It is the middle of the
table — a neutral assumption that needs no history and works for a first-time user.

The rationale for defaulting at all: Cups and Challenges carry their own Best
Finish Limit of 4 each, so a finish below what a player typically manages does not
improve their total. Filling in a mid-table result models the realistic case rather
than a bottom-of-table one that would be discarded by the BFL anyway.

### Kept as-is

Multi-path, JSON export/import and the theme toggle all stay. The toggle needs to
look better than a text button — a sun/moon icon.

### Live attendance and kickers from rk9

For events that use rk9, read actual attendance and recompute kickers from it
rather than from any projection. This is what makes placement-only entry work for
majors, and it turns a registration count into a live kicker forecast for events
still filling up.

Scope it deliberately: only events in the user's own plan, once a day, cached.
Sweeping every event continuously is a lot of traffic against live tournament
infrastructure, on a path its `robots.txt` disallows.

### Auto-fill by region

Buttons that add every published Regional for a region in one click — one for
North America/Canada, one for Europe, one for Latin America, and so on.

Source: `rk9.gg/events/pokemon`, which **robots.txt permits**. It returns 39
upcoming 2027 events with date, event name, location and one tournament id per
game:

```
September 18-20, 2026 | 2027 Baltimore Pokemon Regional | Baltimore, US      | 3 games
September 26-27, 2026 | 2027 Brisbane Pokemon Regional  | South Brisbane, AU | 3 games
October 3-4, 2026     | 2027 Recife Pokemon Regional    | Olinda, PE, BR     | 3 games
```

Region comes from the trailing country code in the location, via a country ->
rating-zone map. The page is upcoming-only, which is exactly right for planning a
season in progress.

### Panels

- **Best Finish Limit breakdown** — keep the table, move it to the bottom.
- **Generated paths** — keep all three strategies. Default to *least demanding*
  alone, with radio buttons or tabs to switch, and a "View all 3" button after.
- **Attendance baselines panel** — remove. The verified baselines keep working
  silently in the background for planned majors; they just get no UI.
- **Method and sources / Direct invitations / Official sources** — remove, per the
  section above.

### Consequences to handle

- The generator currently reads a **best finish to assume** and a **commitment**
  flag from every event row. Keeping all three strategies means deciding where
  those live now that rows have no fields — an advanced toggle, a global default,
  or drop the constraint entirely.
- With attendance gone from the form, planned majors rely entirely on the silent
  baseline to know which bands are reachable. That is the one place the removed
  data still does real work.
- Direct-invite detection currently keys off placement. It must key off CP instead
  (350 at a Regional, 500/480/420/380 at an International).

## Carried over from v1

Unfinished business that survives any redesign:

- **Pokémon GO attendance is unresolved.** rk9 says 156 for Orlando 2026 GO,
  Liquipedia says 174 — an 11.5% disagreement in the unintuitive direction. All GO
  baselines are flagged unverified. Needs a Liquipedia sweep from an unblocked IP.
- **The GO Special baseline (93) is from 2 of 6 events.** The other four are not on
  rk9 at all. Auckland — absent here — was the smallest field for both other games
  (80 TCG, 43 VGC), so 93 is very likely too high.
- **The 2027 leaderboard period was not open** as of 2026-08-28, so there is no
  live boundary yet. Whatever replaces the refresh job needs to handle that state.
