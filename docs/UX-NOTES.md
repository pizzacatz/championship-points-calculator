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

## 4. Still open from the v2 round

- The catalog and the plan list both name the same event. Checking Baltimore in
  the catalog makes "Baltimore" appear twice on the page.
- Nothing separates results you have banked from events you have not played yet
  beyond a small badge — the two sit in one flat list.
