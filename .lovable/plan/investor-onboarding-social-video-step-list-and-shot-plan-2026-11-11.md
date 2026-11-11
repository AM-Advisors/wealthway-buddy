# Investor onboarding social video: step list and shot plan

## What already exists (reused, not rebuilt)
- **Investor onboarding flow:** sign-in page, then the four-step investment page: About You, Verification, Sign, Fund.
- **Demo capture page:** shows the real investment page screens with made-up data. It was built for the earlier packet and video.
- **Practice sandbox:** made-up fund "Fablewood Ventures I LP", investors Casey Alden, Robin McAllister and Sam Okafor. Its Investor questionnaire area (accreditation) and Investor tax review area (tax form signing) use the real screens.
- **Earlier videos** (the September 16:9 and 9:16 cuts, 96 s, and the narrated guide): the narrated guide is labeled "illustrative screens". So I'll reuse their step order and captions, but **not their footage**.
- **Brand:** Harmonious logo files (navy, teal, white) and colors: navy #142647, teal #5DC6D1, ink #221F20, white. Fonts: Rubik headings, Poppins body.

## Reachability and privacy check (done)
- I opened the sign-in page and all four steps with made-up data and every request to real records blocked. All of them loaded with no page errors.
- **Fixes needed before recording:**
  1. The demo page uses "John Smith" and "Test Dev Management LLC". I'll switch it to Casey Alden and Fablewood Ventures I LP, with an obviously fake amount ($250,000) and bank "First Fictional Bank".
  2. A red "Your documents could not be loaded" line appears because one request is blocked. I'll answer it with made-up data.
  3. The demo header shows plain text. I'll use the real Harmonious logo, as the live investor portal does.
- **Investor dashboard:** not covered yet. I'll show My Funds with the same made-up investor in the sandbox, using made-up answers only.
- The sign-in page's Google button will be cropped out, in keeping with the no-outside-platform-names rule.

## Step list (on-screen order)
1. **Outcome:** "Invest in a fund in minutes, not weeks"
2. **Sign in from your invitation:** Investor sign in, typing a fake email (casey.alden@example.com)
3. **Tell us who's investing:** About You, picking an investing profile and entering the fake details
4. **Choose your amount:** the capital commitment field, $250,000 saved
5. **Verify and confirm accreditation:** the Verification step and accreditation questions in the questionnaire
6. **Review and sign:** Review & Sign with the subscription agreement and other documents, then the signing panel
7. **Fund securely:** released wire instructions, with the account number masked and the fictional bank
8. **Track it all in one place:** investor dashboard / My Funds with the fictional fund
9. **End card:** Harmonious logo, "Start your investment", harmonious.co

## Shot plan
| # | Shot | 9:16 (25 s) | 1:1 (25 s) | 16:9 (75 s) |
|---|---|---|---|---|
| 1 | Navy title card with logo and outcome line over a soft-blurred Fund step screen | 0-2 s | 0-2 s | 0-4 s |
| 2 | Sign-in, typing the email, slow push-in on the form | 2-5 | 2-5 | 4-12 |
| 3 | About You: profile type, fake name filled in, slow pan down | 5-8 | 5-8 | 12-22 |
| 4 | Amount entered and saved, progress bar moves to 25% | 8-10 | 8-10 | 22-28 |
| 5 | Verification card, then accreditation questions answered | 10-13 | 10-13 | 28-40 |
| 6 | Review & Sign list, zoom onto Subscription Agreement, signing panel | 13-17 | 13-17 | 40-54 |
| 7 | Fund step: wire instructions (masked), "Funded" check | 17-20 | 17-20 | 54-62 |
| 8 | Dashboard / My Funds | 20-22 | 20-22 | 62-69 |
| 9 | End card: logo, "Start your investment", harmonious.co | 22-25 | 22-25 | 69-75 |

- **Motion:** slow pans, zooms and gentle fades only, with no other transitions.
- **Framing:** 9:16 and 1:1 use the phone-width screens (440 px). 16:9 uses desktop screens.
- **Captions:** burned in, Poppins bold, white text on a navy band, short and readable with the sound off. No voiceover. Optional quiet music can be added later.
- **Brand on every shot:** small logo in a corner, teal step counter ("Step 2 of 6").

## Checks after export
- Each file plays, has the right shape (1080x1920, 1080x1080, 1920x1080) and length (20-30 s, 20-30 s, 60-90 s).
- I'll pull frames every second and read every caption.
- I'll scan every frame's text to confirm only the fictional names, amounts and masked account numbers appear.
- Files: `Harmonious_Invest_In_Minutes_9x16.mp4`, `_1x1.mp4`, `_16x9.mp4`. New names, so the earlier videos are untouched.

## Technical details
- Update the temporary demo capture page to use the sandbox's fictional data and answer its blocked document request, or move it into the practice sandbox as an "Investor journey" area and delete the temporary page.
- Record with Playwright video at 2x scale, with every real-backend request blocked and logged (target: 0 reached).
- Edit with ffmpeg (crop, smooth pan/zoom, drawtext captions, logo overlay, end card).
