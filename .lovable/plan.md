# LaaSy team invitations

## What I found
Four people were added to the Corps LaaSy team this morning (8:42 to 8:44 AM): Ethan Drum (LaaSy), Jasmine Morgan, Brian Trueblood (Corps Capital) and Josh Arant. None of them has an account yet, and no email was sent to any of them.

That follows the current rule: an invitation goes out automatically only when someone is added as Manager/GP or signer. These four were added as team members with view access (Jasmine: documents, banking, investors; the others: investors), so the platform saved them quietly.

## What I'll do
1. Send each of the four one Harmonious sign-up invitation for Corps LaaSy only. They get exactly the access already recorded for them, nothing more, and no manager or signing rights.
2. Change the rule so anyone added to a fund team from now on gets an invitation automatically, with the same one-fund limits. Managers and signers keep working as they do today.
3. Show "Invited" (with the date) or "Not invited yet" next to each team member, plus a Resend button, so you can see this yourself next time.
4. Confirm the four emails in the email history and report back.

## Technical details
- Reuse the existing fund-team invitation sender and its audit trail. No second sender.
- One invitation per person per fund (dedupe), so repeated page loads never resend, same as the welcome-email fix.
- Permissions come from the recorded fund_team_members row; the invite grants nothing until the person signs in with that verified email.
- Add a test: a view-only member added to a fund gets one invite; a second add or reload does not send another.
- Update the auto-invite memory to cover all fund team members.
