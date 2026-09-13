# Harmonious-branded Google sign-in

Goal: when a client clicks "Continue with Google", the Google screen says
**Harmonious** with the Harmonious logo, instead of the shared sign-in app used today.

## What I can and cannot do

Google controls that screen. The name and logo come from a Google sign-in app that
must be created inside a Google account you own — I cannot create it, and no code
change can rename the current one. Once you create it, you get two values (an app ID
and a secret) and I switch the portal over to them.

The logo is ready: `google-consent-logo.png` (120x120) is already in the project and
can be uploaded to Google as-is.

## Step 1 - You create the Google sign-in app

In the Google Cloud console, signed in with a harmonious.co account:

1. Create (or pick) a project named Harmonious.
2. Open the consent screen settings and set:
   - App name: Harmonious
   - Support email: a harmonious.co address
   - Logo: upload `google-consent-logo.png`
   - Authorised domains: `harmonious.co`
   - Permissions: email, profile, openid only
3. Create credentials -> OAuth client ID -> Web application, named "Harmonious portal".
   - Authorised origins: `https://harmonious.co`, `https://portal.harmonious.co`,
     `https://onboard.harmonious.co`
   - Authorised redirect URL: the callback address shown in the portal's
     authentication settings under Google (I will send you that exact line).
4. Publish the app so it is not limited to test users.

Google shows you a client ID and a client secret at the end.

## Step 2 - Switch the portal over

You paste the client ID and secret into the portal's authentication settings (Users ->
Authentication settings -> Sign in methods -> Google), which is the only place those
values can be stored. I will walk you through that screen and confirm the callback
address matches what you entered in Google.

## Step 3 - I verify and finish

- Confirm the Google option still appears on staff sign-in, `/client-login` and
  registration, and that the redirect target stays a public page.
- Sign in end to end on the published portal and check the Google screen shows
  Harmonious and our logo.
- If Google shows an "unverified app" notice, tell you what verification needs
  (usually just the published consent screen and domain ownership, which is already
  in place for harmonious.co).

## Notes

- No database or permission changes; existing accounts keep working, the sign-in
  screen branding is all that changes.
- Until Step 1 and 2 are done, sign-in keeps working on the current shared Google app.
