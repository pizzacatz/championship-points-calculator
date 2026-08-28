# Championship Points Calculator — PRD v2.0

**Version:** 2.0 · **Date:** 2026-08-28 · **Supersedes:** [v1.0](docs/PRD-v1.0-2026-08-28.md)
**Season:** 2027 Play! Pokémon Championship Series · **Division:** Masters only

## Why v2

v1 shipped and worked. It was also over-designed: 7 settings fields, 9 fields per
event, 7 panels, 6 stat cards — 34 inputs to log three events. The arithmetic, the
data and the refresh tooling were sound; the **form** was the problem.

v2 keeps the engine and the data. It rebuilds what the user touches.

## 1. The one question

> *"If I attend these events, what is the worst I can do and still qualify?"*

Equivalently, once results exist: *"given what is left in the season, how well do I
need to do?"* Same computation. That is the entire product.

## 2. Input model

### 2.1 CP or placement, whichever you remember

Each result takes **one number** — either the CP awarded or the final placement.
Each derives the other, because **every CP value is distinct within its event
type's table** (verified across all five tables). So 350 at a Regional *is* 1st
place, no kicker, direct invitation.

- **CP entered** → band, kicker and direct-invite status all follow.
- **Placement entered** → band follows; CP needs the field size when the band has a
  kicker, which comes from rk9 for majors.

| Event kind | On rk9 | Reliable input |
|---|---|---|
| Regional, Special, International | yes | placement or CP |
| League Cup, League Challenge | no | CP |

Attendance is never asked for. A valid positive CP award already proves the kicker
was met.

### 2.2 Blank means "I'm going"

A major added with no CP and no placement is intent to attend. It stays in the plan
and the ladder solves for it. Adding an event *is* committing to it; there is no
commitment field.

### 2.3 No field subtitles

Labels only.

## 3. The event catalog

A checklist, grouped by rating zone, **collapsed by default**, with per-zone bulk
actions and a count (`3 of 14`). The player's own zone is expanded.

- **Add all** takes every event in a zone; then uncheck what you cannot reach.
- Unchecking is as important as adding. Adding an event asserts you can attend it,
  so the calculator must never recommend an event the player did not choose.
- Internationals belong to their **host** region — NAIC sits in the NA group,
  because it genuinely is the reachable IC for someone already there.

| Events | Source | Notes |
|---|---|---|
| Upcoming | `rk9.gg/events/pokemon` | robots-permitted; 38 events for 2027 |
| Completed | Limitless | rk9 has no past-events view; Limitless is days behind |
| Cups, Challenges | manual | unlisted anywhere |

## 4. Output: the ladder

The **lowest finishes that still reach the target**, minimised lexicographically by
event type:

> International → Regional/Special → Grand Challenge → Cup → Challenge

Relax the hardest events first: never demand a top-32 at a 1,100-player IC when
winning two 40-player Cups is the more realistic ask. Whatever sits last absorbs the
residual demand — a solved plan often asks you to win your Cups. Intended.

**Only bands whose kicker is met may be offered.** Without this the solver relaxes
an IC to the 513–1024 band, which needs 2,049 players against a projected 1,096 and
pays nothing.

There are no strategies, no tabs and no path generator.

## 5. Projected field size

Used only to decide which bands a planned event's kicker unlocks.

| | Rule |
|---|---|
| Regional + Special | **median** of that zone's pool, both types together, previous season |
| International | **median** of that event's last three seasons |
| Global / Grand Challenge, GBL | no baseline — **assume every kicker is met** |
| Cup, Challenge | none published; unresolved until a CP is entered |

**Median, not mean.** Pooling Specials into a zone introduces low outliers —
Oceania's mean sits below three of its four actual events because of one 43-player
Auckland Special. Round down on an even count.

**Per zone, not global.** v1 applied a single baseline of 180 to every planned
Regional including North American ones that median 705.

Online events assume kickers met: Pokémon Champions has 10M+ downloads, and the GO
Battle League leaderboard is ranked globally.

## 6. Screen

1. **Header** — game, rating zone, path switcher, theme toggle (sun/moon icon).
2. **Three figures** — CP now, projected, to go. Target on one line beneath:
   `target 842 · 2026 cutoff · edit`.
3. **Event catalog** — collapsed checklist, per-zone bulk actions.
4. **Your plan** — one row per added event, one number each.
5. **The ladder** — what you need at each event type.
6. **Best Finish Limit breakdown** — the table, at the bottom.
7. **Version** — subtle, low-contrast, linked to the repository.

Removed from v1: *Method and sources*, *Direct invitations*, *Official sources*,
*Projected attendance for planned majors*, *Ways to reach your target*.

Retained: multiple paths, JSON export/import, local persistence, no accounts.

## 7. Honesty requirements (unchanged from v1)

These survive the footer cull because they render in the target strip:

- Reaching the target is **never** described as qualifying.
- Below the previous cutoff shows a plain notice.
- A direct invitation is reported when earned, independently of CP.

The version string links to the repository, where sources and method live.

## 8. Data provenance

Every CP table, Best Finish Limit, invitation slot and direct-invite rule is
transcribed from the official 2027 pages. Previous-season cutoffs come from the
official leaderboard API. See [`docs/DATA-SOURCES.md`](docs/DATA-SOURCES.md) for
every endpoint, parameter gotcha and cross-check.

## 9. Acceptance

- One number logs a completed result.
- A blank major is solved for by the ladder.
- The ladder never offers a band whose kicker is unmet at the projected field.
- Bulk-add then uncheck works; nothing not chosen enters the calculation.
- Best Finish Limits, displacement and current-versus-projected behave as v1.
- Reaching the target is never called qualification.
- The version is visible but unobtrusive.

## 10. Out of scope

Junior and Senior divisions, travel, cost, registration, probability of qualifying,
and any forecast of the final cutoff.
