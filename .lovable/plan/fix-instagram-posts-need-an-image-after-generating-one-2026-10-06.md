# Fix "Instagram posts need an image" after generating one

## Why it happens
A generated, uploaded or Drive-picked image appears on the page straight away, but it only sits in the editor until you click **Save**. **Submit for approval** checks the saved copy of the post, and that copy has no image yet, so it says Instagram needs one. The same goes for submitting or approving the post from the Marketing Calendar.

## The fix
1. **Submit saves first.** Clicking **Submit for approval** saves the current text, channels, images and publish time, then submits. What you see is what gets checked.
2. **Images save right away on existing posts.** Adding or removing an image saves the image list to the post at once. Leaving the page or submitting from the Calendar can't lose it.
3. **Unsaved-changes notice.** A small "Unsaved changes" label appears next to Save while there are edits that aren't saved yet.
4. **Clearer error.** If the saved post still has no image, the message reads: "Instagram posts need an image. Add one and save the post."

Approval rules don't change. Saving a submitted or approved post still sends it back to draft for re-approval, as it does today.

## Technical details
- `src/routes/_authenticated/marketing_.posts_.$id.tsx`:
  - The submit mutation awaits `saveMarketingPost` with the current state, then calls `decideMarketingPost('submit')`.
  - An `onImagesChange` helper saves the image paths when `!isNew` and the post is a draft or rejected.
  - Dirty state is worked out by comparing the editor to the loaded post.
- Update the message in `src/lib/marketing-model.ts` `postProblems`. The server check in `decidePost` stays the authority.
