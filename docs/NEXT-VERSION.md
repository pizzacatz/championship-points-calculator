# Notes for the next version

> **Superseded in part.** v2 shipped on 2026-08-28. Where this file and
> `UX-NOTES.md` disagree, UX-NOTES is current.

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

> Consequence: this made the third generator strategy degenerate — with everything
> committed there were no optional events left to minimise. **Resolved by deleting
> the generator entirely**; the ladder replaced all three strategies.

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

### One list, not two plans

Superseded: there is no "home plan" and no "travel plan". Every tournament involves
travelling to it — a Regional three hours away is travel too — so the distinction
was false.

**Region is an input affordance, not an output mode.** The region buttons exist to
*bulk-add* candidate events so you have something to plan over. They do not define
a plan, a scope, or a mode. There is exactly one list: the events you have added.

- Click **NA/CAN** to add every North American Regional at once.
- Then add or remove any individual event by hand.
- The calculator solves over whatever list results.

Internationals still belong to their host region for bulk-add purposes — NAIC comes
in with the NA button — because it genuinely is the more reachable IC for someone
already there. That is now purely about which button adds it, nothing more.

**This dissolves the Oceania / SO asymmetry.** That problem was an artefact of
framing two plans and implying they were comparable across zones. With one list
there is nothing to compare. An SO player adds whatever events they intend to enter,
the same as anyone else. Their target is still lower (VGC 257) and their slots fewer
(5), but that is data shown plainly, not a structural implication in the UI.

### The output is one ladder, not strategies

There are no strategies, no tabs and no generator. There is one question, asked two
ways — *"if I attend all these events, what is the worst I can do and still
qualify?"* and *"given what is left in the season, how well do I need to do?"* —
and they are the same computation. The second is the first, after results are logged.

**Fewest events answers a question nobody asked.** The checklist already settled
what you are attending; you unchecked what you cannot reach. By the time you are
reading output the event list is a given. You want the bar, not a shorter list.

#### What it computes

The **lowest finishes that still reach the target**, minimised lexicographically by
event type in this order:

> International -> Regional / Special -> Grand Challenge -> Cup -> Challenge

Relax the hardest events first. The planner should never open by demanding a top-32
at a 1,100-player International when winning two 40-player Cups is the more
realistic ask.

**Consequence, intended:** whatever sits last in that order absorbs the residual
demand. Relaxing ICs and Regionals pushes the requirement onto the small events,
which is why a solved plan often asks you to *win* your Cups. Correct advice, not a
bug.

#### Only offer bands whose kicker is met

Essential, not a detail. Without it the solver relaxes an International to the
513-1024 band, which needs 2,049 players against a projected field of 1,096 and so
pays **nothing**. Restrict each event type to the bands its projected field unlocks:

| | Projected field | Deepest band that pays |
|---|---:|---|
| International (NAIC) | 1,096 | 257-512, 85 CP |
| Regional / Special (NA) | 707 | 129-256, 60 CP |
| League Cup | ~40 | 5-8, 25 CP |

#### Online events: assume the kickers are met

Neither Global/Grand Challenges nor the GO Battle League Leaderboard Challenge has a
published field size, and no regional median applies — they are not regional.

**Assume every kicker is met for both.** Pokemon Champions, the 2027 video game
title, has 10M+ downloads; any plausible slice of that clears the deepest kicker in
the table (2,049). The GO Battle League leaderboard is ranked globally, so the same
holds more strongly still.

> Caveat, recorded not acted on: VGC Global Challenge CP is awarded on "final
> ranking of eligible competitors **per rating zone**", not globally, and Grand
> Challenges are limited to TPCi-managed regions — so the relevant field is one
> zone's slice. At 10M+ downloads this does not bite, and the exposure if it ever
> did is bounded: the bands in question pay 3-13 CP.

#### Worked example

Target 842, 232 CP banked, remaining: 1 IC, 3 Regionals, 2 Grand Challenges, 2 Cups,
2 Challenges.

| Event | | Finish | CP each |
|---|---|---|---:|
| International | x1 | 257-512 | 85 |
| Regional | x3 | 33-64 | 120 |
| Grand Challenge | x2 | 9-16 | 25 |
| League Cup | x2 | **1st** | 50 |
| League Challenge | x2 | 5-8 | 8 |

843 against a target of 842. Bands are discrete, so a small overshoot is normal.

#### What this deletes

The 250-line generator, three strategies, the 200,000-combination search, the "best
finish to assume" field, the commitment flag, the strategy tabs and the
Cup/Challenge auto-fill. Replaced by running the existing engine once per band per
event type and taking the boundary.

> Bulk-add stays safe regardless: twelve added Regionals cannot inflate a
> projection, because they share one Best Finish Limit bucket of five.

### Blank solves, filled constrains

- An event left **blank** is what the app solves for — it computes the finish you
  would need there.
- An event with a **CP or placement filled in** is a fixed constraint, and the
  remaining blank events are calculated around it.

So a plan is a mix of knowns and unknowns, and the generator fills the unknowns.

### No auto-fill for Cups and Challenges

Superseded. There is no assumed default CP for a planned Cup or Challenge — the
ladder decides what they must return, like every other event type. The earlier
"middle of the payout table" rule (Cup 25, Challenge 8) is dropped: it contradicted
the ladder, which will demand a Cup win if that is what reaches the target.

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

### The event catalog: a collapsible checklist

Bulk-add adds **every** event in a region. The catalog is a checklist, collapsed by
region, with bulk actions per group:

```
▾ North America / Canada        [ Add all · Clear ]    3 of 14
    ☑ Baltimore Regional        Sep 18–20
    ☐ Louisville Regional       Oct 9–11
    ☑ NAIC — Chicago            Jun 18–20
    …
▸ Europe                        [ Add all · Clear ]    0 of 11
▸ Latin America                 [ Add all · Clear ]    1 of 7
▸ Oceania                       [ Add all · Clear ]    0 of 4
```

Expand the player's own rating zone by default (that is what the zone dropdown is
already telling us); collapse the rest.

**Its real job is fast subtraction, not bulk-add.** "Add all NA" then letting the
output prune would have the calculator recommend Louisville, Baltimore and Portland
to someone who can only reach two of them. PRD §7 FR-3 is explicit — *do not infer
feasibility from travel, cost or availability*, and *only events explicitly added by
the player may participate* — precisely so that adding an event **is** the player
asserting they can attend it. Bulk-add-all reintroduces the problem that rule
exists to prevent.

So the checklist is "add all, then uncheck what you cannot reach", and unchecking
needs to be as fast as adding. That is the ergonomic that matters; the bulk button
alone is not the feature.

### Catalog source, and the gap in it

| Events | Source | Notes |
|---|---|---|
| Upcoming | `rk9.gg/events/pokemon` | robots-permitted. 39 events for 2027 with date, name, location, one tournament id per game |
| Past, this season | Limitless (`?time=<season>&type=…`) | rk9 has **no** past-events view; slugs must be guessed and a wrong one returns 500 |
| Cups and Challenges | manual entry | not in any catalog; they are local and unlisted |

**The gap:** a player joining mid-season has completed majors to log, and the rk9
catalog is upcoming-only. Those are exactly the events where they know their CP.
Either pull past events from Limitless or accept manual entry for them.

Region comes from the trailing country code in rk9's location string
("Baltimore, US", "South Brisbane, AU", "Olinda, Pernambuco, BR"), via a country →
rating-zone map that needs building. Game filtering is free: each event lists one
tournament id per game, so a VGC path attaches the VGC one.

> **Still open — carried into `UX-NOTES.md` §8.** Does the checklist *replace* the
> plan list, or sit above it? Checking a
> box and then seeing the same event again in a separate table is duplication. One
> option is that the catalog only ever shows what has **not** been added, so checked
> events move down into the plan and unchecking is the remove action. Fewer panels,
> no repetition — but it makes the catalog's contents shift as you work.

### Panels

- **Best Finish Limit breakdown** — superseded: the table is **deleted** and folded
  into the ladder. See `UX-NOTES.md` §3.3.
- **Generated paths** — removed entirely, replaced by the ladder above.
- **Attendance baselines panel** — remove. The medians keep working silently for
  planned majors; they get no UI.
- **Method and sources / Direct invitations / Official sources** — remove, per the
  section above.

### Consequences to handle

- Direct-invite detection currently keys off placement. It must key off CP instead
  (350 at a Regional, 500/480/420/380 at an International).
- With attendance gone from the form, planned majors rely entirely on the silent
  per-region median to know which bands are reachable. That is the one place the
  removed data still does real work.
- The ladder needs a projected field size per event type. Regions have medians;
  online events assume kickers met; Cups and Challenges have no source at all, so
  their kicker status is unresolved until a real attendance is entered.
