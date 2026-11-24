# Treat loaded investor documents as signed outside, and only chase who is missing

## What changes for you
- When a Subscription Agreement (or Operating Agreement, side letter, tax form) is loaded for one investor, the platform assumes it was finished outside the platform. You no longer have to tick a separate "signed outside" box.
- The platform reads the file and looks for each signature: the investor's (and any co-signers, trustee or authorized signer) and the fund manager's countersignature. It also picks up the signed date, the signer's name and title, and the amount.
- **All signatures found:** the document is marked completed, using the signed date from the file. The investor's checklist updates.
- **A signature is missing:** the document shows "Waiting on {name}" for just that person, for example "Waiting on Thomas Morgan Jr. (fund countersignature)". The people who already signed are not asked again.
- **Asking the missing person to sign:** a "Add signature box and send" button opens the loaded file. You place a signature box (plus a date and title box if needed) for only the missing person, then send it. They get the usual Harmonious sign link. When they sign, the document turns to completed.
- **When the reading is unsure:** for example on a blurry scan, it shows "Check signatures" so staff or the fund manager can confirm with one click. That confirmation is recorded with who did it.

## Past documents
- A one-time catch-up rereads every document already loaded per investor: about 144 Subscription Agreements, 65 Operating Agreements, 10 side letters and 12 tax forms.
- Fully signed ones become completed. Ones with a missing signature show who it's waiting on.
- No emails go out during the catch-up. Nothing is sent for signing until someone clicks send.
- You get a downloadable summary listing each investor, the document, what was found, and who it's waiting on.

## What stays the same
- Signatures done on the platform are never overwritten. A loaded copy never replaces one.
- Undo and replace keep working, with a reason required. Original files and history are kept.
- Funding, identity checks and money movement are unaffected. Approval still follows the existing rule: the fund manager's countersignature is the approval.
- Accreditation evidence, K-1s and statements are stored as records only. They have no signatures to check.

## Technical details
- Add a signature-review record for each loaded document: the signers it expected and found, the signed date it read, a confidence level, the review state (complete, waiting, or needs check) and who confirmed it. History is append-only.
- `recordPriorDoc` starts an AI read through the existing document reader (`investor-document-ai.server.ts`, AI Gateway). It identifies signature pages and named signers, then compares them with the expected signers: the investor profile's signers or trustee, plus the fund's recorded countersigner.
- `outsideSubscriptionStates` treats a loaded Subscription Agreement whose read is complete, or was confirmed, as signed. The separate manual mark becomes optional, and older marks still count.
- Signing the missing party reuses the existing signature-blocks editor (signer_role is investor or fund_manager) and the `fund-file-signing` sign-link flow on the loaded file. Completion goes through `signature-confirmed.ts`, so a signed date alone never counts.
- The catch-up is a staff-only action that runs in small batches. It writes the summary as a CSV and sends no emails.
- Tests: all signatures found means complete; a missing countersignature shows "waiting on fund manager" only; an unsure read means "needs check"; a document signed on the platform is never changed.
