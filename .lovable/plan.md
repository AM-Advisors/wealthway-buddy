# Easy fee and carry terms per class and per investor

## Today
- Class fees and carry are set in fund setup, but class assignment and side letters are on separate screens. On an investor, you switch between "class" and "side letter" and only see one of them at a time.
- To create a side letter, you fill in the side letter record, then generate a draft separately, retyping the same numbers.
- There's no single place that shows what each investor actually pays.

## What we'll build

### 1. "Investor economics" table (fund Investors tab and fund setup)
One row per investor, with columns for Class, Management fee, Carried interest, Where it comes from and Status.
- "Where it comes from" reads, for example, "Fund default", "Class B" or "Side letter (proposed)".
- Investors with a proposed but unapproved change show their current terms with the proposed terms next to them.
- You can filter by class or by "has a side letter", and select several investors to change at once.

### 2. One "Change terms" dialog per investor (or for several selected investors)
Pick one option:
- **Fund default:** clears any class.
- **Assign to a class:** each class is shown with its fee and carry so you can compare before choosing.
- **Custom terms (side letter):** management fee and carry fields start with the investor's current terms. Choosing 0% or waived works, and you can add other items like the minimum or information rights.

On save, the dialog creates the proposed side letter record and its combined draft letter together. The draft names the governing Operating Agreement and Subscription Agreement and the current fund terms. You type the numbers once.

### 3. Faster class setup
In fund setup, each class row gets quick-pick fee and carry buttons (0, 0.5, 1, 1.5, 2, 2.5% and 0, 10, 15, 20, 25, 30%), plus "Copy from fund default" and "Duplicate class".

### 4. Pending investors
A side letter can be created before the investor exists (like the Erebor 0% letter). When that investor is later added to the fund, the platform offers to link the waiting side letter to them in one click.

## Not changing
- Approval rules stay the same: a different person approves, or a Super Admin approves themselves with a recorded reason. Nothing takes effect until approved.
- Investors who have signed or funded can't be moved to different terms quietly; that still needs review or an amendment.
- Generating drafts stays Harmonious-only, so fund managers can propose terms but not generate documents.
- The $1,500 side-letter fee and close pricing count are unchanged.

## Technical details
- The effective-terms resolver is a new pure helper: fund default, then class, then active side letter, then pending side letter, in that order. It reads only active or recorded rows, with tests.
- The dialog reuses the existing class-change preview/change functions and side-letter proposal, plus the existing combined-letter generation with its governing documents. A pending-investor side letter is linked through the existing proposal amend path with a recorded event.
- There is one shared component in the Investors tab and fund setup, replacing the class/side-letter switch. Existing ClassAssignmentCard and SideLetterRegistry stay available as detail views.
- Tests use made-up data for resolving terms, the order of precedence, multi-select proposals and the signed-investor block.
