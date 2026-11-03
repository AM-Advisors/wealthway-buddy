/** Shown whenever a list may be missing work because a source failed or hit its read limit. */
export function PartialResultsNotice({ partial, failedAreas = [] }: { partial?: boolean; failedAreas?: string[] }) {
  if (!partial) return null;
  return (
    <p role="status" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
      Some work may not be shown{failedAreas.length ? ` (couldn't load: ${failedAreas.join(", ")})` : ""}. This list is not complete, so don't treat it as all clear. Try again shortly.
    </p>
  );
}
