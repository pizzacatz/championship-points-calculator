# Placement plus real attendance — the round after v2.6.2

Raised 2026-08-28. Discussion only, nothing implemented.

**The proposal.** Placement becomes the input. Where the placement's band depends
on a kicker that cannot be settled, ask for the tournament's total attendance —
and for majors, look that up from rk9 or Limitless rather than asking at all.

---

## 1. The data supports it, and the errors all run one way

Today a completed major is priced against its **rating zone's median**, because
the app has no per-event attendance. Measured against every *possible* placement
at every real 2026 event:

| Zone | Median assumed | Mispriced | Worst case |
|---|---:|---:|---|
| VGC NA | 705 | 1% | 33rd at a 99-player event: says 120, really 0 |
| VGC EU | 661 | 4% | 129th at 415: says 60, really 0 |
| TCG NA | 2,270 | 8% | 129th at 350: says 60, really 0 |
| VGC LA | 214 | 11% | 33rd at 77: says 120, really 0 |
| VGC AP | 210 | **19%** | **17th at 43: says 160, really 0** |

Two things matter more than the percentages.

**Every error is in the same direction.** The median never understates; it only
ever credits points that were not earned. A tool whose whole posture is *never
imply you have qualified* currently inflates results in the small zones by up to
one result in five.

**The zones it fails are the ones already worst served.** Oceania and Latin America
have the smallest, most variable fields, the fewest invitation slots, and now the
least accurate scoring.

## 2. A placement can never prove its own kicker

Worth stating because it looks like it should. If you finished 64th, at least 64
people were there — but the 33rd–64th band needs **129**. Every kicker is roughly
twice its band's last place:

| Band | Last place | Kicker | Proven? |
|---|---:|---:|---|
| 1 | 1 | 0 | yes |
| 3–4 | 4 | 8 | no |
| 33–64 | 64 | 129 | no |
| 129–256 | 256 | 513 | no |

So only outright victory is self-proving. Everything else genuinely needs a number
from somewhere, which is what makes the proposal necessary rather than merely tidy.

## 3. The timing works out

A placement is only ever entered for an event already played — and that is exactly
when its attendance exists. Limitless publishes Masters counts within days; rk9
rosters are available immediately.

That is a better fit than it first appears: the app never needs attendance for a
*planned* event, because the ladder projects those from the zone median, where a
median is the right tool.

**The gap:** an event played but not yet published. A fallback is needed — the zone
median, or asking. Small window, but it must not silently mislead.

## 4. What it would cost

- **The catalog carries per-event attendance.** `refresh-catalog.mjs` already
  matches catalog events to Limitless rows by city to pick up rk9 tournament ids;
  the player count sits in the same row. This is a field, not a new pipeline.
- **Pokémon GO has no permitted source.** Limitless does not cover it, and the rk9
  figure is the one that has never reconciled — 156 against Liquipedia's 174 for
  Orlando 2026. GO majors would keep falling back to asking.
- **Locals keep the question**, since nothing publishes Cup and Challenge turnout.
  With the assumed 16 and 32 they mostly will not need it: a top 8 at either is
  already covered, and only deeper finishes would prompt.

## 5. Open questions

**Does CP entry go away?** If placement plus a looked-up attendance gives an exact
answer, the CP field is redundant for majors. One number instead of a choice of
two is simpler, and it is the direction this app has been moving. But CP is what a
player sees on their Trainer Central profile, and some will know it when they have
forgotten where they finished. Dropping it trades a small amount of reach for a
cleaner model.

**When does the attendance prompt appear?** The narrow rule is "only when the answer
depends on it": if a looked-up attendance settles the band, ask nothing; if not, and
the band's kicker is above what can be assumed, ask. That keeps the prompt rare and
meaningful, which is what the *Needs the CP* chip failed to do.

**What does it show once known?** An attendance is evidence, not a result. It could
stay invisible once entered, or read quietly beside the placement — *"64th of 300"* —
which is also how a player would describe it themselves.

---

## 6. If CP entry goes

Leaning toward removing it, so the row asks for one thing rather than offering a
choice of two.

### 6.1 The real simplification is the absent decision, not the field count

The row does not get shorter — placement, and sometimes a turnout, is still one or
two inputs. What goes is the **choice**: today a player has to decide *which*
number to give before giving it. That is a small cognitive tax paid on every row,
and it is the kind of thing that makes a form feel heavier than its field count.

### 6.2 A turnout prompt must not be a prompt

The obvious rule — *ask whenever the band's kicker exceeds what we assume* — fires
far too often to be tolerable, and almost always to no purpose:

| | Would prompt | Of those, really earn 0 anyway |
|---|---:|---:|
| Challenge assumed 16, actual 16 | 8 of 16 | 8 |
| Cup assumed 32, actual 32 | 24 of 32 | 24 |
| Cup assumed 32, actual 60 | 52 of 60 | 44 |

At a genuinely 32-player Cup **every** prompt would be answered "32" and produce
the same zero. Only about 8 of 52 ever change an answer.

So the turnout should be a **shown, editable default**, not a question: the
assumption is used, the player corrects it only if a zero looks wrong. That keeps
the quiet path quiet, and is the lesson the *Needs the CP* chip taught — a control
that fires whenever the app is unsure, rather than whenever it matters, becomes
noise the user learns to ignore.

### 6.3 Where accuracy actually matters, there is a lookup

Weighting by what a plan can hold:

| Bucket | Ceiling |
|---|---:|
| Regional / Special / International | 2,500 CP |
| Global / Grand Challenge | 300 |
| League Cup | 200 |
| League Challenge | 60 |

**Majors are 82% of the ceiling — and they are exactly the events with a published
attendance to look up.** The friction of an assumed turnout lands on the smaller
fifth of a plan, and the part that decides a season is priced exactly.

### 6.4 What removing CP entry costs

- **A player who knows their CP but not the turnout** loses the direct route. They
  would enter a placement, see a zero that looks wrong, and have to remember how
  many people were there. Recoverable, but less direct than typing 20.
- Locals are where this bites, and locals are 8% of the ceiling.

### 6.5 What it gains beyond simplicity

- **Validation gets stronger.** Today it checks a CP against the payout table.
  With a placement and a known turnout it can check something more meaningful:
  *you cannot have finished 400th at a 300-player event.*
- **Direct invitations get simpler.** Currently inferred from the CP value (350 at
  a Regional); with a placement it is just *did you finish in the top N*.
- **A retired insight.** v2's input model rested on every CP value being unique
  within its table, which is what let a CP identify its band. That property was
  the reason CP could be an input at all. Removing CP retires the idea that
  justified it — worth recording, because it reads as a regression otherwise.
