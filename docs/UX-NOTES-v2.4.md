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

### 1.4 Open — what to call it

`AVAILABLE` is short and clear. `STILL WINNABLE` says more but is long for a stat
label. `IN PLAY`, `REMAINING`, `UPSIDE` also fit. It should not read as something
already achieved.

### 1.5 Consequence — the header gets crowded

Three figures currently share the sticky header with a title, three selects and
the theme toggle, and it is already tight at 1280 px. A fourth needs room from
somewhere. The **Plan** selector is the obvious candidate: it shows a single entry
until a second plan exists, so it could appear only when there is a choice to make.

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
