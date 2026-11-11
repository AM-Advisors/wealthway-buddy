/**
 * Client-facing foundation onboarding (pure, browser-safe).
 *
 * Client members propose; Harmonious reviews. A submission is stored apart from the reviewed record, never changes it
 * by itself, and is never decided by the person who submitted it. Recorded foundation roles grant no platform access:
 * access comes only from the person's own active client membership.
 */
import { z } from "zod";
import { CLASSIFICATIONS, EXEMPTION_STATUSES, LEGAL_STRUCTURES, AUTHORITY_ROLES } from "@/lib/foundation-admin-model";
import type { VDoc, VAuthority } from "@/lib/foundation-verification-model";
import { usableDoc } from "@/lib/foundation-verification-model";

export const CLIENT_FACT_FIELDS = {
  legal_structure: "Legal structure",
  legal_structure_other: "Structure description",
  classification: "Charitable classification",
  exemption_status: "Tax exemption",
  exemption_effective_on: "Exemption effective date",
  determination_letter_on: "Determination letter date",
  fiscal_year_end_month: "Fiscal year end month",
  mission: "Mission",
} as const;
export type ClientFactField = keyof typeof CLIENT_FACT_FIELDS;
const FIELDS = Object.keys(CLIENT_FACT_FIELDS) as ClientFactField[];

const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const clientFactsSchema = z.object({
  legal_structure: z.enum(keys(LEGAL_STRUCTURES)).optional(),
  legal_structure_other: z.string().trim().max(200).nullable().optional(),
  classification: z.enum(keys(CLASSIFICATIONS)).optional(),
  exemption_status: z.enum(keys(EXEMPTION_STATUSES)).optional(),
  exemption_effective_on: day.nullable().optional(),
  determination_letter_on: day.nullable().optional(),
  fiscal_year_end_month: z.number().int().min(1).max(12).nullable().optional(),
  mission: z.string().trim().max(4000).nullable().optional(),
}).strict();
export type ClientFacts = z.infer<typeof clientFactsSchema>;

export const personRequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing"), personId: z.string().uuid(), role: z.enum(keys(AUTHORITY_ROLES)), title: z.string().trim().max(200).nullable() }),
  z.object({ mode: z.literal("new"), firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), email: z.string().trim().email().max(255).nullable(), role: z.enum(keys(AUTHORITY_ROLES)), title: z.string().trim().max(200).nullable() }),
]);
export type PersonRequest = z.infer<typeof personRequestSchema>;

const norm = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v));

export type FactChange = { field: ClientFactField; from: string | null; to: string | null };

/** Only fields the client actually changed. */
export function proposedChanges(current: Record<string, unknown>, proposed: ClientFacts): FactChange[] {
  return FIELDS.filter((f) => f in proposed && norm((proposed as any)[f]) !== norm(current[f]))
    .map((f) => ({ field: f, from: norm(current[f]), to: norm((proposed as any)[f]) }));
}

/** Fields that changed in the reviewed record after the client submitted. The reviewer must confirm before replacing them. */
export function changedSinceSubmission(base: Record<string, unknown>, current: Record<string, unknown>, changes: readonly FactChange[]): ClientFactField[] {
  return changes.filter((c) => norm(base[c.field]) !== norm(current[c.field])).map((c) => c.field);
}

export function factsProblem(merged: Record<string, unknown>): string | null {
  if (merged["exemption_status"] === "determined" && !merged["determination_letter_on"]) return "Enter the determination letter date, or choose a different exemption status.";
  if (merged["legal_structure"] === "other" && !norm(merged["legal_structure_other"])) return "Describe the legal structure.";
  return null;
}

export type Membership = { client_role: string | null; revoked_at: string | null } | null;

/**
 * Read: any active member of this exact client. Write (propose, upload, request people): active members who aren't
 * read-only. A recorded director, trustee or signer role is never consulted.
 */
export function clientFoundationAccess(m: Membership, switchesOn: boolean): { read: boolean; write: boolean; problem: string | null } {
  if (!switchesOn) return { read: false, write: false, problem: "Foundation onboarding isn't available yet." };
  if (!m || m.revoked_at) return { read: false, write: false, problem: "Foundation not found." };
  const write = m.client_role !== "client_readonly";
  return { read: true, write, problem: null };
}

export function reviewProblem(input: { reviewerId: string; submitterId: string; decision: "accepted" | "correction_requested"; note: string | null; status: string }): string | null {
  if (input.status !== "submitted") return "This submission was already decided.";
  if (input.reviewerId === input.submitterId) return "Submitted information never approves itself. Someone else must review it.";
  if (input.decision === "correction_requested" && (input.note ?? "").trim().length < 3) return "Say what needs to be corrected.";
  return null;
}

export type ChecklistStatus = "done" | "in_review" | "needed" | "correction";
export type ChecklistItem = { key: string; label: string; status: ChecklistStatus; note: string | null };

export function onboardingChecklist(input: {
  profile: Record<string, any>; entity: { tax_id_status: string | null } | null; documents: readonly (VDoc & { reviewNote?: string | null })[];
  authority: readonly VAuthority[]; submissions: readonly { kind: string; status: string; review_note: string | null }[];
}): ChecklistItem[] {
  const current = input.documents.filter((d) => !d.superseded_by);
  const doc = (kind: string, label: string, required: boolean): ChecklistItem => {
    const mine = current.filter((d) => d.kind === kind);
    if (mine.some(usableDoc)) return { key: kind, label, status: "done", note: null };
    const fix = mine.find((d) => d.review === "correction_requested");
    if (fix) return { key: kind, label, status: "correction", note: fix.reviewNote ?? "Harmonious asked for a corrected copy." };
    if (mine.length) return { key: kind, label, status: "in_review", note: null };
    return { key: kind, label, status: "needed", note: required ? null : "If you have one" };
  };
  const factsOpen = input.submissions.find((s) => s.kind === "profile_facts" && s.status === "submitted");
  const factsFix = input.submissions.find((s) => s.kind === "profile_facts" && s.status === "correction_requested");
  const p = input.profile;
  const factsKnown = p["classification"] !== "unknown" && p["exemption_status"] !== "unknown" && !!p["fiscal_year_end_month"] && !!norm(p["mission"]);
  const active = input.authority.filter((a) => a.status === "active");
  const peopleOpen = input.submissions.some((s) => s.kind.startsWith("person_") && s.status === "submitted");
  const signer = active.some((a) => a.authority_scopes.includes("sign_agreements"));
  const board = active.some((a) => a.role === "director" || a.role === "trustee");
  const items: ChecklistItem[] = [
    { key: "facts", label: "Foundation details", status: factsKnown ? "done" : factsOpen ? "in_review" : factsFix ? "correction" : "needed", note: factsFix && !factsKnown ? factsFix.review_note : null },
    doc("governing_document", "Governing documents", true),
    doc("determination_letter", "IRS determination letter", p["exemption_status"] === "determined"),
    { key: "ein", label: "EIN on file", status: input.entity?.tax_id_status === "issued" ? "done" : "needed", note: input.entity?.tax_id_status === "issued" ? null : "Upload the IRS EIN letter under supporting documents. Harmonious records the number securely." },
    { key: "board", label: "Directors or trustees", status: board ? "done" : peopleOpen ? "in_review" : "needed", note: null },
    { key: "signer", label: "Who signs for the foundation", status: signer ? "done" : peopleOpen ? "in_review" : "needed", note: signer ? null : "Name the person and upload the document that gives them signing authority." },
  ];
  return items;
}
