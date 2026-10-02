# Fund ↔ Investor enhancements: messaging, capital calls, K-1s, status

Four additions, all on the investor's fund page (My Portfolio → Open fund) so investors and fund teams finally meet in one place. Everything reuses existing server logic — no new business rules, no emails sent, no money moved automatically.

## 1. Fund ↔ investor messaging

The private one-to-one thread between an investor and the fund team already exists in code (`PortalMessageThread`, backed by `portal-messages.functions.ts`) but is only reachable on the manager's Messages page.

- New **Messages** tab on the investor's fund page. Investors write; the fund team replies in the same thread from `/manager.messages` (unchanged).
- On the fund's **Investors** tab, each investor row gets a **Message** button opening that investor's thread.
- Unread counts already exist in the thread model; show them on both sides.

## 2. Pay a capital call online

The investor-side call functions (`capitalCallForInvestor`, `investorReportsTransferInitiated`, `fundingReceipt`) exist but are wired to no screen.

- A **Payments** panel on the investor's fund page lists this fund's calls issued to them: amount, due date, purpose, and status.
- Wire instructions appear only through the existing staff-gated read (`can_read_wire_instructions`) — no standing rule touched.
- The investor clicks **I've sent the wire** to record their self-report; the team's funding board and matching flow pick it up exactly as today.
- After posting, the receipt shows instead of the call.

## 3. Tax document delivery (K-1s)

K-1s are generated in the tax module (`k1_forms`) but never reach the investor's screen.

- A **Tax documents** section on the investor's fund page lists the investor's final K-1s for that fund, with download and a **Mark as received** acknowledgment.
- If `k1_forms` has no acknowledgment column, one additive migration adds `investor_acknowledged_at` / `investor_acknowledged_by` (nullable, GRANT + RLS unchanged in behavior).
- Staff keep generating and finalizing K-1s in Operations exactly as today; delivery is read-only.

## 4. Onboarding status for investors

- A **Your status** panel at the top of the investor's fund page, built on the existing journey model (`investor-journey-model.ts`): About You → Verification → Sign → Fund, each step's plain-language state, and the one next action.
- Once funding posts, the panel reads "Funded" and points to the Payments panel.

## Technical notes

- New server functions live in `src/lib/investor-fund-page.functions.ts` (thin wrappers over the existing server helpers); UI in `src/components/investor-fund-panels.tsx`; the fund page route and the Investors tab get the new tabs/buttons.
- All server functions run as the signed-in user through `requireSupabaseAuth`; managers only see threads and actions the fund's own authorization already allows.
- The self-report and acknowledgment are records, not money movement or automated filings.
- No email alerts are sent for any of these (consistent with investor updates today).

## What to try after build

Open a fund as an investor: send a message in the new tab, see your status and any open call, confirm a wire, and download a K-1 if one is final. As the fund team, reply from the Investors tab.
