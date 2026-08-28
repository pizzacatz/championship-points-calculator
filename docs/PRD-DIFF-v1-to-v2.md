# PRD v1 → v2: what changed and why

A reading guide to the difference between
[v1.0](PRD-v1.0-2026-08-28.md) and [v2.0](../Championship-Points-Calculator-PRD.md),
both dated 2026-08-28. v1 shipped and worked; v2 is the same product with the form
rebuilt.

|  | v1.0 | v2.0 |
|---|---:|---:|
| Lines | 472 | **153** |
| Words | 3,982 | **1,032** |
| Top-level sections | 16 | **10** |
| Functional requirements | FR-1 … FR-8 | folded into 5 prose sections |

---

## 1. The thesis changed

**v1** opened with a product definition and a problem statement, then specified a
qualification planner: paths, catalogs, generators, summaries, explainability,
persistence, transparency. Eight functional requirements, each reasonable.

**v2** opens with a single sentence:

> *"If I attend these events, what is the worst I can do and still qualify?"*

Everything else is downstream of that. The shrink from 472 lines to 153 is not
compression — it is the removal of requirements that answered questions nobody
had asked.

---

## 2. Input: from 34 fields to one number

| | v1 | v2 |
|---|---|---|
| Settings | path name, game, rating zone, age division, target, attendance adjustment | game, rating zone |
| Per event | name, status, date, placement, CP, attendance, best-finish, commitment, notes | **CP or placement — one number** |
| Field help | a subtitle under every field | labels only |

v1's FR-2 required nine fields per result. Logging three events meant facing 34
inputs.

v2 asks for one, because of a property of the data nobody had noticed:

> **Every CP value is distinct within its event type's table** — verified across
> all five tables. So a CP award is a unique key into the payout table.

Typing `350` for a Regional therefore *is* typing "1st place, kicker 0, direct
invitation earned". Placement is no longer an input; it is something the app tells
you. Attendance is never asked for at all, because a valid positive award already
proves the kicker was met.

**Status stopped being stored.** v1 had a completed/planned toggle. v2 derives it:
a row with a number is a result, a blank row is one the ladder solves for. That is
also the whole of v1's FR-2 "availability" and "commitment" concepts — adding an
event *is* committing to it.

---

## 3. Output: three strategies became one ladder

**v1 FR-4** specified three deterministic generated paths — least demanding, fewest
events, best use of committed events — each with its own lexicographic ordering,
searching up to 200,000 combinations, fed by a per-event "best finish the generator
may assume" and a commitment flag.

**v2 §4** replaces all of it with one table: the lowest finishes that still reach
the target, relaxed lexicographically by event type.

> International → Regional/Special → Grand Challenge → Cup → Challenge

Relax the hardest events first. The consequence is deliberate: whatever sits last
absorbs the residual demand, so a solved plan often asks you to *win* your Cups —
which is a more realistic ask than a top-32 at a 1,100-player International.

**One rule added that v1 never had.** The ladder may only offer bands whose kicker
the projected field actually meets. Without it the solver relaxes an International
to the 513–1024 band, which needs 2,049 players against a projected 1,096 and pays
**nothing**. v1's generator had the same latent bug.

Deleted along with the generator: 250 lines of search, three strategies, two
per-event fields, and the tab switcher.

---

## 4. Two data decisions reversed, with evidence

v1 §6 specified the projected attendance for a planned major as *"the single lowest
Masters attendance observed during the previous season"*, and §16 Q2 recommended
**not** splitting by rating zone.

Both were wrong, and the data says so.

**Lowest → median.** Pooling Specials into a zone introduces low outliers, and the
mean cannot survive them. Oceania ran four events — 43, 210, 278, 291 — and their
*mean* of 206 sits below three of the four, dragged there by one 43-player Auckland
Special. The median of 210 is inside the real cluster. North America is the same
shape: nine events between 542 and 1,013 plus a single 99-player San Juan Special,
mean 669, median 705.

(Medians round **down** on an even count, matching the conservative convention used
elsewhere.)

**Global → per zone.** v1 applied a single baseline to every planned Regional:

| VGC Regionals, 2025–26 | v1 baseline | v2 zone median |
|---|---:|---:|
| North America | 180 | **705** |
| Europe | 180 | **661** |
| Latin America | 180 | **214** |
| Oceania | 180 | **210** |

A fourfold understatement for North American players, suppressing bands they would
comfortably reach. The zone is the *event's* zone, which preserves §16 Q2's actual
reasoning: kicker eligibility depends on the field you turn up to.

**Specials pooled, Internationals separate.** Specials are not systematically
smaller — Turin drew 940, Auckland 43 — so pooling shifts each zone under 9% while
fixing sample sizes of one or two. Each International instead carries the median of
its own last three seasons.

---

## 5. Sections removed outright

| v1 section | Fate |
|---|---|
| §5 Users and core jobs | Cut. One persona, one job — it is §1 now |
| §7 FR-4 Path generation | Replaced by the ladder |
| §11 Analytics and product success | Cut. "No analytics required" needed no section |
| §12 Risks and mitigations | Cut. Live risks moved into the sections they affect |
| §13 Implementation sequence | Cut. v1 is built |
| §14 Deferred roadmap | Cut |
| §16 Resolved decisions | Cut. Both open data questions are now answered in §5 |
| §8 UX "Method / Direct invitations / Official sources" | Removed from the page; a version link replaces them |

Also removed from the screen: the attendance-baselines panel, the strategy cards,
and the per-row payout table.

---

## 6. What v2 kept unchanged

- **The arithmetic.** Kickers, Best Finish Limits, bucket displacement,
  current-versus-projected. The engine survived intact.
- **The data.** CP tables, BFLs, invitation slots and direct-invite rules, all
  transcribed from the official 2027 pages; cutoffs from the leaderboard API.
- **The honesty requirements**, v1 §3 and FR-1. Reaching the target is never
  described as qualifying, a total below the previous cutoff says so plainly, and a
  direct invitation is reported when earned. These render in the target strip, not
  the removed footer, so the cull did not touch them.
- **Persistence.** Multiple plans, JSON export and import, no accounts.
- **Accessibility.** WCAG AA contrast, keyboard operation, 320px, reduced motion.
- **The stack.** React, TypeScript, Vite, static GitHub Pages. Never the problem.

---

## 7. New in v2

- **The event catalog** (§3). v1 FR-3 described one; v2 specifies it as a per-zone
  checklist, collapsed by default, with bulk-add. Upcoming events come from rk9's
  robots-permitted `/events/` path; completed events from Limitless, because rk9
  exposes no past-events view.
- **Internationals belong to their host region**, so NAIC sits in the North America
  group — it genuinely is the reachable IC for someone already there.
- **Online events assume every kicker is met** (§5). Pokémon Champions has 10M+
  downloads and the GO Battle League leaderboard is ranked globally.
- **Versioning on the page** (§6). One low-contrast line, linked to the repository,
  carrying the app version and the rules version. It is what recovers v1's FR-8
  source transparency after the footer sections were removed.

---

## 8. The one thing v2 says that v1 could not

v1 §16 left two data questions open and recommended answers without evidence. v2
answers both from observation, and records where the observations came from — see
[`DATA-SOURCES.md`](DATA-SOURCES.md), which did not exist when v1 was written and
documents every endpoint, including two undocumented APIs found by reading shipped
JavaScript.

That file is arguably the most durable output of the whole exercise. The app can be
rewritten; the knowledge of where the numbers live is harder to reacquire.
