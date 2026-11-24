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
  if (sig?.application_id) {
    const { data: ob } = await db.from("investor_onboardings").select("id").eq("application_id", sig.application_id).is("removed_at", null).maybeSingle();
    if (ob?.id) await acceptAfterCountersign(db, ob.id).catch((e: unknown) => console.error("[countersign] admit failed", e));
  }
  // Every path that records a signature rechecks the investment so its checklist counts it.
  if (sig?.application_id) {
    const { reconcileReadinessForSubjects } = await import("@/lib/investor-onboarding.server");
    await reconcileReadinessForSubjects({ applicationId: sig.application_id }, "fund_countersign").catch((e) => console.error("[countersign] readiness recheck failed", e));
  }
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

/** Pure: may a completed fund countersignature stand in for both manager approval and acceptance? */
export function countersignAdmits(input: {
  stage: string | null; fundingStatus: string | null; acceptedAt: string | null; removedAt: string | null;
  investorUserId: string | null; signerUserId: string | null; outstanding: number; blocking: number;
}): boolean {
  if (input.removedAt || input.acceptedAt || !input.signerUserId) return false;
  if (input.signerUserId === input.investorUserId) return false;
  if (input.fundingStatus !== "funded") return false;
  if (input.outstanding > 0 || input.blocking > 0) return false;
  return ["harmonious_review", "approved_to_fund", "awaiting_funds", "funded"].includes(String(input.stage ?? ""));
}

/**
 * The fund's countersignature is the approval and the acceptance: once funds are
 * reconciled, record both from the countersign (no separate Approve or Accept & admit).
 * Idempotent; refuses while any requirement or blocking issue is open. Never moves money.
 */
export async function acceptAfterCountersign(db: any, onboardingId: string) {
  const { data: ob } = await db.from("investor_onboardings")
    .select("id, offering_id, application_id, stage, funding_status, accepted_at, removed_at, investor_user_id, approved_to_fund_at, accepted_amount_cents, commitment_amount_cents, requested_amount_cents")
    .eq("id", onboardingId).maybeSingle();
  if (!ob?.application_id) return { accepted: false };
  const { data: signer } = await db.from("document_signature_signers")
    .select("signer_user_id, signer_name, signed_at").eq("application_id", ob.application_id)
    .eq("role_key", "fund_manager").eq("status", "signed").not("signer_user_id", "is", null)
    .order("signed_at", { ascending: false }).limit(1).maybeSingle();
  const { readinessBlockers } = await import("@/lib/investor-onboarding.server");
  const { outstanding, blocking } = await readinessBlockers(ob.id);
  if (!countersignAdmits({ stage: ob.stage, fundingStatus: ob.funding_status, acceptedAt: ob.accepted_at, removedAt: ob.removed_at, investorUserId: ob.investor_user_id, signerUserId: signer?.signer_user_id ?? null, outstanding, blocking })) return { accepted: false };
  const now = new Date().toISOString();
  const amount = Number(ob.accepted_amount_cents ?? ob.commitment_amount_cents ?? ob.requested_amount_cents ?? 0);
  const { data: done } = await db.from("investor_onboardings").update({
    stage: "accepted",
    ...(ob.approved_to_fund_at ? {} : { approved_to_fund_at: now, approved_to_fund_by: signer.signer_user_id, funding_released_at: now, accepted_amount_cents: amount }),
    accepted_by: signer.signer_user_id,
    accepted_at: now,
    acceptance_capacity: `${signer.signer_name ?? "Fund signatory"} · Fund countersignature`,
    updated_at: now,
  }).eq("id", ob.id).is("accepted_at", null).select("id").maybeSingle();
  if (!done) return { accepted: false };
  await db.from("investor_onboarding_events").insert({
    onboarding_id: ob.id, offering_id: ob.offering_id, event: "subscription_accepted", from_status: ob.stage, to_status: "accepted",
    actor_user_id: signer.signer_user_id, actor_role: "fund_manager",
    detail: { via: "fund_countersignature", signerName: signer.signer_name ?? null, countersignedAt: signer.signed_at ?? null, approvedToFund: !ob.approved_to_fund_at },
  }).then(() => null, () => null);
  const { onInvestmentAccepted } = await import("@/lib/drive.server");
  await onInvestmentAccepted(ob.id, signer.signer_user_id).catch(() => null);
  return { accepted: true };
}
