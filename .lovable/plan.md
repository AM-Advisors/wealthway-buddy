# Send a test onboarding email and confirm delivery

Send a branded test email to alyssa@harmonious.co using the admin email composer's "Send test" button, then verify it was accepted and sent through the verified sender domain.

## Steps

1. Open the admin console on Alyssa's application, expand the email composer, and click "Send test" (recipient pre-filled with alyssa@harmonious.co, subject gets the "[TEST]" prefix).
2. Confirm the toast says the test was sent and no error is shown.
3. Check the email delivery log for a `sent` event to alyssa@harmonious.co from the notify.onboarding.harmonious.co sender domain.
4. Report the result: accepted/sent, and note that final inbox placement depends on the receiving mailbox (spam folder check if not visible in a minute or two).

## Notes

- If sending fails with a domain error, the DNS verification for notify.onboarding.harmonious.co needs re-checking before the test.
- A `suppressed` result (e.g. a past unsubscribe on this address) is a real outcome, not a bug — it would be reported as-is.
