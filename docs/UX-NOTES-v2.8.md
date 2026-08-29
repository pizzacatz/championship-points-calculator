# UX notes, v2.8 — placement and turnout, no CP entry

Decided in discussion, then built. This is the largest input change since v2:
the row stops asking what you *earned* and asks what you *did*.

## The change

A result row's inputs become **Placement** and **Players**. The CP figure stays,
but only as output. There is no longer any way to type a CP value in.

```
before   Baltimore Regional  2026-09-19   CP [    ] or Placement [    ]   160 CP
after    Baltimore Regional  2026-09-19   Placement [  17]  Players [ 705]   160 CP
```

## Why turnout is required rather than conditional

The alternative on the table was a three-state field: hidden when the band's
kicker is already below the assumed turnout, pre-filled when it isn't, and blank
and mandatory when the placement itself disproves the assumption. It scored
correctly, and it was rejected for being three rules where one will do.

Requiring the number has a second benefit that only became clear once the states
were written out: it makes the scoring function **total**. Today `evaluateResult`
has to decide whether an assumption is safe enough to use, and carries four
distinct `attendanceSource` values to explain what it decided. With turnout
always present, `(placement, turnout) → CP` is a lookup with no judgment in it,
and the `unverified-attendance` and `implied-by-award` cases disappear.

## Required means required to be a number, not required to be typed

The field is always there on a result row, and it always arrives with a number
in it:

| Row | Turnout comes from | Shown |
|---|---|---|
| Result, major with scraped attendance | rk9 roster count | yes, editable |
| Result, major not yet scraped | zone or IC median | yes, editable |
| Result, local | 32 (Cup) or 16 (Challenge) | yes, editable |
| Result, online | — no field size exists | no |
| Planned event | ladder assumption, not per-row | no |

The field can be emptied like any other, and an empty one is the single thing a
row complains about. An earlier build had it refill itself with the default the
moment it went empty, on the reasoning that the row should never be in an
unscoreable state. That made the last digit undeletable, which is a worse problem
than the one it solved: a field that fights the backspace key is not a field.

The always-blank alternative was rejected on friction. It buys one thing: it
forces you to confront a wrong default instead of accepting it. It costs typing
a number on every local row, including the ones where it provably cannot change
the answer — 3rd at a Cup pays 32 CP at any turnout from 8 upward — and most
players do not remember the size of a Cup three weeks later.

## The defaults sit at the bottom of a dead plateau

Worth writing down because it is not obvious from the numbers. Cup kickers run
0, 4, 8, 17, **48**, 80, 128, so every turnout from 17 to 47 scores identically:
a 32-player Cup pays exactly what a 17-player one pays. Challenges are the same
between 14 and 24, with 16 sitting inside it.

So 32 and 16 are the most conservative values in their plateaus — they never
invent CP. The cost is that Cups commonly run 48–60, which is the next plateau
up, so the default under-credits a real 9th–16th finish by a full band. That is
the case the editable field exists for, and it is why the field earns its place
at Cups specifically.

## Scraped attendance is the half that fixes majors

The visibility rule only ever protects against an assumption that is too **low** —
that case shows a zero, which invites correction. Every major mispricing measured
in v2.7 ran the other way, and a too-high assumption is silent:

> VGC AP median 210, real events as small as 43. Finish 17th at that 43-player
> event: the kicker is 65, above the real field, so 0 CP — but comfortably below
> the 210 median, so the app scores it **160 CP** and never mentions attendance,
> because by its own logic the number cannot matter.

Only real per-event attendance closes that. `scripts/refresh-event-attendance.mjs`
reads the rk9 roster for each **completed** catalog event using the tournament
ids the catalog already holds, counts Masters, and writes the figure back onto
the catalog entry per game. It runs in the daily refresh.

Notes on it:

- It is driven by ids already in the catalog, so it needs no event discovery and
  costs one request per event per game, once, cached.
- It only asks about events that have finished. An upcoming event has no roster,
  and nobody can enter a placement for it either, so the timing lines up.
- **Pokémon GO stays unverified.** rk9 reported 156 for Orlando where Liquipedia
  reported 174 and that was never resolved, so GO majors keep falling back to the
  zone median with the field shown.
- rk9's robots.txt disallows `/roster/`. This reads it anyway, at the repository
  owner's direction, at one request every four seconds, caching every response.

## What is lost

Removing CP entry retires the property v2 was built on: **every CP value is
unique within a payout table**, so an award identified its own band. That was
what let one number stand in for either input. It is genuinely useful and it is
being given up on purpose, because it only ever answered "which band" and never
"was the kicker met" — the question that was actually getting results wrong.

`bandForPoints` survives, used only by the storage migration below.

## Migrating saved plans

A stored `awardedPoints` is converted at load:

- **Positive award** → `placement` becomes the band's best place and `attendance`
  becomes the band's kicker. The CP total is preserved exactly. The placement is
  a floor, not a recollection: 20 CP at a Cup becomes 9th, when the player may
  have finished 13th. Both score 20.
- **Zero award with a placement** → the placement is kept and attendance is set
  just below the band's kicker, which is the only state that reproduces a zero.
- **Zero award with no placement** → nothing identifies the event; the row
  becomes unplayed.

## Validation

One rule: a played row needs a turnout, and an empty one asks for it — "What was
the total number of competitors at this tournament?", linking to the Play!
Pokémon event history at `op-legacy.pokemon.com`. Phrased as a question about the
tournament rather than an instruction about the form, and pointed at somewhere
the answer might actually be, since the player has to go and find it. The
destination is behind a Trainer Club sign-in.

The obvious second rule — that the turnout must be at least the placement — was
written and then removed, because it can never change an answer. Every band's
kicker is larger than that band's own last place (33-64 needs 129; 9-16 needs 48),
so a field too small to hold the placement is always too small to pay it. Those
rows already scored 0 for the right reason. The check earned nothing and fired at
people half-way through retyping a number. `tests/calculate.test.ts` asserts the
invariant across every payout table so the reasoning stays checked.
