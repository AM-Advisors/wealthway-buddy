export type FundChange = { id: string; title: string; status: string; at: string; tab: "approvals" | "requests"; kind: string };

/** Status-only projection: never copy payloads, notes or investor terms. */
export function pendingFundChanges(input: { fees: any[]; letters: any[]; edits: any[]; requests: any[] }): FundChange[] {
  return [
    ...input.fees.filter(r => r.status === "pending_approval").map(r => ({ id: `fee:${r.id}`, title: "Management fee & carried interest", status: "Waiting for Harmonious approval", at: r.created_at, tab: "approvals" as const, kind: "fees" })),
    ...input.letters.filter(r => r.status === "pending").map(r => ({ id: `letter:${r.id}`, title: "Side letter change", status: "Waiting for review", at: r.created_at, tab: "approvals" as const, kind: "side_letter" })),
    ...input.edits.filter(r => r.status === "pending").map(r => ({ id: `edit:${r.id}`, title: "Saved fund information change", status: "Waiting for Harmonious approval", at: r.created_at, tab: "approvals" as const, kind: "locked_edit" })),
    ...input.requests.filter(r => !["DRAFT", "COMPLETED", "CANCELLED"].includes(r.status)).map(r => ({ id: `request:${r.id}`, title: "Fund service request", status: String(r.status).replace(/_/g, " "), at: r.created_at, tab: "requests" as const, kind: "request" })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}

export function fundEditKeys(fundId: string) {
  return ["fund_fields", "legal_name", "economics", "ein", "administration"].map(k => `${k}:${fundId}`);
}