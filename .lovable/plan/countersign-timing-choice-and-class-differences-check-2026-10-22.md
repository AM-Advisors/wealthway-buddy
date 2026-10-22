# Countersign timing choice and class-differences check

## 1. Fund manager chooses when countersigning happens

A new setting in Fund Setup (Documents section), set per fund by that fund's managers or Harmonious staff. Every change is recorded in the fund's Audit History.

| Option | What the investor sees | What the manager does |
|---|---|---|
| **A. Pause for countersign** (today's behavior, the default) | Signs, then waits. The wire instructions open only after the manager countersigns. | Countersigns to let the investor move on. |
| **B. Countersign in parallel** | Signs and goes straight on to the wire instructions. | Gets an email and a to-do to countersign. The investor isn't held up. |
| **C. Countersign at the end** | Finishes everything, including the wire instructions. | Gets one countersign/approval request once the investor is done (signed and wire step reached). |

What stays the same in every option:
- Identity, accreditation (Roas 506(c)), tax form and signing checks still have to pass before the wire instructions show.
- Wire instructions stay masked until clicked, every view is logged, and they are never emailed.
- No money is moved automatically. "Funded" is still recorded only when the money arrives.
- Under B and C the investment is marked **"Awaiting countersign"** until the manager signs. Ops and the manager can see this, and the investor isn't admitted until it's done.
- Changing the setting only affects investors who haven't signed yet. Anyone already waiting under A is left as they are.

## 2. Multiple classes question

- The question "Will this fund have multiple classes?" moves to the top of the Economics section, before the fee terms. It becomes Yes/No plus "How many classes?".
- **No, or 1 class:** nothing else changes. The fund uses one set of terms, as it does today.
- **Yes, with 2 or more classes:** a required class check opens. Each class has a name, which investors it applies to, and its own terms. Any term can be marked "Same as fund default":
  - Management fee (rate, basis, frequency)
  - Minimum investment
  - Carried interest
  - Preferred return / hurdle
  - Organizational expenses
  - Distribution frequency
  - Assets or allocation the class participates in (all assets, or specific holdings)
  - Other differences (free text, for anything not listed)
- A side-by-side table shows how each class differs from the fund default. The manager has to confirm that table before the class terms count as approved.
- Until the number of classes matches the classes entered and the table is confirmed, Fund Setup shows "Classes: in progress" and investors can't be assigned to a class.

## Technical details

- New setting on the fund record, with three allowed values (`pause` default, `parallel`, `after_completion`). It is saved through the existing fund-setup save, with a permanent change record.
- The wire-release check reads this setting:
  - **A:** the funding step needs the countersigned copy, as today.
  - **B and C:** the funding step opens after the investor signs and passes the existing checks. Countersign completion still runs the existing admit-to-fund process.
- Under C, the manager notice is sent once when the investor reaches the funding step, using the existing signatory-email engine and its 24-hour limit.
- New "Awaiting countersign" state shown on Ops/manager views. A server-side check stops anyone from being admitted, or receiving a capital-account entry, before countersign.
- Classes: add `planned_class_count` and a class-differences confirmation (who confirmed and when) to the fund. Extend the class record with expenses, distribution frequency, asset scope and other differences. Keep `has_multiple_classes` as the only switch.
- Tests: one test for each of A, B and C covering when the wire step opens, plus the 1-class and multi-class rules.
- Project notes to update: the "investor signs first" rule needs updating to cover options B and C. I will confirm the wording with you when I make the change.
