/** Shared, direction-explicit labels for investor Drive surfaces. Pure; UI copy only. */
export const DRIVE_LABELS = {
  intake: {
    title: "Google Drive Intake",
    direction: "Restricted Investor Records → Harmonious",
    copy: "Connect an approved investor folder, review available documents, and selectively import eligible records into Harmonious.",
    emptyTitle: "No investment available to connect yet",
    emptyCopy:
      "This investor does not currently have an investment profile linked to an investment that can be connected to Restricted Investor Records. Complete the required investment relationship first.",
  },
  imported: {
    title: "Imported Drive Documents",
    direction: "Import history",
    copy: "Documents previously imported from Google Drive into Harmonious.",
  },
  filing: {
    title: "Drive Filing",
    direction: "Harmonious → Restricted Investor Records",
    copy: "Files approved Harmonious documents into the configured Restricted Investor Records repository.",
  },
} as const;

/** Drive intake actions (connect / check / import) require a ready repository and at least one eligible investment. */
export function intakeActionsEnabled(input: { repositoryReady: boolean; rowCount: number }): boolean {
  return input.repositoryReady && input.rowCount > 0;
}

/** Add Fund heading - client is fixed by the workspace, never chosen in the dialog. */
export function addFundTitle(clientName: string | null | undefined): string {
  const n = (clientName ?? "").trim();
  return n ? `Add Fund for ${n}` : "Add Fund";
}
