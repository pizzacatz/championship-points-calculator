# UX notes — the round after v2.3.2

Raised 2026-08-28 against the deployed v2.3.2. Nothing here is implemented.

---

## 1. The four figures at the top

**Now:** CP NOW · PROJECTED · TO GO.

**Next:** **CP NOW · TO GO · GOAL · <the fourth>**.

### 1.1 What each means

| | Definition |
|---|---|
| **CP NOW** | Banked. Results actually entered, after Best Finish Limits |
| **GOAL** | The planning target — the previous-season cutoff, the live boundary, or an override |
| **TO GO** | `GOAL − CP NOW`. What is still to be earned |
| **The fourth** | The most the events you have not yet played could still add |

**TO GO changes meaning, and improves.** It currently measures against the
*projection*, which is why it read `Reached` on a plan with 500 CP banked and six
events unplayed. Measured against what is banked it says 342, which is true. That
is the same correction already made to the "Target reached" banner.

**PROJECTED leaves the top row but not the page** — the ladder header already
reads *"reaches 885 of 842"*, which is the projection in the place it is earned.

### 1.2 The pairing is the point

Put **TO GO** next to **the fourth** and the page answers, at a glance, the
question the whole product exists for:

> *I need 342. My remaining events can still yield 1,050.*

Feasibility becomes visible without reading the ladder at all. When the fourth
figure drops below TO GO, the plan cannot reach the target — which is exactly the
condition the ladder reports as infeasible.

### 1.3 The fourth figure is not a sum, and this is the whole difficulty

It has to be **Best Finish Limit aware**. Only five majors ever count, so a sixth
adds only what it displaces — and if it displaces nothing, it adds nothing.
Measured against the real engine:

| Situation | Banked | **The fourth** | A naive sum would say |
|---|---:|---:|---:|
| 2 majors logged, 3 blank | 550 | **1,050** | 1,050 |
| 5 majors logged, bucket full, 3 blank | 1,455 | **270** | 1,050 |
| 5 majors logged at 350 each, 1 blank | 1,750 | **0** | 350 |

The last row is the case worth protecting against: winning a sixth Regional when
you already hold five wins is worth **nothing**, and a naive display would
promise 350.

The correct definition is `maxAttainable − CP NOW`, where `maxAttainable` is the
total with every unplayed event won outright, run through the same Best Finish
Limit pass as everything else. **The ladder already computes this** — it is the
figure behind *"winning every event you have added reaches N CP"* — so this is a
display change, not new arithmetic.

### 1.4 It is called AVAILABLE  ✅

### 1.5 The Plan selector comes out of the header  ✅

That is where the fourth figure's room comes from.

> **Open — where does switching plans go?** Multiple plans, export and import were
> all confirmed as staying. With no selector there is no way to switch between
> them, so the control has to live somewhere — most naturally beside *New plan*,
> *Export*, *Import* and *Delete plan* at the foot of the page, where the rest of
> the plan management already is. Unless multi-plan is being dropped as well,
> which would also remove export and import's reason to exist.

---

## 3. The goal line

**Now:** a warning banner saying the plan is below last season's minimum, plus a
line reading `target [842] · 2026 cutoff · US and Canada`.

**Next:** drop the banner. The line becomes:

> **Championship Points Goal:** `[ 842 ]`  ·  *Last season*  ·  *This season*

Two buttons that fill the field with the invitation boundary — last season's final
figure, and the current season's live one.

### 3.1 "90th rank" is only right for VGC in US and Canada

The rank that matters is the number of Masters invitations for the selected game
and zone, and it is not 90 everywhere:

| | Rank | Last season's cutoff |
|---|---:|---:|
| VGC, US and Canada | 90 | 842 |
| TCG, US and Canada | 140 | 738 |
| GO, US and Canada | 75 | 744 |
| VGC, Oceania | 20 | 808 |
| VGC, Middle East & South Africa | 5 | 257 |

So the buttons cannot say "90th". They should either stay generic — *Last season*
— or name the rank they are filling from, which changes as the game and zone
selectors change: *Last season (90th)*.

### 3.2 "This season" has nothing to fill from yet

The 2027 qualification period is not published on the official leaderboard, so
there is no live boundary to read. The refresh job already records this as
`periodPublished: false`.

The button should be **present but disabled**, saying why — *the 2027 leaderboard
has not opened* — rather than absent. Absent, a player wonders whether the feature
exists; disabled with a reason, they know to come back.

### 3.3 Losing the banner loses a real warning

The banner said, in effect, *this plan does not reach what it took last year*.
With **TO GO** measured against banked CP and **AVAILABLE** beside it, that
comparison is now visible as numbers rather than prose — which is the better
place for it. Worth checking after the change that a plan which cannot reach its
goal still reads as such at a glance.

---

## 4. Championship Points do not differ by division

Confirmed against the official pages: the Regional and Special table is a single
*Placement / Kicker / Championship Points* table covering the TCG, the video game
and GO, with no division split anywhere. Only the **prize money** tables divide
into Junior & Senior versus Masters.

The engine is therefore already division-agnostic, and nothing about the CP
arithmetic needs to change to support Juniors or Seniors.

**But division is not free**, and two things do depend on it:

1. **Invitation slots, and so the goal.** VGC in US and Canada is 90 for Masters
   but 40 for each of Juniors and Seniors — a different rank, a different cutoff.
   The slot counts for all three divisions are already in `rules-2027.json`.
2. **Kickers, badly.** Attendance is counted *per division*, and the smaller
   divisions are tiny: Seattle 2026 VGC drew 821 Masters, **35 Seniors and 24
   Juniors**. At 24 entrants a Junior Regional pays nothing below 8th, so the
   attendance baselines cannot be shared.

So supporting all three divisions is cheap in the engine and real work in the
data. Worth doing only if Junior and Senior players are an audience — the PRD has
scoped them out since v1.

---

## 2. Filter the plan by event type

A control above the plan list to show only Regionals, only Cups, and so on. With a
zone bulk-added the list runs to a dozen rows of one type, and finding the League
Cup among them means scrolling past all of them.

Points worth settling before building:

- **A view filter only.** It must not change CP NOW, the fourth figure, the ladder
  or any total — hiding a row is not removing it. Worth being explicit, because
  every other list control on this page (the catalog checkboxes) *does* change the
  calculation.
- **Show the counts**, as the catalog groups already do: `Regional 8 · Cup 2 ·
  Challenge 1`. That doubles as a summary of the plan's shape.
- **Only offer types that are present.** A filter for an event type with no rows
  is noise.
- **Say when a filter is hiding rows**, so a filtered list is never mistaken for
  the whole plan.
