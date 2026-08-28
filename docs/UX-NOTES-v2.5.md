# UX notes — the round after v2.4

Raised 2026-08-28 against the deployed v2.4.

---

## 1. Dates that line up

**The problem is proportional digits.** `1` is narrower than `8` in the body face,
so `2027-01-15` and `2026-09-18` are different widths even though both are ten
characters. Every date column in the app is therefore slightly ragged, and worse
the more `1`s a date contains.

**The fix is `font-variant-numeric: tabular-nums`**, which selects the face's
fixed-width figures so every digit occupies one advance. It costs nothing and is
already used on the totals and the CP columns; the date columns were missed.

Then give the date its own fixed-width column rather than letting it sit at the
end of a flexible label, so the left edges align down the list as well.

## 2. Global Challenge dates become `YYYY-MM-00`

They are published by month, so they currently read **September 2026** while every
other event reads **2026-09-18**. One list, two formats, neither aligning with the
other.

Write them as `2026-09-00`. The `00` is honest — it says *this month, day not yet
announced* — and it keeps every date in the catalog exactly ten characters, which
is what makes the column align at all.

> **Open — the plan rows show a different format again.** A major in the plan reads
> `Sept. 18–20`, the official range, because the catalog carries it. That is more
> informative but it is variable width and cannot align. Options: use ISO
> everywhere and lose the range, or keep the range and accept that only the catalog
> aligns. Consistency argues for ISO.

## 3. The CP and Place inputs are still too wide

Set to 3.6rem, which should fit four characters — but a `type="number"` input
carries **spinner arrows**, and those eat roughly 15px of the field before any
text. That is the width that looks wrong, not the characters.

Suppress the spinners (`appearance: textfield`, and the WebKit pseudo-element) and
size the field to four digits of the tabular figures. The arrows are no loss: the
values are typed, not nudged.

## 4. The goal line

- **Championship Points Goal:** becomes **CP Goal:**
- The field narrows to four characters, same treatment as above.
- **Last season** becomes **2026**, **This season** becomes **2027**.

The years are better than the relative words: they are shorter, and they say which
season the figure is from rather than making the reader work it out. The button
titles still explain what is being filled and from which rank.

## 5. Mobile plan rows

At 390 px a row currently stacks title, then inputs, then CP and the remove button
together. Two moves:

- **The remove ×** goes to the **top right**, level with the event title.
- **The earned CP** goes to the **bottom right**, below the inputs.

That puts the two things a row is *about* — what it is, and what it scored — on the
outer corners, and leaves the middle to the inputs. It also stops the destructive
control sitting next to the number the row exists to show.
