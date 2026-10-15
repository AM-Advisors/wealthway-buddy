# Signing reminders that take people straight to the document

## What you'll get

A **Send reminder** button wherever a document is waiting for someone's signature. The reminder email is clear and branded. Its single button opens that exact document, ready to finish:

- **Form SS-4:** opens the SS-4. The fund manager adds the Responsible Party SSN or ITIN, checks every line, and signs.
- **Operating Agreement:** opens the agreement for the fund manager to read and sign.
- **Subscription Agreement:** opens it for the person whose turn it is. Investors are reminded first. The fund manager is reminded only after the investor has signed, so nobody gets asked out of order.

Each email lists what's left to do, for example: "1. Add your SSN or ITIN  2. Confirm the details  3. Sign." It names the fund and says who asked.

**If the person has never set a password:** the button uses their personal one-time invite link, which still expires after seven days. They set a password and then land directly on the document instead of the home page.

**If they're already signed in:** the button opens the document directly. If they're signed out, they sign in and are then taken back to the document.

## Where the button appears (staff and fund managers)

- Fund → Formation → SS-4 card: the current "Resend" becomes **Send reminder**, with the new email.
- Fund → Documents: each document waiting for signatures shows its signers. Anyone still waiting gets a **Send reminder** button.
- Each reminder is saved in the fund's Audit History: who sent it, to whom, which document and when. The card shows "Last reminded 2 days ago".
- To prevent spamming, the same person can get only one reminder per document per 24 hours. Super Admins can override this, and the override is logged.

Nothing is signed, filed or sent to the IRS automatically. The reminder only opens the document.

## Other documents that could use the same reminder

Pick any to add next; they use the same email and button:

1. **MSA (client Master Service Agreement):** remind the client's assigned MSA signer.
2. **LLOA:** the fund manager's signature.
3. **Side letters:** investor first, then the fund manager.
4. **W-9 / W-8 tax forms:** the investor confirms their tax details and signs.
5. **Investor questionnaire / About You:** finish missing onboarding answers.
6. **Identity check:** finish the ID scan and live selfie.
7. **NDA:** when one is required to view a data room.
8. **Bank account setup forms** (Texas Capital Bank / Mercury): the signer's part.
9. **Prior-subscription confirmation:** a nudge to the second staff member who still needs to confirm.

Optional later: automatic reminders (for example every 3 days, at most 3 times). These would be off by default and turned on per fund.

## Technical details

- New email template `signing-reminder` (Harmonious branding) with document title, fund, steps list, requester and CTA URL. It's registered in the template registry and sent with the existing `sendTemplateEmail` (approved sender unchanged).
- New shared helper `src/lib/signing-reminder.server.ts`: resolves the signer and their email, decides whether to use a one-time invite link (when the user has never signed in) or a direct link, enforces the 24-hour limit, and writes the fund audit event `signing_reminder_sent`.
- SS-4: `resendSs4RequestFn` switches to the helper (CTA `/manager/ss4/$requestId`). It still only works while the request is `requested`, and keeps the `requireStaffOrManager` check.
- Fund documents: new `remindFileSignerFn` in `fund-file-signing.functions.ts` (CTA `/sign/$signatureId`). The server refuses when that signer has already signed, it isn't their turn yet, or the caller isn't staff or a manager of the fund.
- Sign-in return path: the sign-in and invite pages accept a safe, same-site `next` path and redirect there after the session loads. Only internal paths are allowed.
- Rate limit is read from the latest audit event per (document, signer). Super Admin override needs a reason.
