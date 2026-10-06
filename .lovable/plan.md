# Simplify Funds: one place per fund, same view for Harmonious and Fund Managers

## Problem
- Operations has three overlapping places: **Funds & SPVs**, **Fund Setup**, and **Readiness queue**. Each shows the same fund with different numbers and buttons.
- Fund cards show too much: status, agreement, setup %, investors, onboarding, ready, attention, next close, owner, plus "View Fund Manager", "View as Fund Manager" and a menu.
- Fund Managers only see some funds once they are ready, so the two sides go out of sync.

## New structure

```text
Operations sidebar
  Funds                 <- replaces Funds & SPVs + Fund Setup + Readiness queue
    tabs: In setup | Live | Closed | All

Fund page (same page for Harmonious and Fund Manager)
  Header: name, status, setup %, one primary "Next step" button
  Tabs: Overview | Setup | Investors | Documents | Banking | Team & Fees | Distributions
```

### 1. One Funds list
- A single table with one row per fund: **Fund · Client · Stage · Setup % · Investors (ready/total) · Next step · Owner**.
- Filter tabs replace the separate pages: In setup, Live, Closed, All.
- Clicking a row opens the fund. Leave only **one** row action: "Preview as Fund Manager" (eye icon). Everything else moves into the fund page.
- The old links (/ops/fund-setup, /ops/readiness, /admin/funds) redirect to the new list so nobody's bookmarks break.

### 2. One fund page, both sides
- The Operations fund page and the Fund Manager fund page become the same shared screen. Harmonious-only controls (approvals, launch, delete, migration) show only for staff.
- **Setup** tab absorbs Fund Setup steps and Readiness: one checklist, one percentage, with the launch conditions at the bottom.
- **Investors** tab absorbs the Readiness queue for that fund: each investor's About You → Verification → Sign → Fund status in one table.
- Fund Managers see every fund they manage from the moment it's created, including funds still in setup. They see the same checklist and percentage as Harmonious, with read-only steps where only Harmonious can act.

### 3. Fewer buttons
- Header has one "Next step" button driven by the first open setup task, such as "Add EIN" or "Invite investors".
- Duplicate "View Fund Manager" and "View as Fund Manager" become one "Preview as Fund Manager".
- Agreement follow-up, attention items and next close move into the Overview tab instead of every card.

## What stays the same
- All permissions and server-side checks stay as they are. Showing a fund to a manager never grants new actions.
- The setup % calculation stays the single shared source, so it can't drift.
- Launch gating for investor invites is unchanged.

## Technical details
- New `src/routes/_authenticated/ops.funds.tsx` list (search param `stage`) built on the existing ops-funds server data + `fundLaunchPercents`.
- Operations fund detail renders `fund-workspace.tsx` (mode `harmonious`); manager fund route renders the same component (mode `client`). Setup and Readiness panels move in as tabs; `manager.fund.$fundId.readiness.tsx` and the ops setup route redirect to `?tab=setup`.
- Manager fund list query drops the launched/ready filter. Visibility stays scoped to the fund's managers server-side.
- Sidebar: replace the Fund Setup and Readiness queue entries with a single "Funds"; keep EIN/SS-4, Documents and HubSpot tickets as work queues.
- Redirect old URLs with `beforeLoad` redirects. Record the rule in `src/lib/AGENTS.md`.
