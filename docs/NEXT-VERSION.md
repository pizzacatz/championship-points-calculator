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

### Worth considering: make the CP field a dropdown

Since the legal values are a short fixed list per event type, the input could be a
`<select>` rather than a number box, each option labelled with both facts:

```
Regional Championship
  [ 350 — 1st                    v ]
    325 — 2nd
    300 — 3rd–4th
    200 — 9th–16th
      0 — below kicker
```

Zero typing, zero validation errors possible, and it serves both mental models —
pick by CP or pick by finish. Undecided.

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
