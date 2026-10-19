# Isolated test access for signed-in walkthroughs

## Why this is needed
Your preview and your live site use the same database today. Signing in there to test would change real funds and investors and could send real emails. That is why every signed-in walkthrough has been blocked.

## What I'll set up
1. **A separate test copy of the app (a draft).** It has its own database and sign-in accounts, completely apart from real data. Nothing done there touches Erebor, Calvin, Dustin or any real person, and accepting or discarding it later is your choice.
2. **Three made-up test accounts** with clearly fake names on a non-real email domain (for example `qa-staff@qa.harmonious.test`):
   - **QA Staff:** Harmonious Operations and admin access, for Setup, Launch, Compliance schedules and Audit log → Record history.
   - **QA Manager:** fund manager of the test fund only.
   - **QA Investor:** an account with one individual investment profile.
3. **A made-up test fund ("QA Test SPV")** part-way through setup, so you can finish the remaining steps, launch it and invite the QA Investor.
4. **Email and texts stay safe.** Test addresses can't receive mail, and the copy blocks any send to a real address. Identity checks, banking verification and payments stay in sandbox/off mode.
5. **Sign-in details** for the three accounts go to you privately in chat. Each account gets its own temporary password and authenticator setup on first sign-in.

## What you'll walk through
- **Fund setup:** QA Manager completes setup, then QA Staff opens Operations → Funds → QA Test SPV → Setup and launches it.
- **Investor steps:** QA Manager creates a personal link for QA Investor, who reviews the deal and goes through About You → Verification → Sign → Fund. Funding stops at instructions; no money moves.
- **Record history:** after the edits above, QA Staff opens Audit log → Record history and checks who changed what.

I'll also run the automated browser tests against this copy and report what passed.

## Not changed
Real accounts, funds and permissions stay as they are. Test accounts exist only in the copy.

## Technical notes
- Create draft via drafts--create (isolated backend stack); apply migrations there; seed synthetic users with `lovable auth-session`/admin create on the draft only; seed fund/onboarding rows by SQL on the draft.
- Point e2e helpers at the draft URL (they already refuse production URLs) and save session files for `bun run test:e2e`.
- Email sender guard: refuse non-`.test` recipients when running in the draft environment.
