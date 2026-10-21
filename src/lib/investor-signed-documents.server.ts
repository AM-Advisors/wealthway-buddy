/** Owner-scoped archive: no manager or staff role may substitute for ownership. */
type SignedDocument = { id: string; title: string; version: number | null; snapshotVersion: number | null; signedAt: string | null; hasCopy: boolean; replaced: boolean; fullyExecuted: boolean; executedAt: string | null };
export async function investorSignedDocuments(db: any, userId: string, onboardingId: string): Promise<SignedDocument[]> {
  const { data: row, error } = await db.from("investor_onboardings")
    .select("id, investor_user_id, application_id, executed_snapshot, removed_at").eq("id", onboardingId).maybeSingle();
  if (error) throw new Error("Your submitted documents could not be loaded. Please try again.");
  if (!row || row.investor_user_id !== userId || row.removed_at) throw new Error("This investment is not available to this account.");
  if (!row.executed_snapshot || !row.application_id) return [];
  return submittedSignedDocuments(db, row.application_id);
}

/** Shared evidence read; callers must authorize the exact investment first. */
export async function submittedSignedDocuments(db: any, applicationId: string): Promise<SignedDocument[]> {
  const { data: signatures, error: signaturesError } = await db.from("document_signatures")
    .select("id, offering_document_id, signature_template_version, snapshot_version, signed_at, provider_completed_at, provider_status, provider, pdf_path, executed_pdf_path, executed_at, cancelled_at, superseded_by")
    .eq("application_id", applicationId).order("signed_at", { ascending: false });
  if (signaturesError) throw new Error("Your signed documents could not be loaded. Please try again.");
  const completed = (signatures ?? []).filter((s: any) => !s.cancelled_at &&
    (s.provider_status === "completed" || ((!s.provider || s.provider === "internal" || s.provider === "native") && s.signed_at)));
  const ids = [...new Set(completed.map((s: any) => s.offering_document_id).filter(Boolean))];
  const { data: documents, error: documentError } = ids.length
    ? await db.from("offering_documents").select("id, title").in("id", ids)
    : { data: [], error: null };
  if (documentError) throw new Error("Document names could not be loaded. Please try again.");
  return completed.map((s: any) => ({
    id: s.id as string,
    title: (documents ?? []).find((d: any) => d.id === s.offering_document_id)?.title ?? "Signed document",
    version: s.signature_template_version as number | null,
    snapshotVersion: s.snapshot_version as number | null,
    signedAt: (s.provider_completed_at ?? s.signed_at) as string | null,
    hasCopy: Boolean(s.pdf_path),
    replaced: Boolean(s.superseded_by),
    fullyExecuted: Boolean(s.executed_pdf_path),
    executedAt: (s.executed_at ?? null) as string | null,
  }));
}

export async function investorSignedCopy(db: any, userId: string, input: { onboardingId: string; signatureId: string }) {
  const documents = await investorSignedDocuments(db, userId, input.onboardingId);
  if (!documents.some((d: any) => d.id === input.signatureId && d.hasCopy)) throw new Error("That signed copy is not available for this investment.");
  const { data: signature, error } = await db.from("document_signatures").select("pdf_path, executed_pdf_path").eq("id", input.signatureId).maybeSingle();
  if (error || !signature?.pdf_path) throw new Error("Your signed copy could not be loaded.");
  const result = await db.storage.from("signed-documents").createSignedUrl(signature.executed_pdf_path ?? signature.pdf_path, 300, { download: true });
  if (result.error || !result.data?.signedUrl) throw new Error("Your signed copy could not be opened. Please try again.");
  return { url: result.data.signedUrl as string };
}