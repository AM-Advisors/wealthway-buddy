# Stage 3 — Harmonious Operations (proposal only, not built)

## Principle

Operations is a separate place, not extra menu entries inside the client
platform. It shares sign-in and shared visual building blocks, and nothing
else: its own menu, its own record pages, its own permission checks. Being
signed in never grants entry; only an active Harmonious staff assignment does,
re-checked by the backend on every request.

## Shape: records first, pages second

Today Operations grows by adding another page each time a need appears. Stage 3
turns it around: a small number of record types, each opened as one page with
tabs, plus a short list of queues that lead into those records.

Record pages:

```text
Client    Overview · Relationships · Funds · Companies · Investors · Documents · Tasks · Activity
Fund/SPV  Overview · Investors · Investments · Capital · Banking · Accounting · Tax · Regulatory · Documents · Activity
Investor  Overview · Profiles · Investments · Capital · Tax · Documents · Identity checks · Activity
Company   Overview · Cap table · Stakeholders · Transactions · Documents · Reports · Activity
```

Menu (destinations, not backend concepts):

```text
Home · Clients · Funds & SPVs · Companies · Investors · Onboarding & checks
Capital & banking · Accounting · Tax · Regulatory & filings · Documents
Tasks & activity · Reports · Administration
```

Everything that exists today keeps working: NAV review, reconciliation,
allocation runs, valuation review, ledger and workpapers become sections inside
Accounting or inside the fund record, reached from the queue that needs them.
No page is deleted; old addresses keep resolving.

## Home as a work list

Home is the queue, built only from real workflow state: what is waiting for
preparation, what is waiting for review, what is waiting for approval, what is
blocked. Each item opens the record and the tab where the work happens. No
counts that lead nowhere.

## Permissions

Replace the two internal flags (administrator, operations) with named
capabilities per area, each split into see / prepare / review / approve /
execute. The separation already enforced in money movement and accounting stays
exactly as it is — this only names it consistently everywhere. Nobody both
prepares and approves the same item. Menu visibility remains cosmetic; the
backend decides.

## Address move

Operations moves to its own address. During the move both addresses work, the
old one redirects, and deep links and invitation links already sent keep
resolving to the right place.

## Order of work

1. Capability model and staff-only entry check, with tests, nothing moved.
2. Operations shell and menu at the new address, existing pages reached through it.
3. Client, Fund, Investor, Company record pages assembled from existing pages.
4. Home queues from authoritative workflow state.
5. Old addresses redirect; legacy links verified.

Each step ends with the full test suite, typecheck and a production build, and
no change to financial behaviour, money movement or delegated transaction
authority.
