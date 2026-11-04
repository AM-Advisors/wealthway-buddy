# Hidden background session recording

## Goal
Recording runs quietly in the background for every signed-in user, with no floating button or "Recording" badge on screen, so the team can trace bugs and show regulators what happened.

## What changes
1. **Remove the floating "Record screen" button** (bottom-left) and its "Recording" indicator from every page.
2. **Keep the automatic replay running** for everyone signed in, investors, managers and staff, on every page. Typed values and marked private areas stay masked, as now.
3. **Make replay more reliable as evidence**
   - Save on page close and tab switch (already in place) and also when the user signs out, so the end of a session isn't lost.
   - Link each replay to the existing login and session records, so one session shows the replay, sign-in times and IP evidence together.
4. **Manual screen capture stays available, but moves out of sight**: a "Record my screen" item in the account menu, for when someone wants to send Harmonious a video of a problem. The browser asks for permission each time, so this can't run hidden.
5. **Disclosure stays in place.** Replay is now invisible, so the Privacy Policy and Terms that users accept will say that sessions are recorded for security, support and regulatory records, with typed values hidden. Being clear about this keeps the recordings usable as proof and lawful to keep.
6. **Viewing stays leadership-only** and every viewing is logged, as now.

## Not changing
- Who can view recordings, how long they are kept, and masking of typed values, ID numbers and bank details.
- Nothing is recorded before sign-in.

## Technical details
- `src/components/session-recorder.tsx`: drop the floating button UI. Export the `getDisplayMedia` capture flow as a hook used by an account-menu item. Add a flush on the `SIGNED_OUT` auth event.
- Pass the current session-evidence id into `startRecordingFn` (new nullable column on `session_recordings`, one migration) so replays join the session evidence records.
- Add one sentence about session recording to the privacy and terms copy users already accept. No new acceptance prompt.
- Update the screen-recording memory: masked replay is hidden, and manual capture lives in the account menu.
