## Service level per new deal, and full fund manager self-service

### What changes for the fund manager
1. **Choose a service level in Add Fund or SPV.** A new "Service level" choice uses the existing levels: Self Serve (included), Core (72-hour response), Plus (48-hour, named contact), White Glove (24-hour, proactive) and Institutional (custom quote).
   - The choice always starts on **Self Serve**.
   - A paid level shows its yearly price and is added to the amount paid at checkout, using the rate card or the client's approved custom price.
   - A paid level becomes active only after payment is confirmed. Until then the fund stays Self Serve. Institutional sends a quote request and stays Self Serve until it is agreed.
2. **Change it later** from the fund's Overview: upgrading means paying first, and downgrading takes effect at the end of the current paid period.
3. **Self Serve means no waiting on Harmonious.** On Self Serve funds, the fund manager can do every step themselves, and nothing waits in a Harmonious queue:
   - Finish Fund Setup and approve their own setup items and uploaded documents (launch already works this way).
   - Mark entity formed, registered agent and the date formed using their own evidence.
   - Record the IRS-issued EIN by uploading the IRS letter (today only Harmonious can do this).
   - Enter wire instructions and mark banking complete, with their own confirmation.
   - Add deals, generate and sign fund documents, invite and edit investors, close and reopen the fund.
   - Review investor KYC/KYB "needs review" results and decide them for their own investors. The decision, reason and evidence are recorded permanently.
   - Approve their own investors' subscriptions to fund, and confirm money received against their bank statement.
4. **On paid levels**, Harmonious works the same steps for them, but the manager can still do any step themselves.

### Limits that stay in place
These come from rules you set earlier, so I'll keep them unless you say otherwise:
- The platform never files anything for them (except IRS e-filing of approved 1065s/K-1s) and never pays taxes, issues refunds or sends ACH/wires. The manager does these outside the platform and records them.
- Identity and AML checks still run through Didit. A manager can decide a "needs review" result, but can't mark an unchecked or declined investor as clear.
- Everything is limited to funds the person manages, every action is checked on the server and recorded, and history is never rewritten.
- Pricing exceptions (like the $2,500 waiver) are still set only by CEO/CRO/Super Admin.

### Technical details
- New per-fund service-level history record (level, effective date, payment, who chose it), plus a current-level column on the fund that defaults to Self Serve. A change takes effect only after payment is confirmed.
- Quotes use the existing quote/payment builder, with a service-level line priced from the published rate card (core / fund_administration / white_glove keys) or an approved client price.
- One shared rule, "who may do this step", that allows the fund's own managers for every setup/readiness step on Self Serve funds. The EIN, bank-complete, KYC review decision, approve-to-fund and funds-received paths call it in place of their staff-only checks. Existing self-approval logging and maker-checker stay for Harmonious staff.
- Tests for: Self Serve is the default; a paid level only after payment; a manager can't act on another fund; a manager can't clear a declined or unchecked identity check; no money movement or filing anywhere.
- Help Center articles updated for each step managers can now do themselves.
