# UX notes — the round after v2.5

Raised 2026-08-28 against the deployed v2.5.

---

## 1. Global Challenge names lose their dates

`Global Challenge — September 2026` becomes `Global Challenge`. The date column
beside it already says which month.

> **This breaks the catalog checkboxes and must be fixed with it.** Every event in
> the catalog is tracked by **name** — `addedNames` is a `Set<string>` of them. Six
> events all called *Global Challenge* collapse to one key, so ticking September
> would tick all six, the `0 of 6` count would read `6 of 6`, and *Clear* would
> remove the lot.
>
> The fix is to key on something unique. `name + date` is already unique across the
> whole catalog and needs no new data.

## 2. Em-dashes become commas

Nine in rendered text, listed below. The rest of the matches in the source are
prose in code comments, which are not "on the site" — leaving those.

| Where | Now |
|---|---|
| Overdue row | *"…or remove it — it is not counted"* |
| Target reached | *"…not a Worlds qualification — the season-end cutoff moves"* |
| Ladder empty state | *"…leave it blank — this is where it tells you"* |
| Ladder idle row | *"outside your Best Finish Limit — adds nothing"* |
| Direct invite | *"…Championships — a qualifying finish"* |
| Goal button titles ×2 | *"2026 final cutoff — rank 90 in US and Canada"* |

> **One is not punctuation.** `fmt()` renders an em-dash as the placeholder for a
> missing number — the GOAL figure shows `—` when no benchmark exists. A comma
> there would read as a mistake. Suggest an en-dash `–` or simply `?`.

## 3. Mobile: the CP moves up beside the inputs

v2.5 put the earned CP on its own row at the bottom right. It goes back in line
with the CP and Placement fields, so a row is two rows rather than three.

## 4. "Place" becomes "Placement"

> **The label is now wider than its field.** *Placement* is about 50 px at the
> label size; the field is 46 px, sized to four digits. The label will overhang
> slightly or wrap. Either let the label set a slightly wider field, or accept the
> overhang — labels are not required to fit their controls, and the pair still
> reads as a unit.

## 5. Mobile: a calendar icon for local dates

**Now:** a manually added Cup or Challenge shows a full `<input type="date">`,
which on a narrow screen is a wide control carrying `mm/dd/yyyy` before anything
is entered.

**Proposed:** a calendar icon to the right of the event name. Tapping it opens the
native picker; once a date is chosen the icon is replaced by the date itself.

**Feasible.** `HTMLInputElement.showPicker()` opens the native picker on demand and
is supported in current Chrome, Edge and Safari 16+. The pattern is a visually
hidden date input plus a button that calls `showPicker()` on it, falling back to
focusing the input where the method is missing.

Three things to settle:

- **What format does the chosen date show in?** The request says *"Month Day, like
  the Majors"* — but as of v2.5 majors read `2026-09-18`, not `Sept 18`, precisely
  so the date column lines up. Matching the majors now means ISO. Showing `Sept 18`
  would reintroduce the ragged column v2.5 removed.
- **The icon needs an accessible name.** An icon-only control has no text, so it
  needs an `aria-label` — *"Set the date for this event"* — and the button must
  still say which event it belongs to.
- **Undated rows sort last.** That is already true, so a Cup keeps moving up the
  list the moment a date is set. Worth knowing, not a problem.

**Desktop is unaffected** — the request is mobile-only, and the inline date field
is fine at full width.
