import { CERTIFICATIONS, requiredCertifications, type CertificationKey } from "@/lib/onboarding-compliance-model";

/** Investor situations that change which certification statements apply. */
export const PREVIEW_INVESTOR_TYPES = [
  { key: "individual", label: "Individual", isEntityOrDelegated: false },
  { key: "entity", label: "Business, trust or fund", isEntityOrDelegated: true },
  { key: "delegated", label: "Someone signing for another investor", isEntityOrDelegated: true },
] as const;

type Row = { id: string; requirement_key: string; title: string; wording: string; version: number; status: string; effective_date: string };
export type PreviewStatement = {
  key: CertificationKey;
  heading: string;
  source: "approved" | "draft" | "missing";
  title: string | null;
  wording: string | null;
  version: number | null;
};

/** Pick the wording an investor would see for one statement: approved and effective, else newest draft when previewing drafts. */
function pick(rows: Row[], key: CertificationKey, today: string, includeDrafts: boolean): Omit<PreviewStatement, "key" | "heading"> {
  const mine = rows.filter((r) => r.requirement_key === `certification:${key}`).sort((a, b) => b.version - a.version);
  const approved = mine.find((r) => r.status === "approved" && r.effective_date <= today);
  if (includeDrafts) {
    const draft = mine.find((r) => r.status === "draft" && (!approved || r.version > approved.version));
    if (draft) return { source: "draft", title: draft.title, wording: draft.wording, version: draft.version };
  }
  if (approved) return { source: "approved", title: approved.title, wording: approved.wording, version: approved.version };
  return { source: "missing", title: null, wording: null, version: null };
}

export function certificationPreview(input: { rows: Row[]; today: string; includeDrafts: boolean; offeringRepresentations: boolean }) {
  return PREVIEW_INVESTOR_TYPES.map((t) => {
    const statements = requiredCertifications({ isEntityOrDelegated: t.isEntityOrDelegated, hasOfferingRepresentations: input.offeringRepresentations })
      .map((k) => ({ key: k, heading: CERTIFICATIONS[k].heading, ...pick(input.rows, k, input.today, input.includeDrafts) }));
    return { ...t, statements, blocked: statements.some((s) => s.source === "missing") };
  });
}
