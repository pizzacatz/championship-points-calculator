# Why the design changed

Both versions of this product were specified on the same day. v1 shipped, worked,
and was then judged over-designed. This explains the reasoning behind each major
decision **as it was originally made**, and the reasoning that replaced it.

It is written to be fair to v1. Almost none of those decisions were careless — most
followed correctly from a premise that later turned out to be wrong, or were right
in principle and wrong in implementation. Knowing which is which is the useful part.

---

## 1. Nine input fields per event

**v1 decided:** each result carries status, name, date, placement, CP awarded,
attendance, best-finish constraint, commitment and notes.

**Why, at the time.** Every field had a consumer. Attendance resolved kicker-
dependent bands. Best-finish and commitment fed the three path generators. Status
separated current CP from projected. Name, date and notes made a long plan
readable. v1 §6 reasoned carefully about *when* attendance is genuinely required
and concluded — correctly — that a valid positive CP award already proves the
kicker was met, so attendance should stay optional. That is good thinking.

The flaw was not in any single field. It was that nobody added them up. Nine fields
per event and seven settings meant **34 inputs to log three events**, and no
requirement in the document was responsible for that total.

**v2 decides:** one number per event — the CP, or the placement, either one.

**Why it changed.** A property of the data settled it:

> Every CP value is distinct within its event type's payout table. Verified across
> all five tables — League Challenge (6 bands), League Cup (7), Regional/Special
> (11), International (11), Online Challenge (11). No duplicates anywhere.

So a CP award is a unique key into the table. Typing `350` for a Regional *is*
typing "1st place, kicker 0, direct invitation earned". Placement becomes derivable,
and so does everything attendance was needed for.

The rest fell out. Best-finish and commitment lost their consumer when the generator
went (§3). Status became derivable (§5). Name and date come from the catalog.

**The lesson:** the fields were not independently wrong. They were downstream of a
feature. Removing the feature removed most of the form.

---

## 2. Placement as the input, CP as the output

**v1 decided** (§16.4): *"Users enter exact placements, and the calculator maps them
to published CP bands."*

**Why, at the time.** Placement is what you remember walking out of an event. You
know you came 13th; you probably do not know that 13th at a League Cup pays 20 CP.
Asking for the thing the player actually has is sound interface design.

**v2 decides:** either one. Both fields are present; fill whichever you have.

**Why it changed.** Two reasons.

First, the premise was only half true. Many players *do* know their CP — it is on
their Trainer Central profile and on every leaderboard — and for a season already in
progress the CP is often the easier number to lay hands on.

Second, and more decisive: **placement alone is ambiguous where CP is not.** A 13th
place only pays if the kicker was met, so placement needs a field size to resolve.
CP needs nothing. v1 handled this by asking for attendance as a third field; v2
handles it by accepting whichever number the player has, and resolving placement
against the projected field size when that is the one supplied.

Note this is not a reversal. v1's reasoning survives — placement is still a
first-class input. v2 only stopped making it the *only* one.

---

## 3. Three generated path strategies

**v1 decided** (§16.8, FR-4): return least-demanding, fewest-event and
best-use-of-committed paths, defaulting to least demanding.

**Why, at the time.** Players have different planning temperaments. Some want the
easiest finishes; some want to travel as little as possible; some have already
committed to events and want those used. Three strategies serve three real people.
It is a defensible product decision, and v1 implemented it properly — deterministic,
lexicographically ordered, respecting Best Finish Limits.

**v2 decides:** no strategies. One ladder.

**Why it changed.** The question the product is actually asked is:

> *"If I attend these events, what is the worst I can do and still qualify?"*

Against that, **fewest events answers a question nobody asked.** It optimises for
minimising travel — but by the time you are reading output, the event list is
already settled; you chose it, and unchecked what you could not reach. The list is
an input, not something to optimise.

And **best-use-of-committed went degenerate.** Once adding an event means committing
to it (§4), there are no optional events left to minimise, so the strategy collapses
into "use everything" — which is roughly what least-demanding already returns.

That left one strategy, which is not a strategy. It is just the answer.

**What was gained beyond simplicity.** The ladder exposed a bug v1's generator
shared: it could propose bands whose kicker the field would never meet. Relaxing an
International as far as the table allows lands on 513–1024, which needs 2,049
players against a projected field of 1,096 — a finish worth **nothing**. v2
restricts every event type to the bands its projected field actually unlocks. v1
had the same latent flaw and no test that would have caught it.

---

## 4. Optional versus committed events

**v1 decided** (§16.5): *"Only explicitly added events are feasible. Added future
events are optional unless marked committed."*

**Why, at the time.** Two distinct ideas, both good. The first — only added events
count — exists so the calculator never recommends an event the player cannot get
to; v1 FR-3 is explicit that feasibility must not be inferred from travel or cost
data. Adding an event *is* the player asserting they can attend it. The second — an
optional/committed distinction — let the generator prefer events already locked in.

**v2 decides:** adding an event is committing to it. No flag.

**Why it changed.** The bulk-add checklist made the flag redundant. You add a whole
zone, then uncheck what you cannot reach — so unchecking, not a per-row dropdown, is
where the assertion of feasibility lives. What remains on the list is by definition
what you are attending.

v1's *first* principle is untouched and, if anything, more load-bearing than before:
bulk-add would reintroduce exactly the problem it prevents if the output were
allowed to prune the list for you. It is not. The player prunes; the ladder then
tells them what those events demand.

---

## 5. The completed / planned toggle

**v1 decided:** every result carries an explicit status.

**Why, at the time.** It was genuinely necessary. v1 allowed a planned event to
carry a hypothetical value — "if I finish 9th at Orlando" — so the app had to know
whether a number was a fact or a supposition. Without the toggle, current CP and
projected CP could not be separated.

**v2 decides:** status is derived. A row with a number is a result; a blank row is
one the ladder solves for.

**Why it changed.** The hypothetical-value case disappeared. In v2 you do not tell
the app what you *might* score — that is the ladder's job. So the only reason to
carry a number is that you earned it, and the presence of a number says everything
the toggle used to.

This one only became visible during the build: the browser test caught that typing a
CP on a catalog event did not register, because catalog events defaulted to
"planned". The fix was to delete the concept rather than default it differently.

**A consequence worth noting.** Once blanks score zero, the engine's "projected
total" equalled its "current total" and the stat became meaningless. Projection now
comes from the ladder — current CP plus what the ladder says the blank events would
return — which is the number a player actually wants.

---

## 6. Attendance baselines: lowest, and not split by zone

**v1 decided** (§6 and §16, Q1–Q2): the projected field for a planned major is *"the
single lowest Masters attendance observed during the previous season"*, held
separately by game and event category but **not** by rating zone. Its stated reason
for the second half:

> *"kicker eligibility depends on attendance at the selected event, not the player's
> home zone."*

**Why, at the time.** Both halves are principled. The **lowest** figure is the
conservative choice — it never promises CP a player will not reach, and for a
planning tool that is the safe direction to be wrong in. And the zone reasoning is
*correct*: your home region has no bearing on how many people turn up to the event
you enter.

**v2 decides:** the **median** of the pool, split by **the event's** rating zone.

**Why it changed.**

On zones, v1 conflated two different things behind one word. Its reasoning rejected
splitting by the *player's* home zone — which is right, and v2 still does not do
that. But it did not consider splitting by the *event's* zone, which is exactly what
its own reasoning implies: what matters is the field at the event you enter, and a
Regional in Latin America draws a different field from one in North America.

The cost of the omission was large. v1 applied a single global baseline of **180**
to every planned Regional, including North American ones that median **705** — a
fourfold understatement, suppressing bands NA players would comfortably reach.

On lowest-versus-median, the conservative instinct was right until Specials were
pooled into the zone pools, which introduced low outliers the mean and the minimum
both over-weight. Oceania ran four events — 43, 210, 278, 291. Its *mean* of 206
sits below three of them, dragged there by one 43-player Auckland Special. The
minimum, 43, is worse still: it would model every planned Oceania Regional as a
43-player event. The median of 210 sits inside the real cluster.

**What survived:** the conservatism. Medians round down on an even count, and every
figure is still a trailing observation rather than a forecast.

---

## 7. Source transparency in the footer

**v1 decided** (FR-8): the app displays rules version, last verified date, official
source links, and a visible notice when data is stale.

**Why, at the time.** The provenance *is* the product. A CP calculator that is
quietly wrong is worse than no calculator, so showing where every number came from
is how it earns trust. Entirely right.

**v2 decides:** remove the three footer sections. Replace them with one low-contrast
line carrying the app version and the rules version, linked to the repository.

**Why it changed.** The requirement was right; the implementation was three heavy
panels of prose that every user scrolled past on every visit. A version string that
links to the repo — where `DATA-SOURCES.md` documents every endpoint and
cross-check — satisfies the same requirement at a fraction of the page weight.

**What deliberately did not move.** v1 §3's honesty rules — never describe reaching
the target as qualifying, say plainly when a total is below the previous cutoff,
report a direct invitation when earned — render in the target strip, not the footer.
Removing the footer did not touch them, and a test now asserts the removed sections
are gone *and* that those callouts still appear.

---

## 8. The technology stack

**v1 decided:** React, TypeScript, Vite, static deployment to GitHub Pages, with a
pure calculation module and rules data held in versioned JSON.

**Why, at the time.** Editable rows, derived summaries and path state justify a
component framework; keeping the engine pure and the rules external is what makes
the fixtures possible.

**v2 decides:** unchanged.

**Why.** It was never the problem. Worth stating plainly because it was initially
misdiagnosed as one — the first response to "over-engineered" was an analysis of
bundle size and file count, which was answering a question that had not been asked.
The complaint was about the *form*: what the app displays and demands. A 247 KB
bundle asking for one number is a better product than a 15 KB bundle asking for
thirty-four.

---

## 9. What v1 got right that v2 inherited unchanged

Worth listing, because a rewrite tends to obscure how much did not need rewriting.

- **The whole engine.** Kickers, Best Finish Limits, bucket displacement,
  deterministic tie-breaking by input order. Not one line of the arithmetic changed.
- **Rules as data, not code.** v1 insisted the CP tables live in versioned JSON with
  a verification date, so a mistyped band fails a test rather than shipping. That is
  why the tables could be trusted through two redesigns.
- **The honesty posture.** v1 §3's refusal to call anything "qualified" set the tone
  for everything after it, including v2's decision to flag unverifiable data rather
  than fill it in.
- **Only added events count.** More important in v2 than in v1, because bulk-add
  would otherwise recommend cities the player has never considered.
- **Accessibility.** WCAG AA, keyboard operation, 320px, reduced motion — specified
  in v1 §8 and carried forward with tests.

---

## 10. The pattern underneath

Three of the changes above share a shape.

The **generator**, the **commitment flag** and the **status toggle** were each
individually justified, and each became unnecessary once something upstream changed.
Nine input fields were not nine mistakes; they were one feature with eight
dependents.

And two of the reversals — attendance zones, and the footer — were cases where v1's
*stated reasoning was correct* but its implementation did not follow from it. v1
argued that what matters is the field at the event you enter, then used one global
number. v1 argued that provenance builds trust, then built three panels nobody read.

The useful review question is not "is this requirement justified?" — v1's all were.
It is "what does this requirement cost, and what would have to change for it to stop
being needed?"
