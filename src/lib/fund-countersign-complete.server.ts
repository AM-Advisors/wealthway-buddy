/**
 * Fund countersignature completion, shared by the countersign page and the
 * provider webhook. Idempotent: saves the fully executed copy once, keeps the
 * investor-signed copy as history, then admits the investor to funding when
 * every gate is already clear. Never moves money.
 */
export async function completeFundCountersign(db: any, input: { signerRowId: string; requestId: string }) {
  const { data: me } = await db.from("document_signature_signers")
    .select("id, signature_id, offering_id, offering_document_id, signer_user_id, signer_email, status, signed_at")
    .eq("id", input.signerRowId).maybeSingle();
  if (!me) return { completed: false };
  const box = await import("@/lib/box.server");
  const detail = await box.getSignRequestDetail(input.requestId).catch(() => null);
  const mine = detail?.signers.find((x: any) => x.email === String(me.signer_email ?? "").toLowerCase());
  if (!detail || mine?.decision !== "signed") return { completed: false };
  const signedAt = mine.signedAt ?? me.signed_at ?? new Date().toISOString();

  const { data: sig } = await db.from("document_signatures").select("id, application_id, pdf_path, executed_pdf_path").eq("id", me.signature_id).maybeSingle();
  if (sig && !sig.executed_pdf_path && detail.signedFileId && sig.pdf_path) {
    const bytes = await box.downloadFile(detail.signedFileId);
    const path = String(sig.pdf_path).replace(/\.pdf$/i, "") + "-countersigned.pdf";
    await db.storage.from("signed-documents").upload(path, bytes, { contentType: "application/pdf", upsert: true });
    await db.from("document_signatures").update({ executed_pdf_path: path, executed_at: signedAt }).eq("id", sig.id).is("executed_pdf_path", null);
    await db.from("offering_document_events").insert({ offering_id: me.offering_id, offering_document_id: me.offering_document_id, event: "fund_countersigned", actor_user_id: me.signer_user_id, detail: { signatureId: sig.id, countersignedPath: path, requestId: input.requestId } }).then(() => null, () => null);
  }
  if (me.status !== "signed") {
    await db.from("document_signature_signers").update({ status: "signed", signed_at: signedAt, last_event_at: signedAt }).eq("id", me.id).neq("status", "signed");
  }
  if (sig?.application_id && me.signer_user_id) await releaseFundingAfterCountersign(db, sig.application_id, me.signer_user_id);
  return { completed: true };
}

/** Pure: should countersign completion admit the investor now? */
export function shouldAdmitAfterCountersign(ob: { stage: string | null; approved_to_fund_at: string | null; removed_at: string | null; investor_user_id: string | null } | null, signerUserId: string) {
  if (!ob || ob.removed_at || ob.approved_to_fund_at) return false;
  if (ob.investor_user_id === signerUserId) return false;
  return ob.stage === "harmonious_review";
}

/**
 * The fund signatory's acceptance signature is their approval. Runs the normal
 * approveToFund checks (identity, accreditation, documents, open issues); if any
 * remain, nothing changes and the dashboards show what is blocking.
 */
export async function releaseFundingAfterCountersign(db: any, applicationId: string, signerUserId: string) {
  const { data: ob } = await db.from("investor_onboardings")
    .select("id, stage, approved_to_fund_at, removed_at, investor_user_id")
    .eq("application_id", applicationId).is("removed_at", null).maybeSingle();
  if (!shouldAdmitAfterCountersign(ob, signerUserId)) return { released: false };
  try {
    const { approveToFund } = await import("@/lib/investor-onboarding.server");
    await approveToFund(signerUserId, { onboardingId: ob.id });
    return { released: true };
  } catch (e) {
    console.log("[countersign] funding not released yet:", e instanceof Error ? e.message : "blocked");
    return { released: false };
  }
}
