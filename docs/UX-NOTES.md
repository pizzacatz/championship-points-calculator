# UX notes — v2.1

Raised 2026-08-28 after the first real look at v2 in use. Nothing here is
implemented. The theme throughout is **vertical compression** and **not saying
the same thing twice**.

---

## 1. The plan list is too tall

Bulk-add a zone and you get eight to ten rows, each carrying more chrome than
content. Three cuts, all removing information the row already conveys:

| Remove | Because |
|---|---|
| The event-type subtitle | "Baltimore Pokémon **Regional** Championships" already says Regional |
| The planned/status pill | Everything in the plan list is planned. The pill states the obvious on every row |
| The date's own line | Move it onto the title row |

Target shape — one line per event instead of three:

```
Baltimore Pokémon Regional Championships   18 Sep     [CP] or [Place]   350 CP  ✓
```

The badges that *earn* their place are the ones carrying information the row
does not otherwise have: **Counts**, **Excluded by BFL**, **Below kicker**,
**Direct invite**, **Check this**.

---

## 2. Local event attendance

Cups and Challenges are unlisted anywhere, so v2 has no field size for them and
falls back to asking for the CP. Observed reality, per the project owner:

- **League Challenges** rarely exceed **32** players, and can be assumed to have
  at least **8**.
- **League Cups** rarely exceed **60** players.

What that unlocks, given the published kickers:

| Assumed field | Deepest band that pays | CP |
|---|---|---:|
| Challenge @ 8 | 3rd–4th (kicker 8) | 10 |
| Challenge @ 32 | 9th–16th (kicker 25) | 6 |
| Cup @ 60 | 9th–16th (kicker 48) | 20 |

**Decided:** the ladder may ask for a **top 4** at a Challenge and a **top 8** at
a Cup, and no deeper. Set the assumed field to the kicker that unlocks exactly
that band and no further:

| | Assumed field | Deepest band it unlocks | |
|---|---:|---|---:|
| League Challenge | **8** | 3rd–4th | 10 CP |
| League Cup | **17** | 5th–8th | 25 CP |

---

## 3. The ladder

### 3.1 Add a CP total column

`CP each` alone makes the reader do the multiplication. Show both.

### 3.2 "Top X", not a range

`17–32` becomes **Top 32** — the finish you have to beat, which is the number a
player actually holds in their head. Below a top 4 the band is small enough to
name outright:

| Band | Reads as |
|---|---|
| 17–32 | Top 32 |
| 9–16 | Top 16 |
| 5–8 | Top 8 |
| 3–4 | Top 4 |
| 2 | 2nd place |
| 1 | 1st place |

Rule: a band whose worst finish is 4th or deeper reads `Top {worst}`; otherwise
it is named by that placement.

### 3.3 Fold the Best Finish Limit table into the ladder

Delete the standalone table at the bottom. Show BFL state as `BFL: 3/4` for a
result inside the limit, and `BFL: -/4` for one outside it, ranking ties by order
of addition.

**This is not cosmetic — the ladder is currently giving wrong advice.** It groups
by event *type*, so nine added Regionals collapse into one row reading `×9`. But
only the best five majors ever count. Measured, with 9 Regionals and NAIC added
against a target of 842:

| The table says | Implies |
|---|---:|
| International ×1 — Top 512 — 85 CP | 85 |
| Regional ×9 — Top 16 — 200 CP each | 1,800 |
| | **1,885** |

The real projected total is **1,000** — five Regionals at 200. The other four
contribute nothing, and the International's 85 CP does not make the top five, so
that row asks for a finish worth zero. **885 CP of that table does not exist.**

The fix is two-part, because BFL means different things before and after a result
exists:

**Blank events are interchangeable.** Nine unplayed Regionals are identical, so
naming *which* five count is arbitrary. What matters is the count. The ladder
should say **5 of 9**, and total honestly:

```
EVENT                       COUNTING   FINISH NEEDED   CP EACH   CP TOTAL
Regional Championship         5 of 9   Top 16              200      1,000
International Championship    0 of 1   —                     —          —
```

A row contributing nothing should say so rather than print a requirement.

**Logged results have a determinate rank.** Once a result carries a number it has
a real position in its bucket, so the *plan list* is where `BFL: 3/5` belongs —
per event, ties broken by order of addition, `BFL: –/5` for anything outside.

Together those answer "which events contribute to the total", on the surface where
each question is actually asked. The standalone BFL table at the bottom is then
redundant and goes.

### 3.4 The alignment is bad

The current table is genuinely ugly, and the cause is identifiable: the
`Finish needed` cell sometimes carries an inline hint — *"deepest that pays at
~705 players"* — which wraps, pushes the row taller than its neighbours and
destroys the column rhythm.

Fixes:

- Move that hint out of the cell. It belongs in a footnote, a tooltip, or its own
  narrow column — not inline with the value it is annotating.
- Right-align every numeric column and set `font-variant-numeric: tabular-nums`
  so digits line up vertically.
- Fix the column widths rather than letting the content set them, so rows do not
  shift width as the numbers change.
- One line per row. No wrapping.

Target:

```
EVENT                       HOW MANY   FINISH NEEDED   CP EACH   CP TOTAL
International Championship         1   Top 512              85         85
Regional Championship              9   Top 32              160      1,440
League Cup                         2   Win it               50        100
```

---

## 4. Header and catalog chrome

- **App title:** *Championship Points Calculator 2027*.
- **Subtitle:** replace "2027 Masters" with **Part of the GPE Network**, linked to
  `https://georgiaplayevents.com/#etc`. Matches the majors map, which carries the
  same line.
- **Events catalog:** add **Expand all** / **Collapse all**.
- Delete the panel note *"Add what you can get to. Uncheck what you can't."*

---

## 5. Review of the shipped v2, by severity

Measured against the live site with eight events added and two results logged.

### 5.1 "Target reached" fires on a projection, not on results — trust  ✅ confirmed

The banner turns green and says **Target reached** while only 500 CP is banked.
The 860 it is judging comes from the ladder's *assumed* finishes at six events
that have not been played. PRD §3 and §7 are emphatic that nothing may imply
qualification, and this is the strongest claim on the page resting on the softest
evidence.

Separate the two states plainly:

| Banked | Reads |
|---|---|
| 500 of 842 | *On plan to reach 842 — 342 still to earn* |
| 842 of 842 | *Target reached* |

### 5.2 The totals scroll away while you use them — feedback  ✅ confirmed sticky

CP now / Projected / To go sit at the very top. Entering results happens 800 to
2,000 px below, so the number you are trying to move is off-screen at the moment
you move it. Cause and effect should be visible together. Fold the three figures
into the sticky header, or make the strip itself sticky.

### 5.3 Results and blanks look the same — hierarchy

Six of eight rows are empty, each the same height, weight and colour as the two
carrying real results, distinguished only by a small grey pill. The page gives
most of its area to the events you have *not* played. A logged result is a fact
and an empty row is an intention; they should not have equal visual weight.

### 5.4 The explanation line restates the row — redundancy

> "200 CP → 9–16 band, worth 200 CP. The award confirms at least 33 players
> attended. This result adds 200 CP and displaces nothing."

Three sentences, and "200 CP" appears three times in a row that already shows
**200 CP** twice. Keep only what the row cannot show: the band, and displacement
when there is any. "Displaces nothing" is worth saying only when something is at
risk of being displaced.

### 5.5 Two unrelated ways to add an event — mental model

Majors come from the catalog checklist; Cups and Challenges from three `+` buttons
sitting *inside* the plan panel. Same task, two places, no visual relationship, and
the `+` buttons put an input control inside a results display. They belong with the
catalog.

### 5.6 Smaller things

- **Delete plan** is styled identically to **New plan** and sits beside it. A
  destructive action should not look like its neighbours.
- Every row repeats the micro-labels `CP` and `Place` — sixteen of them across
  eight rows, where one column header would do.
- The **Plan** dropdown shows a single entry until a second plan exists.

### 5.7 Mobile is the worst case

At 390 px the page runs **4,152 px** for eight events. The ladder's
*"257–512 deepest that pays at ~1,096 players"* wraps over four lines. Deleting the
BFL table (§3.3) and the compression in §1 remove most of that height; the ladder
still needs a narrow-screen treatment rather than a horizontal scrollbar.

---

## 6. Second pass — things the first review missed

### 6.1 The season has no presence, and the product is about the season

The question this app exists to answer is *"given how many events are left, how
well do I need to do?"* — but nothing on the page conveys **where you are in the
season**. There is no sense of elapsed time, no next event, no count of what
remains. Dates appear only as small grey text on each row.

The majors map solves this with a season timeline. Something equivalent here — even
one line, *"4 of 12 events played · next: Las Vegas, 4 Dec"* — would put the time
dimension back into a tool whose central question is about time.

### 6.2 A past event with no result is still treated as an opportunity

Every event carries a date, so the app knows when Baltimore was. If it has been and
gone and no result was entered, the ladder still counts it as an event you can
solve for — it will happily tell you to finish top 16 at a tournament that finished
last month. That is not a styling problem; it inflates the projection.

At minimum, an unlogged event whose date has passed should be visually separated
and excluded from the ladder, with a prompt to enter the result or remove it.

### 6.3 Clearing a zone can destroy results with no warning

**Clear** on a zone removes every event in it, including ones carrying logged
results, instantly and with no undo. The same applies to the per-row ×. Removing an
empty row is free; removing a logged result loses work the player typed. Those two
should not behave identically — confirm when a removal would discard a result.

### 6.4 Rows are ordered by addition, not by date

Bulk-add happens to produce date order because the catalog is sorted. Add a League
Cup by hand afterwards and it lands at the bottom regardless of when it is. A plan
is a schedule; it should read in date order.

### 6.5 Green means two different things

**Counts** and **Direct invite** are both green badges. One is routine bookkeeping —
this result is inside the Best Finish Limit — and the other is the single most
significant outcome in the product. They should not share a colour.

---

## 7. Still open from the v2 round

- The catalog and the plan list both name the same event. Checking Baltimore in
  the catalog makes "Baltimore" appear twice on the page.
- Nothing separates results you have banked from events you have not played yet
  beyond a small badge — the two sit in one flat list.
