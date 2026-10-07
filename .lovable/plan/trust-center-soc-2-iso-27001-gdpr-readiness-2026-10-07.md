# Trust Center + SOC 2 / ISO 27001 / GDPR readiness

## Important upfront
- The Trust Center is a public security page that Lovable hosts at `/.well-known/trust.html`. It is off right now but can be turned on. It shows evidence about how the app was built. It does **not** certify you.
- No software change can make Harmonious "SOC 2" or "ISO 27001" certified. Only an independent auditor can grant those: a CPA firm for SOC 2, an accredited registrar for ISO 27001. GDPR has no certificate; you meet it through how you run things plus a few app features.
- The app can be built to pass these audits. Until a real audit report exists, we must not claim "SOC 2 compliant" or "ISO certified" anywhere public.

## Step 1 — Turn on the Trust Center
- Turn on the Lovable Trust Center. You approve this in a confirmation card, or use Project Settings → General → Publishing → Trust center.
- Publish, then check that `https://app.harmonious.co/.well-known/trust.html` loads.
- Add a "Security" link in the public site footer that points to it.

## Step 2 — Fix app gaps auditors will test
1. **Open security scan findings.** Clear the errors and warnings, including the one where investors could give themselves extra shares. Re-run the scan until it's clean.
2. **Two-step sign-in for all staff.** It's already required at sign-in. Add a report showing which staff are enrolled.
3. **Quarterly access reviews (SOC 2 CC6, ISO A.5.18).** Leaders get a review screen in People & Access. They confirm or remove each employee's roles, and every sign-off is saved permanently.
4. **Off-boarding.** When someone is archived or revoked, their sign-in sessions and connected inboxes are cut off right away. This change is logged.
5. **Audit log export.** Leadership can download one searchable file of access changes, approvals, money-related actions and data exports for an auditor.
6. **Data retention.** Set a time limit for each type of record. A staff-reviewed purge queue handles expired records; nothing is deleted on its own. Tax and financial records keep their legal holds.

## Step 3 — GDPR features
1. **Privacy requests.** Clients and investors get a "Download my data" and "Request deletion" form. Requests go to an Operations queue with a 30-day due date. Records under a legal hold are kept, and the person is told why.
2. **Cookie and tracking consent.** Show a banner on public pages before email or marketing tracking starts. Unsubscribe and consent choices are saved.
3. **Public policy pages owned by Harmonious:** `/privacy`, `/terms`, `/subprocessors`, `/security-contact`. The wording comes from you or your counsel. I will not write legal or compliance claims for you.

## Step 4 — Leadership "Compliance Readiness" tracker
A checklist page under Leadership → Compliance. It lists every SOC 2, ISO 27001 and GDPR control, its owner, the evidence attached and its status. Evidence is saved permanently. It covers the work the app can't do:
- Written policies: information security, incident response, business continuity, vendor management, acceptable use, data classification
- Yearly risk assessment and an ISO Statement of Applicability
- Security training and background checks for employees
- Vendor reviews and data processing agreements, for example Google, HubSpot, Plaid, Slack, Meta and LinkedIn
- Yearly penetration test
- Choosing an auditor and the audit window (SOC 2 Type I first, then Type II over 3–12 months)

## What you'll need to provide
- Approved policy and privacy wording (a lawyer is recommended)
- Your auditor choice and target dates
- The list of vendors you use and their data processing agreements

## Technical notes
- New append-only tables: `access_review_campaigns/decisions`, `privacy_requests`, `retention_policies`, `compliance_controls_evidence`. Each has grants and row-level security, and is reachable only through server functions gated by `administration.*` permissions.
- The Trust Center routes are left untouched; we only link to them.
- No automatic deletion. Purges and data-subject deletions go through maker-checker.
