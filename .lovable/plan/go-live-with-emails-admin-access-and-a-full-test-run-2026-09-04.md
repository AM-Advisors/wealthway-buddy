# Go live with emails, admin access, and a full test run

Your sending domain `notify.onboarding.harmonious.co` is verified and ready, so nothing more is needed from you on DNS.

## 1. Make you an admin

Grant the admin role to your account (`alyssa@harmonious.co`, already confirmed) so `/admin` opens for you.

## 2. Send you a real test onboarding email

Send the branded investor email through your domain to `alyssa@harmonious.co`, then check the delivery record to confirm it went out (and report the exact result — delivered, bounced, or blocked).

## 3. Create a real test application end to end

Create a separate test investor account and walk it through the live flow in the browser:

- Profile details
- Identity check (KYC) and background screening (AML) — recorded as submitted; the outside verification provider isn't connected yet, so these land in "pending review" for an admin to decide
- Accreditation, using the self-certification path for the 506(b) fund
- Fund documents: read and sign, producing signed PDFs with audit trail
- Funding choice: wire, so the application reaches the review queue with wire instructions issued

## 4. Walk it through /admin

Open the application in the admin console, approve each area (identity, screening, accreditation, documents), and send the investor a status email from the composer — confirming the whole review path works with real delivery.

## What you get at the end

A short report: whether your test email arrived, a link to the test application in `/admin`, and any step that needs a real provider before launch.

## Notes

- KYC/AML use an outside provider (Persona) that isn't connected yet; until keys are added those steps are captured and reviewed manually rather than auto-verified.
- ACH bank debits need payments enabled; the wire path is fully functional today, so the test run uses wire.
- If you'd rather the test email go to a different address, say so and I'll use that instead.
