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

> **Open — which number is the assumption?** Two readings, and they produce very
> different demands. Taking the floor (Challenge = 8) is conservative but makes
> the ladder demand a top-4 at every Challenge. Taking the "rarely more than"
> ceiling (Challenge = 32, Cup = 60) is more realistic and lets the ladder ask
> for a 9th–16th. A floor of 8 is stated; no floor was given for Cups.

---

## 3. The ladder

### 3.1 Add a CP total column

`CP each` alone makes the reader do the multiplication. Show both.

### 3.2 "Top X", not a range

`17–32` becomes **Top 32** — the finish you have to beat, which is the number a
player actually holds in their head.

> **Open — what does the top band read as?** "Top 1" is wrong. Candidates: **Win
> it**, **1st**, or **Champion**.

### 3.3 Fold the Best Finish Limit table into the ladder

Delete the standalone table at the bottom. Show BFL state as `BFL: 3/4` for a
result inside the limit, and `BFL: -/4` for one outside it, ranking ties by order
of addition.

> **Open — this is per-result, but the ladder is per-event-type.** A ladder row
> today reads "Regional Championship ×9": nine events sharing one bucket of five,
> so a single BFL figure for the row has no meaning. Two ways out:
>
> **(a) Put the BFL badge on the plan list** — one per event, where the concept
> actually lives — and delete the bottom table. The ladder stays a summary.
>
> **(b) Make the ladder list individual events** rather than event types, each
> with its own finish and BFL slot. Answers "what do I need *at Baltimore*" and
> carries BFL naturally, but the table grows from four rows to thirty.
>
> (a) is the smaller change and keeps the ladder readable; (b) is what the
> instruction literally asks for.

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
