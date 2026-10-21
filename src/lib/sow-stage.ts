// Display-only SOW progress for client lists: draft → proposed → executed.
export type SowStage = "draft" | "proposed" | "executed";

export function sowStage(s: { status?: string | null; executed_at?: string | null; client_status?: string | null; approval_status?: string | null }): SowStage {
  if (s.executed_at || (s.client_status === "signed" && s.approval_status === "approved")) return "executed";
  if (s.status === "draft" && s.client_status !== "signed") return "draft";
  return "proposed";
}

export const SOW_STAGE_LABEL: Record<SowStage, string> = { draft: "Draft", proposed: "Proposed", executed: "Executed" };
