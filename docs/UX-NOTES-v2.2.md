# UX notes — the round after v2.2

Raised 2026-08-28 against the deployed v2.2. Nothing here is implemented.

The theme is **stop asking the reader to do the calculator's job**. Three of the
four items are the app narrating its own workings — a band name, a chip explaining
why it will not score something, a chip explaining a limit it already applied.

---

## 1. Score a local from an assumed field, rather than refusing to

**Now:** a placement entered against a Cup or Challenge whose band depends on a
kicker is not scored at all. The row shows **Needs the CP** and contributes 0
until the player looks the number up.

**Next:** assume **16 participants** at a League Challenge unless there is
evidence otherwise, apply the kicker, and score it. Entering a CP is the evidence
that overrides the assumption — and, being a valid published award, it also proves
the kicker was met.

At 16 participants the published kickers allow:

| Finish | Kicker | CP | At 16 players |
|---|---:|---:|---|
| 1st | 0 | 15 | pays |
| 2nd | 4 | 12 | pays |
| 3rd–4th | 8 | 10 | pays |
| 5th–8th | 14 | 8 | **pays — the deepest that does** |
| 9th–16th | 25 | 6 | does not pay |
| 17th–32nd | 48 | 4 | does not pay |

That is not the assumption being harsh; it is the rule. A 16-player Challenge
genuinely pays nothing below 8th, because the 9th–16th band needs 25 entrants.

> **Open — what is the equivalent figure for a Cup?** 16 was given for Challenges.
> The ladder currently assumes 17 for a Cup, which was chosen to cap it at a top 8
> and nothing deeper. Reused for scoring, a 13th place at a Cup would score 0 —
> right for a 17-player Cup, wrong for the 60-player Cup you said they rarely
> exceed. A larger figure scores more finishes but claims points a small Cup would
> not pay.

**The trade being accepted, stated once:** an assumption that scores is an
assumption that can be wrong. A 13th at a genuinely 30-player Challenge really
earns 6 CP, and this will record 0. Entering the CP fixes it, and that is the
escape hatch — but the app will now be quietly wrong sometimes where before it
was loudly incomplete. That is the right trade for a planner; it should not be
made silently.

---

## 2. Drop the "Needs the CP" and "Excluded by BFL" chips

**Needs the CP** disappears on its own once §1 lands — there is nothing left for
it to say.

**Excluded by BFL** goes too. The row already shows `BFL –/4`, which says the same
thing in less space and in the same vocabulary as every other row's `BFL 2/4`. A
chip repeating it is the app explaining a rule it has already applied.

Keeping: **Check this** (the player must act), **Below kicker** (the result really
is worth nothing), **Direct invite** (the biggest outcome in the product).

---

## 3. Stop naming the band

**Now:** `9–16 band` under every scored row.

**Next:** nothing. Mapping a finish to a band is the calculator's job, and having
done it, restating the working adds a line to every row and tells the player
something they did not ask about. The CP figure is the answer.

Displacement stays when it is real — *"adds 190 net CP by replacing Orlando"* is
information the row cannot otherwise convey.

---

## 4. Bring back the official sources, collapsed

v2 removed the *Official sources* footer section as dead weight, and replaced its
job with a version link to the repository. Worth having on the page itself after
all, but as a closed `<details>` at the very bottom — present for anyone checking
a payout, invisible otherwise.

The URLs are already in `rules-2027.json` under `sourceUrls`, so this is a render,
not new data. Collapsed by default; it must not reintroduce the wall of footer
text v2 removed.
