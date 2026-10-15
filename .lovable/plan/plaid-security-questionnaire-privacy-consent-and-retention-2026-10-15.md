# Plaid security questionnaire: privacy, consent and retention

## Suggested answers
- **Privacy policy:** Yes. Link: https://www.harmonious.co/privacy
- **Consumer consent:** Yes, once the consent step below is live.
- **Deletion and retention policy, reviewed periodically:** Yes. This uses the approved retention schedule (RS-001 to RS-006), which has a yearly review and no automatic deletion.

## Changes
1. **Privacy Policy (/privacy):** add a "Bank connections (Plaid)" section. It covers what is collected (account and routing details, balances, transactions), why it's collected, that Harmonious does not sell it, how users disconnect, how to request deletion, and a link to Plaid's End User Privacy Policy. Also add a "Your privacy rights" section with a contact email and a response timeline.
2. **Consent before Plaid Link:** before the bank-connect window opens, clients see a short consent box with a checkbox and links to the Privacy Policy and Plaid's policy. Each acceptance is saved with the user, time and policy version.
3. **Data Security / trust page (/data-security):** add a Harmonious-branded "Bank connections and Plaid" section. It covers MFA before linking, server-side storage of access keys, consent, retention and deletion, and links to the Privacy Policy and Information Security Policy summary. The page keeps Harmonious fonts and colors. The platform Trust Center can't be rebranded, so this page stays the branded one.
4. **Information Security Policy document:** add consent, privacy-rights and retention-review clauses to the Plaid section, then re-issue the document.
5. **Retention:** list bank-connection data as part of the existing schedule. It is kept while connected and removed on request or when the user disconnects, subject to legal holds. Deletion stays manual and logged.

## Needs your confirmation
- Which email handles privacy requests (for example privacy@harmonious.co)?
- How fast you answer requests (30 days suggested).

## Technical details
- Consent is stored in a new append-only table (user_id, policy_version, accepted_at). The server checks it before creating a Plaid link token.
- head() metadata on /privacy and /data-security is updated.
