/**
 * Fictional fund manager setup submissions for /qa-sandbox, answering the live fund review list (which now
 * uses the shared administration presentation). Handlers mirror the real review rules in
 * fund-manager-submissions.server.ts (staff only, never the submitter, one decision, note to send back)
 * and never reach the backend. Names and values are invented.
 */
export const QA_FUND_SUBMISSION_FNS = ["listFundSubmissionsFn", "reviewFundSubmissionFn", "submissionFileFn"] as const;

export const QA_SUBMISSION_FUND = "f1000000-0000-4000-8000-000000000001";
/** The sandbox staff reviewer, and a fictional fund manager who sent most items. */
export const QA_REVIEWER = "f1000000-0000-4000-8000-0000000000b1";
const MANAGER = "f1000000-0000-4000-8000-0000000000b2";

export type QaFundSubmissions = { items: any[] };

export function createQaFundSubmissions(): QaFundSubmissions {
  const at = (d: string) => `2026-11-${d}T15:00:00Z`;
  const base = { offering_id: QA_SUBMISSION_FUND, file_path: null, file_name: null, reviewed_by: null, reviewed_at: null, review_note: null };
  return {
    items: [
      { ...base, id: "f1000000-0000-4000-8000-0000000000d4", section: "document", doc_kind: "operating_agreement", payload: { note: "Signed copy" }, status: "submitted", submitted_by: QA_REVIEWER, submitted_at: at("10") },
      { ...base, id: "f1000000-0000-4000-8000-0000000000d3", section: "bank", doc_kind: null, payload: { bankName: "Fictional Bank of Ridgeview" }, status: "submitted", submitted_by: MANAGER, submitted_at: at("09") },
      { ...base, id: "f1000000-0000-4000-8000-0000000000d2", section: "fees_team", doc_kind: null, payload: { managementFeePercent: "2", carryPercent: "20" }, status: "submitted", submitted_by: MANAGER, submitted_at: at("08") },
      { ...base, id: "f1000000-0000-4000-8000-0000000000d1", section: "fund_details", doc_kind: null, payload: { displayName: "Ridgeview Sample Fund I" }, status: "approved", submitted_by: MANAGER, submitted_at: at("05"), reviewed_by: MANAGER, reviewed_at: at("05"), review_note: "Self-serve: saved directly by the fund manager" },
      { ...base, id: "f1000000-0000-4000-8000-0000000000d0", section: "fund_details", doc_kind: null, payload: { displayName: "Ridgeview Fund" }, status: "withdrawn", submitted_by: MANAGER, submitted_at: at("04") },
    ],
  };
}

export function handleQaFundSubmissionCall(fnName: string, data: any, s: QaFundSubmissions): unknown {
  switch (fnName) {
    case "listFundSubmissionsFn":
      if (data?.offeringId !== QA_SUBMISSION_FUND) throw new Error("Forbidden: you do not manage that fund.");
      return { isStaff: true, viewerId: QA_REVIEWER, directSetupEdits: false, items: s.items.map((i) => ({ ...i })), onFile: { fund_details: { displayName: "Ridgeview Sample Fund I" }, fees_team: {}, bank: {}, bankOnFile: false, documents: [] } };
    case "reviewFundSubmissionFn": {
      const i = s.items.find((x) => x.id === data?.id);
      if (!i) throw new Error("Submission not found.");
      if (i.submitted_by === QA_REVIEWER) throw new Error("Forbidden: someone other than the submitter must review it.");
      if (i.status !== "submitted") throw new Error("This submission was already handled.");
      if (data.decision === "return" && !String(data.note ?? "").trim()) throw new Error("Tell the fund manager what to fix.");
      Object.assign(i, { status: data.decision === "approve" ? "approved" : "returned", reviewed_by: QA_REVIEWER, reviewed_at: new Date().toISOString(), review_note: String(data.note ?? "").trim() || null });
      return { ok: true };
    }
    case "submissionFileFn":
      throw new Error("No file.");
    default:
      throw new Error("Blocked in the fictional QA sandbox: this action is not modeled here.");
  }
}
