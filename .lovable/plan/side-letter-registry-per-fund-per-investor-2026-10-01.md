# Side Letter Registry (per Fund, per investor)

## What users get
A new **Side letters** tab on each Fund. Harmonious staff see it on the Operations Fund page, and fund managers see it on their Fund page. Both can manage the registry, and every change follows maker-checker: one person proposes a change and a different person approves it.

For each investor's side letter, the registry records:
- **Investor and investment:** the investor's existing record (Person, then Investment Profile, then Investment) on this Fund.
- **Signed document:** an optional link to the signed side letter, either from the Fund's offering documents or as an uploaded file. The uploaded file is the authoritative copy.
- **Terms:** a list of granted terms. Each term has a category (fee discount, carry reduction, reporting rights, co-invest rights, transfer rights, MFN, excuse rights, information rights, other), a plain-language description, an optional value (e.g. 1.5% instead of 2%), and an applicability note.
- **MFN / equal treatment:**
  - Mark whether the investor has MFN rights, and at what scope: all investors, same class only, or investors at or below their commitment size.
  - An **MFN review**: when a term granted to one investor is approved, the registry lists the other MFN holders who may be entitled to it. Each holder needs an explicit decision (Offered, Elected, Declined, Not eligible) with a reason.
  - Nothing is applied or changed automatically.
- **Dates:**
  - Effective date, an optional expiry date, and a renewal note.
  - Status labels show Active, Expiring within 60 days, or Expired, worked out from the dates.
  - Expired letters are kept, never deleted.
- **History:** a read-only timeline of every proposal, approval, decline and amendment.

## Maker-checker rules
- Create, amend, add or remove a term, and terminate all start as a **proposal**. Each proposal records who made it, the before and after values, and a reason.
- An eligible person other than the proposer approves or declines it. A decline needs a reason.
- **Who can approve:**
  - Harmonious staff with Fund edit permission can approve anything.
  - A fund manager can approve another manager's proposal on the same Fund.
  - When a Fund has only one manager, a manager's proposal goes to Harmonious, and a staff proposal can be approved by that manager.
- Approved terms never change in place. An amendment creates a new version, and the old version stays in history.
- Assistants and Viewers with shared fund access can see the registry. Assistants can draft proposals but cannot approve them.
- Investors cannot see the registry.
- Side letters are a record only. They never change the Fund's fee calculations, capital accounts or distributions, and they never block onboarding, funding or launch. Managers apply terms through the existing approved processes.
- No emails are sent automatically.

## Where it appears
- **Fund manager:** a Side letters tab on the manager Fund page, with a list, a detail drawer, a "Propose change" form and an approvals queue.
- **Harmonious:** the same box on the Operations Fund page, plus pending side-letter approvals in the Funds "Waiting now" list.
- **Investor detail (manager and staff):** a "Side letter: Yes, N terms, expires …" chip that links to the letter.

## Technical details
- **Database (one migration):**
  - `side_letters`: offering_id, investment_id or person_id, status, MFN flag and scope, effective/expiry dates, current version number, document reference.
  - `side_letter_versions`: append-only snapshot of the terms JSON for each version.
  - `side_letter_change_requests`: kind, payload, proposer, reason, status, decider, decision reason; a database trigger blocks self-approval.
  - `side_letter_mfn_reviews`: source term, holder letter, decision, reason, actor.
  - `side_letter_events`: append-only history.
  - Each table gets grants, RLS and read policies scoped to staff, that Fund's managers and shared-fund grantees. All writes go through server functions using the service client.
- **Pure model:** `src/lib/side-letter-model.ts` holds term categories, expiry status, MFN candidate matching (by scope, class and commitment) and approver eligibility.
- **Server:** `side-letter.server.ts` and `side-letters.functions.ts` (list, get, propose, decide, record MFN decision). Every call re-checks permissions on the server: staff with the Fund's atomic permission, a manager of that exact Fund, or a Fund Assistant (propose only).
- **Screens:** a `side-letter-registry.tsx` component, a new route `manager.fund.$fundId.side-letters.tsx`, and a tab on the Operations Fund page.
- **Rules file:** add a rule to `src/lib/AGENTS.md`: side letters are a versioned record only, maker-checker, with explicit MFN decisions and no automatic effect on economics.
- **Tests:** unit tests for expiry status, MFN matching, approver eligibility (self-approval and the single-manager case) and permission scoping.
