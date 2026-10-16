# Publish, then self-serve SaaS sign-up with SOW picker and purchase-gated menus

## 0. Publish now
Publish the current changes first: SPV servicing tiers, no monthly pricing and the single search box. Then build the steps below.

## 1. Service picker (clients, no sales call)
A new "Build your plan" page, reachable from the pricing page ("Start now") and from inside the client app. Clients pick:
- **SaaS platform fee:** per fund, with a fund count.
- **Servicing tier:** Self Serve, Core, Plus or White Glove. Institutional stays "Talk to sales".
- **À la carte services:** for example, fund documents at $500 each.
- **Cap table plan:** Starter, Growth or Scale. Enterprise stays "Talk to sales".
- **Billing:** yearly or quarterly. There is no monthly option.

A live total shows as they choose. Prices always come from the live rate card on the server, never from the browser.

## 2. Generated SOW, click-through signature
- The picks become a Statement of Work: a scope and pricing schedule under the standard Harmonious MSA, shown in full on screen and printable.
- **The MSA is required and can't be changed.** Clients agree by ticking one box ("I agree to the Master Services Agreement and this Statement of Work"). They can't edit, redline or request changes. Only Institutional and Enterprise deals, handled by Sales, can get a negotiated MSA.
- The client signs with the existing signature popup. For self-serve SaaS orders, the SOW is **active immediately**, with no Harmonious countersignature. Your name, timestamp, IP and the exact price snapshot are logged permanently. Sales and Legal see each one in an "Auto-activated SaaS SOWs" list to review afterwards.
- Sales-drafted SOWs keep the current two-party countersign rule.

## 3. Payment, then KYC/KYB, then access
```text
Sign up -> Picker -> Sign SOW -> Card checkout (yearly/quarterly)
        -> Identity check (person) + business check (company)
        -> Access opens to purchased areas only
```
- Card subscription through the existing Stripe setup. Access never opens on an unpaid or failed payment, and lapsed payments suspend access.
- **KYC:** the signer goes through the existing identity flow. **KYB:** the company is verified (legal name, EIN, formation state, beneficial owners) through the same verification provider's business check.
- Until all three pass (signed, paid, verified), the client sees only a "Finish setup" checklist page.
- Possible watchlist matches go to the existing compliance review. Nothing auto-approves.

## 4. Menus show only what's purchased, for everyone
- Each client's sidebar and pages follow their **active entitlements**. For new sign-ups these come from the paid SOW. For current clients they come from their active SOW scope.
- Pages not purchased are hidden from the menu, and the server refuses them too. Opening one directly shows "Not in your plan" with an "Add to plan" button.
- **Safety for current clients:** before switching it on, I'll produce a report of every current client and what they would lose. Any client with no mappable active SOW keeps today's menu (marked "legacy access") until Sales assigns one, so nobody is cut off by surprise.
- Staff and Operations menus are unchanged.

## Not included
- Institutional and Enterprise checkout (stay with sales).
- Automatic refunds or proration. Changes are handled by staff, per the money-movement rule.

## Technical details
- **New tables:**
  - `client_entitlements` (client_id, entitlement key, source sow_id / subscription, status, starts/ends), append-only events. GRANTs + RLS: clients read their own; writes only via the server.
  - `client_sows.activation_mode` (`countersign` | `saas_clickthrough`). Default is countersign; existing rows unchanged.
  - `kyb_checks` (client_id, provider session, status, results), the same pattern as the identity checks.
- **Entitlement model:** pure `src/lib/entitlements.ts` maps rate-card lines to nav keys (funds, cap_table, documents, tax, reports, servicing level…). `navigation.ts` filters the client menu by it. Every client server function behind a gated area calls `assertEntitlement`.
- **Checkout:**
  - New `saas_*` Stripe prices (yearly/quarterly) created via payments tools. Session built server-side from the signed SOW's price snapshot; `managed_payments` per tax guidance.
  - The webhook writes subscription status, and entitlements activate only when the SOW is active, the subscription is active, and both KYC and KYB are approved. Recomputed on each event.
- **AGENTS.md:** record the click-through exception to the two-party SOW rule (SaaS self-serve only) and "entitlements gate client menus + server checks".
- **Tests:** no monthly billing in the picker; a SaaS SOW activates without countersign while a sales SOW does not; access opens only when paid + KYC + KYB are all true; a missing entitlement hides the menu item and the server refuses it; clients without a mappable SOW keep legacy access.
