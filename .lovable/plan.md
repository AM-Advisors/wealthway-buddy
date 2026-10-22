# Investor verification: biggest blocks and how to simplify them

## What the records show today
- 230 of 250 investor onboardings are still at the very first step (profile chosen, About You not finished). There are 220 different people across 14 funds, mostly Eradivir (90), 4D Senseye (42), 4D Phantom Space 2 (27) and Founders Fund (20). All started between Oct 2 and Oct 22; 15 have had no activity for 14+ days.
- Only 2 are at Verification, and 3 anti-money-laundering screenings sit in "review" waiting for a person.
- So most investors stall **before** verification, not inside it. Why they stall has not been confirmed yet; step 1 finds out.

## Step 1 — Find out exactly where people stop (read-only)
A "Where investors are stuck" report in Operations, for each fund:
- the last field or screen each investor reached, how long ago, whether they ever signed in, and whether the invitation email was delivered or opened
- which required About You answers are missing
- whether a matching earlier verification already exists for that person, so they could reuse it

## Step 2 — Fixes to apply once step 1 confirms the cause
1. **Ask fewer questions:** prefill About You from details already on record (invitation, earlier funds, earlier verification). Only show what's still missing, and keep the investor's own edits.
2. **Reuse verification:** if the same person already has an approved identity check and a clear AML result, offer to reuse it with one click instead of verifying again. Same tax ID, name and passed checks are required, as today.
3. **Automatic reminders:** reminder emails at 2, 5 and 10 days that open the exact step the investor stopped on. Managers already choose how often per fund; this applies their setting to investors who haven't started.
4. **AML review queue:** screenings in "review" go to the Operations queue with an age timer and a Slack notice after 2 business days. A person still decides; nothing is approved automatically.
5. **Clear status:** the investor sees one plain line, such as "We're reviewing your identity, usually within 1 business day."

## Not changing
- The order stays About You, then Verification, then Sign, then Fund.
- A failed or review AML result still blocks the investor, and identity approved with AML pending still allows Sign only.
- 506(c) accreditation proof is still required, and investors can't verify their own accreditation.
- People still decide on reviews, with the same second-person approval rules.

## Technical details
- The report reuses the existing onboarding, verification and email-delivery records with authorized server reads. It adds no new tracking of investors.
- Reuse goes through the existing tax-ID auto-connect logic. Reminders go through the existing investor progress emails and their drain. Queue ageing goes through the existing work queue and Operations Slack notices.
- Each rule gets tests with made-up data. Nothing is tested on live investors without separate approval.
