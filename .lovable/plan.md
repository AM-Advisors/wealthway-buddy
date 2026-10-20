# Investor details: delivery history, edits, assigned completion, business investors

Applies to the investor details panel (Operations and fund-manager Investors page, shared view).

## Already confirmed (no build needed)
- Calvin Jung: invitation delivered 10:14 Central today and opened at 10:14. Yesterday's reminder was also opened.
- Edward Belsey: invitation delivered 10:14 Central and reminder delivered 10:01. Neither has been opened yet.

## 1. Messages and delivery history in the panel
- A new "Emails sent" section just below the Personal link. It lists every invitation, reminder, progress update and message sent to this investor. Each one shows the subject, who sent it, when it was sent, and whether it was delivered, opened, clicked, bounced or blocked.
- From now on, every invitation and reminder keeps its email provider receipt. Delivery updates then attach automatically to the right email.
- Emails sent before this change (including today's invitations) can be looked up from the email provider. Each lookup is recorded.
- Shows only "delivered/opened" facts the email provider reported. A missing status shows as "No delivery report yet", never as delivered.

## 2. Edit in this section
- "Edit details" on the panel for fund managers of that fund and Harmonious. They can edit name, email, phone, address, commitment, investor type, and entity/business details.
- Same rules as today: allowed only before signing or sending money. Tax ID shows the last four digits only. Bank details still go through Harmonious verification.
- Every change records before/after values, who changed it and when in the History tab.

## 3. Assign completion to another person ("Completed by")
- "Assign someone to complete" lets the manager, Harmonious or the investor name a preparer (for example a family office staff member, an analyst or associate). The preparer gets their own invitation.
- The preparer can fill in About You and upload documents. They cannot pass identity verification for the investor, sign, or approve funding.
- Signing goes to the named signer (for example the GP or principal). They review what the preparer entered and sign for the allocation.
- The panel shows "Prepared by X, signs: Y". The History tab labels each step with who did it (preparer, signer, manager, Harmonious).
- Preparers can be removed at any time. Removing ends access but keeps their history.

## 4. Invite as a business
- In Add investor and Send invite, a choice: Individual or Business/Organization (for example another fund, LLC, trust, corporation or family office entity).
- For a business: legal entity name, entity type, contact person and authorized signer. The invitation is addressed to the entity with the contact as recipient.
- Business investors follow the KYB path: entity documents, beneficial owners and signers, and the entity W-9. Verification covers the entity and its owners, and the login person is never treated as the investing party.

## Not changing
- No money movement, funding/wire screens, approvals or identity results. Preparers and managers cannot clear KYC/AML or sign for the investor.

## Technical details
- Store the Brevo `messageId` on fund_invitations sends and document_reminders. Extend brevo-webhook to match invitation sends. A new server function reads per-onboarding email history (manager-of-fund or staff check server-side), with an on-demand Brevo events lookup by recipient for older sends.
- The edit form reuses the existing manager/Harmonious profile edit and editRelatedParty paths and the edit-window guard.
- Preparer: a new onboarding_participants table (role preparer|signer, invited email, status, revoked_at) with GRANTs and RLS. Step actions check role server-side, and signature routing uses the signer participant. It reuses the existing delegation capability model where it fits.
- Business: the invite gains an investor kind. Profile creation uses the existing entity investment_profile_type and KYB fields. Fund-request and readiness engines stay unchanged.
- Tests cover preparer cannot sign or verify, edits blocked after signing or funding, and history visible only to that fund's managers and staff.
