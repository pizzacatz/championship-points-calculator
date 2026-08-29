# Changelog

All dates 2026-08-28 — the project was specified, built, reviewed and rebuilt in
a single session.

## 2.8.3

- **A Global or Grand Challenge no longer asks for players it never showed a
  field for.** These events have no field size to enter: Pokémon Champions has
  10M+ downloads and the GO Battle League is ranked globally, so every kicker is
  taken as met and the input is not rendered at all. The blank-turnout check
  added in 2.8.2 did not know that, so it read the absent input as an empty one
  and put *Enter how many players were in the field* under every online result.

## 2.8.2

- **The turnout field can be emptied.** It refilled itself with the default the
  instant it went empty, so the last digit could not be deleted — backspace after
  backspace and the number came back. It now stays empty, like any other field.
  The v2.8.1 note about clearing it to restore the assumption described that bug
  as a feature; it was not one.
- **An empty turnout is the only thing a row complains about.** The
  contradiction error is gone: a turnout too small to hold the placement is
  necessarily too small to pay it, because every band's kicker is larger than its
  own last place. The row already scored those 0 for the right reason, so the
  error changed no answer and only ever fired at someone half-way through
  retyping a number. There is now a test asserting that invariant across every
  payout table.

## 2.8.1

- **A row holds its verdict until you stop typing.** Backspacing a turnout from
  640 down passes through "6 players", which genuinely contradicts a 13th place,
  so a red callout appeared under the row on every keystroke of a correction. The
  error and the *Check this* badge now wait for the field to lose focus. Nothing
  about what counts as valid changed. (This was the wrong fix for the wrong
  problem; see 2.8.2.)
- **A Cup or Challenge carries its date beside its name**, on both mobile and
  desktop, where a catalog event has always printed its own. The control was out
  by the inputs, so one kind of row put its date beside the name and another put
  it three columns away. It is inline now, so it wraps with the name instead of
  reserving a column of its own.

## 2.8.0

- **A result is a placement and a turnout. There is no CP field any more.** The
  row used to accept either the CP you were awarded or where you finished; it now
  asks only where you finished, and prices that against how many people were
  there. CP becomes output.
- **The turnout arrives filled in.** A Cup assumes 32, a Challenge 16, a major
  its real attendance where that has been counted and its rating zone's median
  where it has not. An untouched figure is greyed, so an assumption never passes
  for something the player confirmed. Clearing the field returns it to the
  default rather than leaving the row unscoreable.
- **Real attendance is counted for majors that have finished.**
  `refresh-event-attendance.mjs` reads each completed event's rk9 roster using the
  tournament ids the catalog already holds and records the Masters who carried a
  final standing. It runs in the daily refresh. Orlando 2026 TCG: 2,733 of 2,734.
- **This fixes results that were silently overstated.** A rating zone median is
  wrong in the one direction nothing can catch. VGC Asia-Pacific medians 210
  players against real fields as small as 43, so 17th place — kicker 65,
  genuinely worth nothing — scored 160 CP with no mention of attendance, because
  by the app's own logic the number could not matter. Every major mispricing
  measured ran that way.
- **Pokémon GO majors still fall back to the median.** GO rosters never carry a
  standings column, and rk9's Orlando 2026 GO roster holds 156 where Liquipedia
  reports 174 — unresolved in direction as well as size.
- **A turnout below the placement is rejected.** You cannot finish 40th in a
  field of 32.
- **Plans saved before this release are converted on load.** A stored award
  becomes the placement and turnout that produced it, preserving the total
  exactly: 20 CP at a Cup becomes 9th of 48. The placement is a floor rather
  than a recollection — the player may have finished 13th — and both score 20.
- **The scoring function no longer contains a judgment.** With turnout always
  present, `(placement, turnout) → CP` is a lookup. The `unverified-attendance`
  and `implied-by-award` cases are gone, and with them the property v2 was built
  on: that every CP value is unique within a payout table, so an award identified
  its own band. That was genuinely useful, and it only ever answered *which
  band*, never *was the kicker met* — the question that was getting results wrong.

## 2.6.2

- **On mobile the earned CP is pinned to the bottom right**, with the Best Finish
  Limit chip and any badges to its left. It was sitting at the top of its cell,
  and the chip was to its right.
- **The CP figure reserves three digits**, which is every value it can hold —
  Championship Points top out at 500 — so the chip beside it no longer shifts as
  the number changes width.
- **Rows are laid out with flex rather than grid.** Grid made the two lines share
  columns, so pinning the CP to a fixed width narrowed the title's column until
  event names broke mid-syllable — *"Louisville P / okémon Re / gional"*. Flex
  lines size independently.
- **The remove control is out of flow**, pinned to the top right corner. In flow
  it either dropped to a line of its own beneath a wrapping title or took the
  width the title needed.

## 2.6.1

- **The rename now reaches plans already saved.** v2.6 renamed Global Challenges
  in the catalog but not in storage, so an existing plan kept showing
  *Global Challenge — September 2026*. The load-time migration strips the month
  from stored names as well as the old date ranges.
- **A local shows its date once.** Both the row's date text and the calendar
  button were printing it. The button is the value and the control, so the text
  goes.
- **The date button no longer stretches the remove control.** It spanned into the
  remove button's grid column, forcing it wide. It has its own column now, which
  collapses on rows that have no date button. The × is back to 25px.

## 2.6.0

- **Fixed a migration bug.** Plans saved before v2.5 kept the old official date
  ranges — `Sept. 18-20` — so an existing plan still showed them beside the ISO
  dates around it while a fresh plan was correct. Stale display strings are now
  dropped on load.
- **Global Challenges are named `Global Challenge`**, without the month; the date
  column beside them already says which. The catalog's checkbox state moved from
  keying on name to keying on **name and date**, without which six identically
  named events would have collapsed to one key and ticked together.
- **Local dates are set from a calendar button.** A Cup or Challenge no longer
  shows a wide `mm/dd/yyyy` field; a calendar icon opens the native picker via
  `showPicker()`, and once set the button shows the date in the same ISO form as
  every other. Tapping it again reopens the picker.
- **Em-dashes replaced.** Commas or full stops in prose; a hyphen where one stood
  in for a missing number, since a comma there reads as a mistake.
- **Place** becomes **Placement**.
- Mobile: the earned CP sits in line with the fields it comes from, and wraps
  rather than pushing the page wide when a row also carries a direct invitation.
- The 320px check now names the element that overflows, which is how the two
  regressions in this round were found rather than guessed at.

## 2.5.0

- **Dates line up.** Every date in the app is now ISO — one format, ten
  characters — and rendered with `tabular-nums`. The column was ragged because
  the body face uses proportional digits, so `1` is narrower than `8` and
  `2027-01-15` did not match `2026-09-18`. Fixed-width figures plus a fixed
  column give one left edge and one right edge across all 38 dates.
- **Global Challenges read `2026-09-00`.** They are published by month, so the
  `00` says the day is not announced yet while keeping the same width as
  everything else.
- **The CP and Place fields are four characters wide.** They looked like six
  because a `type="number"` input carries spinner arrows worth ~15px before any
  text. The arrows are gone — the values are typed, never nudged — and the field
  is 46px, which fits `1024` exactly.
- **`Championship Points Goal:` becomes `CP Goal:`**, its field narrows to four
  characters, and the fill buttons read **2026** and **2027** rather than *Last
  season* and *This season*.
- **Mobile plan rows** put the remove × at the top right, level with the event
  title, and the earned CP at the bottom right — the two things a row is about on
  opposite corners, with the destructive control no longer beside the number.
- **Long event names break at "Championships"** on a narrow screen. Every space
  before that word is bound, leaving it as the only break opportunity; CSS alone
  cannot express "break only here".

## 2.4.0

- **Four figures at the top: CP NOW · TO GO · GOAL · AVAILABLE.**
  - **TO GO** now measures against what is banked, not the projection. It read
    `Reached` on a plan with 500 CP banked and six events unplayed.
  - **AVAILABLE** is the most the unplayed events could still add, run through the
    Best Finish Limit — a sixth major adds only what it displaces, and if it
    displaces nothing it adds nothing. Eight blank majors show 1,750, not 2,800.
  - Together they answer the product's question without reading the ladder: *I
    need 342, my remaining events can still yield 1,050.*
- **A goal line replaces the target line and two banners.**
  `Championship Points Goal: [842] · Last season · This season`. The rank each
  button reads from follows the game and zone — 90th for VGC in US and Canada,
  140th for the TCG there. *This season* is disabled with its reason until the
  2027 leaderboard period opens.
- **Removed the "on plan to reach" callout.** It stated `goal − banked`, which is
  exactly what TO GO shows — and it could not distinguish a plan with 1,225 CP of
  headroom from one with 350. *Target reached* and *Direct invitation earned* stay:
  each carries something no figure conveys.
- **Removed the "below last season's minimum" banner.** That comparison is now
  visible as numbers.
- **The season line counts what is overdue** — *3 of 10 played · 2 need results ·
  next: Baltimore on Sep 18*. An event past its date with nothing entered was in
  neither the played count nor the next one coming.
- **Filter the plan by event type.** A view filter only: it says so, and changes no
  total, unlike the catalog checkboxes above it.
- Header re-fitted for a fourth figure — the room came from the selects, not the
  title padding, which is mostly text.
- Mobile: the theme toggle sits beside the title; all four figures fit on one row;
  event names truncate to a single line; every zone count lines up on the word
  **of**, at both 390 and 1280.
- Removed the category chips from the catalog, the manual Global Challenge button,
  and the Below kicker chip. CP and Place inputs narrowed to four characters.

## 2.3.2

- **Removed the displacement line from plan rows.** *"This result adds 190 net CP
  by replacing Orlando Regional"* — the totals and the `BFL 2/5` slot already say
  what counts and what does not. With it went the engine's displacement
  calculation, which re-ran the whole Best Finish Limit pass once per scoring
  result on every keystroke to produce a sentence nobody needed.
- Plan rows now carry no explanatory prose at all.

## 2.3.1

- Dropped the explanatory note under Global & Grand Challenges. The section listed
  six months and then explained that it was listing months.

## 2.3.0

- **Locals are scored from an assumed turnout** — 16 at a League Challenge, 32 at
  a League Cup — instead of refusing to score a placement and asking for the CP.
  Entering the CP overrides the assumption and, being a valid published award,
  proves the kicker was met.
  - The same figure drives the ladder, so what it asks for is what a result of
    that shape would score.
  - A Cup at 32 behaves exactly as one at 17: the 9th–16th band needs 48 entrants,
    so neither figure unlocks it.
  - The trade: an assumption that scores is one that can be wrong. A 13th at a
    genuinely 30-player Challenge earns 6 CP and this records 0.
- Online placements score too — their kickers are assumed met, and they were
  caught by the same refusal.
- Removed the **Needs the CP** and **Excluded by BFL** chips. The first has nothing
  left to say; the second repeated the row's own `BFL –/4`.
- Removed the band name from rows. Mapping a finish to a band is the calculator's
  job; restating it answers a question nobody asked.
- Official sources returned as a collapsed block at the foot of the page.

## 2.2.0

- **Global & Grand Challenges** for VGC, scraped from the official schedule and
  grouped by month as it publishes them. They belong to no rating zone — points
  are ranked within your own — so they form their own catalog group.
- Stored against the last day of their month, so they sort after dated majors in
  the same month and only become overdue once the month is over.
- An empty plan no longer warns that it is short of its target.

## 2.1.0

- **"Target reached" no longer fires on a projection.** With 500 CP banked and six
  unplayed events it was showing the green banner; banked and on-plan are now
  separate claims.
- **A finished event with no result drops out of the ladder.** It was still being
  solved for, inflating the projection with points that can no longer be earned.
  It is highlighted instead, asking for the result or removal.
- **Clearing a zone confirms before discarding typed results**, and only when
  something would actually be lost.
- **The ladder was rebuilt.** It grouped by event type, so nine Regionals read
  `×9` — implying 1,800 CP where the Best Finish Limit caps the truth at 1,000,
  and printing a requirement for an International worth nothing. It now reports
  how many of each type can actually count, adds CP totals, reads finishes as
  "Top 32" down to "Top 4" then 2nd and 1st place, and holds its columns.
- The standalone Best Finish Limit table is gone; per-result slots appear on the
  plan rows as `BFL 3/5`.
- Plan rows lost the type subtitle, the date's own line, and the Planned and
  Counts badges. Rows sort by date. Totals moved into the sticky header. A season
  line says how many events are played and which is next.
- Title, GPE Network subtitle, catalog expand and collapse all.

## 2.0.0

- **Rebuilt the form around one question:** *if I attend these events, what is the
  worst I can do and still qualify?*
- **One number per event** — the CP or the placement, either one, because every CP
  value is unique within its payout table. Attendance is never asked for; status
  is not stored, since a row with a number is a result and a blank row is not.
- **The ladder replaced the path generator** — three strategies, a
  200,000-combination search, and two per-row fields, for one table.
- Events come from a per-zone checklist; upcoming from rk9, past from Limitless.
- Attendance baselines became per-zone medians with Specials pooled in. v1 applied
  a single global 180 to every planned Regional, including North American ones
  that median 705.
- 34 inputs to log three events became 1.

## 1.0.0

- First release. Kickers, Best Finish Limits, displacement, three generated
  paths, multiple plans, JSON export and import.
- CP tables, Best Finish Limits, invitation slots and direct-invitation rules
  transcribed from the official 2027 pages and locked with fixtures.
- Previous-season cutoffs read from the official leaderboard API, confirming the
  842 benchmark the PRD carried as an owner-supplied figure.
