# Plan: one shared source of truth and investor self-completion

## Goal
Investors, fund managers and Harmonious all see the same status for each investment, read from the same records. An investor can finish every step on their own, with no waiting on Harmonious or the manager, except the protected steps that must stay (fund countersignature, money checks, real identity mismatches).

## What we know today
- Investor progress already comes from one shared rules file (investment readiness) used by the investor journey, the manager roster, Ops Funds, the "View as" perspective and signing.
- Ops Funds reads a saved summary of that readiness, refreshed a few rows at a time, so it can lag behind what the investor sees.
- Several fixes this month (Larry, Kim, Joe) were places where a screen used its own logic instead of the shared one. The diagnosis for remaining gaps is not confirmed yet; step 1 confirms it.

## Step 1: Audit (read-only, report back to you)
- List every screen showing investor status (investor journey, manager roster, Ops Funds, stalled investors, Approvals, Investor 360, View as) and confirm each one reads the shared readiness rules, not its own copy.
- Compare real saved summaries with live readiness for every open investment and list any that disagree.
- List every step where an investor currently waits on someone else, and why (e.g. an approval, an inactive document, a missing manager setting, a trustee detail only staff can enter).
- You get a plain-language list: "connected", "out of sync", "blocks the investor".

## Step 2: Fix the connections
- Point any screen that uses its own logic at the shared readiness rules.
- Refresh the saved summary whenever an investor, helper, manager or staff save changes something, so Ops never lags.
- One test per screen proving it shows the same status as the investor.

## Step 3: Let investors self-complete
- Trustees and owners add their own SSN, birthday, address, phone and citizenship from their own login.
- Trust question becomes "Does your trust have its own EIN?" Yes/No.
- Accreditation upload, tax form, W-9 and About you advance automatically with no routine review gate.
- "Ready to sign?" check runs before signing is offered; if a fund document is inactive or a fund setting is missing, the manager is alerted right away instead of the investor getting stuck.
- One clear "next" button per person, and a "what's left" list on the investor's own screen matching the stalled-investors page.

## What stays protected
Fund countersignature (approval), money movement, real identity/screening mismatches, locked tax ID type changes, signed history. These still need the right person, but each one alerts its owner automatically.

## Release
Sandbox validated; production verification pending. No production records changed and nothing published without your go-ahead.
