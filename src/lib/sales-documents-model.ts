/** Pure model for Sales proposals, RFPs and RFQs (client + server). */
export type DocKind = "proposal" | "rfp" | "rfq";
export type DocDirection = "response" | "outbound";
export type Section = { key: string; title: string; body: string; question?: string | null };

export const KIND_LABEL: Record<DocKind, string> = { proposal: "Proposal", rfp: "RFP", rfq: "RFQ" };
export const DIRECTION_LABEL: Record<DocDirection, string> = { response: "Response to prospect", outbound: "Request to vendor" };

export const RESPONSE_STATUSES = ["draft", "with_marketing", "submitted", "approved", "sent", "won", "lost", "declined"] as const;
export const OUTBOUND_STATUSES = ["draft", "with_marketing", "submitted", "approved", "sent", "responses_received", "awarded"] as const;
export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", with_marketing: "With Marketing", submitted: "Waiting for approval", approved: "Approved", sent: "Sent",
  won: "Won", lost: "Lost", declined: "Declined", responses_received: "Responses received", awarded: "Awarded",
};
/** Outcomes a rep may record after sending. */
export const OUTCOMES: Record<DocDirection, string[]> = { response: ["won", "lost", "declined"], outbound: ["responses_received", "awarded"] };

export const SALES_DOC_ROLES = ["sales", "account_executive", "bdr", "sales_management", "cro", "executive", "super_admin", "leadership"];
export const SALES_DOC_APPROVERS = ["sales_management", "cro"];
export const MARKETING_HELPERS = ["marketing_manager", "marketing_specialist"];

export function defaultSections(kind: DocKind, direction: DocDirection): Section[] {
  const s = (key: string, title: string): Section => ({ key, title, body: "" });
  if (direction === "outbound") return [s("overview", "Overview"), s("scope", "Scope of work"), s("requirements", "Requirements"), s("timeline", "Timeline"), s("submission", "How to respond"), s("evaluation", "Evaluation criteria")];
  if (kind === "rfq") return [s("summary", "Summary"), s("pricing", "Pricing"), s("terms", "Terms"), s("about", "About Harmonious")];
  return [s("summary", "Executive summary"), s("needs", "Your needs"), s("approach", "Our approach"), s("services", "Services and pricing"), s("timeline", "Timeline"), s("about", "About Harmonious"), s("next", "Next steps")];
}

export const sectionsText = (sections: Section[]) =>
  sections.map((s) => `${s.title}\n${s.question ? `Question: ${s.question}\n` : ""}${s.body}`.trim()).join("\n\n");
