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

## Open decisions

Still undecided; these change what gets built.

1. **How far to strip the stack.** Single HTML file with no build (smallest,
   ~15 KB, edit one file) / vanilla TS with a minimal Vite build (keeps types on
   the CP logic, ~20 KB) / keep React and only delete features (least churn,
   still ~180 KB, since React alone is ~140 KB of that).
2. **Which cuts to take** from the table above — all four, or some.
3. **What happens to the data-collection scripts** (~500 lines): keep them out of
   the way in a `tools/` folder, delete them and rely on `DATA-SOURCES.md` to
   rebuild them, or keep only the leaderboard one since cutoffs are the only
   figures worth re-pulling.

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
