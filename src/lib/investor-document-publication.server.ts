import { investorDocumentPublication } from "./investor-document-publication";

/** Caller authorizes the investment/document IDs before supplying them here. */
export async function documentPublicationFor(db: any, documents: any[], onboardingId: string | null, signatures: any[] = []) {
  if (!documents.length) return new Map<string, ReturnType<typeof investorDocumentPublication>>();
  const { data, error } = await db.from("offering_document_versions")
    .select("offering_document_id, version, approval_status, signing_config_status, rollout_scope, target_onboarding_id")
    .in("offering_document_id", documents.map((d) => d.id));
  if (error) throw new Error("Document approval status could not be loaded. Please try again.");
  return new Map<string, ReturnType<typeof investorDocumentPublication>>(documents.map((d) => {
    const own = (data ?? []).filter((v: any) => v.offering_document_id === d.id);
    const retained = signatures.find((s) => s.offering_document_id === d.id && s.signature_template_version != null);
    const individual = own.filter((v: any) => onboardingId && v.rollout_scope === "single" && v.target_onboarding_id === onboardingId && v.approval_status === "approved")
      .sort((a: any, b: any) => b.version - a.version)[0];
    const assignedVersion = retained?.signature_template_version ?? individual?.version ?? d.active_version;
    const version = own.find((v: any) => v.version === assignedVersion) ?? own.sort((a: any, b: any) => b.version - a.version)[0];
    return [d.id, investorDocumentPublication({
      published: assignedVersion != null && version?.version === assignedVersion,
      approval: version?.approval_status ?? null,
      usage: d.usage ?? null,
      requiresSignature: Boolean(d.requires_signature),
      signingStatus: version?.signing_config_status ?? null,
    })];
  }));
}