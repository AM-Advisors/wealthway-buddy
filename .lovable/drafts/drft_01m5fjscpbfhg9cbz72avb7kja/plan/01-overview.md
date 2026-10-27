# Why no confirmation email arrived for cireb58934@hopefunder.com

## Root cause (confirmed)

- The account was created at 18:05:36 UTC by the Team invite and marked as already verified at 18:05:37. It was never waiting for a confirmation.
- At 18:07 and 18:09 the user used Create account. The sign-in service logged both as a "repeated signup" for an existing, verified account. In that case it sends no email, on purpose, so it doesn't reveal which accounts exist.
- The Create account page still said "Check your email", so the user waited for an email that was never going to be sent.
- Forgot password worked because it does send an email to existing accounts. The user reset their password at 18:10 and signed in at 18:12. The inbox and sender are fine.

So email delivery isn't broken. The problem is that invited people get sent to Create account when they already have an account.

## Fix

1. **Create account recognizes invited accounts.** If the invitation check finds that the email already has an account, the page doesn't call sign-up. It says "Your account is ready. Set your password to continue" and sends the set-password email, the same email that worked here.
2. **Invite emails go to the right page.** Team and fund invitations whose account was created ahead of time link to set password, not Create account.
3. **No false success message.** "Check your email" appears only when a new account was actually created.
4. **Tests** for: a new email (normal sign-up), an email with an existing invited account (set-password path), and a non-invited email (refused).
