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

---

## 5. Chrome and layout — decided 2026-08-28

- **Keep the Plan selector.** The fourth figure has to find room elsewhere.
- **Remove the `+ Global Challenge / Grand Challenge` button.** The catalog section
  covers it.
- **Remove the Below kicker chip.**
- **Narrow the CP and Place inputs** to four characters. Seven is far more than any
  value needs: CP tops out at 500, a placement at 1024.

### 5.1 Where the fourth figure's room comes from

Measured at 1280 px, the header is nearly full:

| | Width |
|---|---:|
| Wordmark (icon, title, subtitle) | 459 |
| Game / Rating zone / Plan selects | 136 each — **408** |
| The three figures | 172 |
| Theme toggle | 46 |
| Gaps | ~65 |
| **Free** | **30** |

A fourth figure needs about 55, so it overflows by roughly 25.

Tightening the title's padding helps less than it looks: the wordmark's 459 px is
mostly *text*, not padding. The three selects at 408 px are the real budget — 136
down to about 110 each reclaims 78, which covers it with room spare. Trimming the
wordmark padding on top is worth doing, but it is the smaller half.

### 5.2 Losing the Below kicker chip

It is the last badge that explains a zero. Without it a result scoring 0 and a row
nobody has filled in both read `0 CP`.

They remain distinguishable — a scored zero has a number in its CP or Place box and
an untouched row does not — so this is legible rather than ambiguous. Worth naming
because it is the only cue left.

### 5.3 Losing the manual Global Challenge button

That button was the escape hatch for a Grand Challenge announced outside the
published schedule — the official page says *"stay tuned for dates and details"*.
The catalog scraper re-reads that page daily and picks up new months on its own, so
the exposure is small: an event announced and entered on the same day.

---

## 6. Mobile

- **Move the theme toggle to the top right**, on the same row as the title and
  subtitle, rather than wrapping below the selects.
- **Keep all four figures.** There is room.
- **Align the zone counts.** `8 of 8`, `0 of 10`, `0 of 4` currently start wherever
  the zone name ends, so they stagger. Fix the zone-name column so every count
  lines up on the word **of** — which needs the left-hand number right-aligned in
  its own span, not just the block positioned.
- **Widen *Expand all*** as a tap target, and let the event names give up the width
  it needs.

---

## 7. Two consequences of the new figures

### 7.1 The "on plan" callout becomes a duplicate — remove it

It currently reads:

> **On plan to reach 842.** 317 CP of that is still to earn — the finishes below
> are what it would take.

`target − currentTotal` is exactly what **TO GO** will now show. So the banner
states the headline figure a second time, in prose, directly beneath it. Its other
half — *"the finishes below are what it would take"* — is a caption for the ladder,
which already has a heading saying *What you need*.

Remove it. This is the same cut as the band names, the BFL chip and the
displacement line: the app narrating a number it has already displayed.

**Two callouts stay**, because each says something no figure does:

| Callout | Why it earns its place |
|---|---|
| **Target reached** | Carries the "this is not a Worlds qualification" caveat, which PRD §7 requires and no number conveys |
| **Direct invitation earned** | A qualifying finish that stands regardless of the totals — the one outcome the arithmetic cannot express |

### 7.2 The season line should count what is overdue

It currently reads *"3 of 10 events played · next: Baltimore on Sep 18"*, where
"played" means a result was entered. An event whose date has passed with nothing
entered is in neither number — not played, and not the next one coming.

That is the one state a player most needs prompting about, and right now it is
visible only by scrolling the plan until an amber row appears. The line should
carry it:

> 3 of 10 played · **2 need results** · next: Baltimore on Sep 18

It costs nothing — the overdue test already exists for the row highlight — and it
turns the season line from a progress readout into the page's only prompt to act.
