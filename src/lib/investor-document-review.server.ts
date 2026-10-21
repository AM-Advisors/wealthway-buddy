/**
 * Investor document review: manager entry admits an investor to sign; otherwise
 * the manager approves signature documents explicitly. Signed agreements are
 * listed back for the manager. Approvals are append-only and tied to the
 * document version in use - a new version needs a fresh approval.
 * Invited funds: an investor sees only funds whose invitation matches their
 * verified email, and starting one runs the normal startOnboarding flow.
 */
import { setupActor, forbid } from "@/lib/fund-setup.server";

const admin = async () => ((await import("@/integrations/supabase/client.server")).supabaseAdmin as any);

async function assertManager(userId: string, offeringId: string) {
  const a = await setupActor(userId);
  if (!a.isStaff && !a.offeringIds.includes(offeringId)) forbid("you do not manage that fund.");
}

function personName(p: any) {
  if (!p) return null;
  return p.preferred_name || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") || null;
}

export function latestDecision(rows: any[], onboardingId: string, documentId: string, version: number | null) {
  return rows.find((r) => r.onboarding_id === onboardingId && r.offering_document_id === documentId && (r.version ?? null) === (version ?? null)) ?? null;
}

/** Explicit current-version decisions win; manager entry avoids duplicate admission approval. */
export async function approvedForSigning(db: any, applicationId: string, documentId: string) {
  const [obResult, docResult] = await Promise.all([
    db.from("investor_onboardings").select("id, offering_id, entry_source, created_by").eq("application_id", applicationId).is("removed_at", null).maybeSingle(),
    db.from("offering_documents").select("offering_id, active_version, requires_signature").eq("id", documentId).maybeSingle(),
  ]);
  if (obResult.error || docResult.error) throw new Error("Document approval could not be checked. Please try again.");
  const ob = obResult.data;
  const doc = docResult.data;
  if (!ob || !doc || ob.offering_id !== doc.offering_id || !doc.requires_signature) return false;
  const { data, error } = await db.from("investor_document_approvals").select("onboarding_id, offering_document_id, version, decision")
    .eq("onboarding_id", ob.id).eq("offering_document_id", documentId).order("decided_at", { ascending: false });
  if (error) throw new Error("Document approval could not be checked. Please try again.");
  const decision = latestDecision(data ?? [], ob.id, documentId, doc.active_version ?? null);
  if (decision) return decision.decision === "approved";
  return managerEntryAdmitsSigning(db, ob);
}

/** Provenance alone is insufficient: the creator must still manage this exact fund. */
async function managerEntryAdmitsSigning(db: any, ob: any): Promise<boolean> {
  if (ob.entry_source !== "fund_manager" || !ob.created_by) return false;
  const { data, error } = await db.from("fund_managers").select("user_id")
    .eq("offering_id", ob.offering_id).eq("user_id", ob.created_by).maybeSingle();
  if (error) throw new Error("Fund manager approval could not be checked. Please try again.");
  return Boolean(data);
}

export async function listDocumentReviews(userId: string, offeringId: string) {
  await assertManager(userId, offeringId);
  const db = await admin();
  const [{ data: obs }, { data: docs }] = await Promise.all([
    db.from("investor_onboardings").select("id, application_id, person_id, investor_user_id, stage, entry_source, created_by").eq("offering_id", offeringId).is("removed_at", null),
    db.from("offering_documents").select("id, title, active_version, requires_signature").eq("offering_id", offeringId).eq("requires_signature", true).order("sort_order"),
  ]);
  const rows = (obs ?? []) as any[];
  const creatorIds = [...new Set(rows.filter((r) => r.entry_source === "fund_manager").map((r) => r.created_by).filter(Boolean))];
  const managers = creatorIds.length ? await db.from("fund_managers").select("user_id").eq("offering_id", offeringId).in("user_id", creatorIds) : { data: [], error: null };
  if (managers.error) throw new Error("Fund manager approval could not be checked. Please try again.");
  const managerIds = new Set((managers.data ?? []).map((r: any) => r.user_id));
  const personIds = rows.map((r) => r.person_id).filter(Boolean);
  const appIds = rows.map((r) => r.application_id).filter(Boolean);
  const [{ data: persons }, { data: decisions }, { data: sigs }] = await Promise.all([
    personIds.length ? db.from("persons").select("id, email, preferred_name, legal_first_name, legal_last_name").in("id", personIds) : { data: [] },
    rows.length ? db.from("investor_document_approvals").select("*").in("onboarding_id", rows.map((r) => r.id)).order("decided_at", { ascending: false }) : { data: [] },
    appIds.length ? db.from("document_signatures").select("id, application_id, offering_document_id, signer_name, provider_status, provider_completed_at, signed_at, pdf_path, cancelled_at, superseded_by").in("application_id", appIds) : { data: [] },
  ]);
  const pMap = new Map(((persons ?? []) as any[]).map((p) => [p.id, p]));
  // Where this manager is also the fund signatory, approval and countersigning happen in one step.
  const sigIds = ((sigs ?? []) as any[]).map((s) => s.id);
  const { data: mySignerRows } = sigIds.length
    ? await db.from("document_signature_signers").select("id, signature_id, status").in("signature_id", sigIds).eq("role_key", "fund_manager").eq("signer_user_id", userId).in("status", ["waiting", "sent", "viewed"])
    : { data: [] };
  const mySigner = new Map(((mySignerRows ?? []) as any[]).map((r) => [r.signature_id, r.id as string]));
  const docList = (docs ?? []) as any[];
  const liveSigs = ((sigs ?? []) as any[]).filter((s) => !s.cancelled_at && !s.superseded_by);
  const { data: invSignedRows } = liveSigs.length
    ? await db.from("document_signature_signers").select("signature_id, signed_at").in("signature_id", liveSigs.map((s) => s.id)).neq("role_key", "fund_manager").eq("status", "signed")
    : { data: [] };
  const invSignedAt = new Map(((invSignedRows ?? []) as any[]).map((r) => [r.signature_id, r.signed_at as string]));
  // Signed = completed with a stored copy, or the investor's part is signed and waiting on the fund.
  const signed = liveSigs.filter((s) => ((s.provider_status === "completed" || s.signed_at) && s.pdf_path) || invSignedAt.has(s.id))
    .map((s) => (invSignedAt.has(s.id) && !s.provider_completed_at ? { ...s, provider_completed_at: invSignedAt.get(s.id) } : s));
  return {
    documents: docList.map((d) => ({ id: d.id as string, title: d.title as string, version: d.active_version as number | null })),
    investors: rows.map((r) => {
      const p = pMap.get(r.person_id);
      return {
        onboardingId: r.id as string,
        name: personName(p) ?? p?.email ?? "Unnamed investor",
        stage: r.stage as string,
        documents: docList.map((d) => {
          const dec = latestDecision((decisions ?? []) as any[], r.id, d.id, d.active_version ?? null);
          const sig = signed.find((s) => s.application_id === r.application_id && s.offering_document_id === d.id);
          return {
            documentId: d.id as string,
            decision: (sig && dec && dec.decided_at >= (sig.provider_completed_at ?? sig.signed_at) ? dec.decision : null) as "approved" | "returned" | null,
            note: (dec?.note ?? null) as string | null,
            decidedAt: (dec?.decided_at ?? null) as string | null,
            countersignSignerId: (sig ? mySigner.get(sig.id) ?? null : null) as string | null,
            signed: sig ? { hasCopy: Boolean(sig.pdf_path), signatureId: sig.id as string, signerName: sig.signer_name as string | null, signedAt: (sig.provider_completed_at ?? sig.signed_at) as string } : null,
          };
        }),
      };
    }),
  };
}

/** Pure: a manager decides only after the investor has signed; declining needs a reason. */
export function decisionRefusal(input: { investorSigned: boolean; decision: "approved" | "returned"; note: string | null }): string | null {
  if (!input.investorSigned) return "The investor hasn't finished signing this document yet.";
  if (input.decision === "returned" && !input.note) return "Add a reason for declining.";
  return null;
}

/** Countersigning opens only after the manager approved this investor's signed document. */
export async function managerApprovedSigned(db: any, onboardingId: string, documentId: string, investorSignedAt: string | null) {
  if (!investorSignedAt) return false;
  const { data: doc } = await db.from("offering_documents").select("active_version").eq("id", documentId).maybeSingle();
  const { data } = await db.from("investor_document_approvals").select("onboarding_id, offering_document_id, version, decision, decided_at")
    .eq("onboarding_id", onboardingId).eq("offering_document_id", documentId).order("decided_at", { ascending: false });
  const dec = latestDecision(data ?? [], onboardingId, documentId, doc?.active_version ?? null);
  return dec?.decision === "approved" && dec.decided_at >= investorSignedAt;
}

/** After the investor signs: approve (opens countersignature) or decline (pauses the investment). "returned" = declined. */
export async function decideDocument(userId: string, input: { offeringId: string; onboardingId: string; documentId: string; decision: "approved" | "returned"; note?: string | null | undefined }) {
  await assertManager(userId, input.offeringId);
  const db = await admin();
  const [{ data: ob }, { data: doc }] = await Promise.all([
    db.from("investor_onboardings").select("id, offering_id, application_id, investor_user_id").eq("id", input.onboardingId).is("removed_at", null).maybeSingle(),
    db.from("offering_documents").select("id, title, offering_id, active_version, requires_signature").eq("id", input.documentId).maybeSingle(),
  ]);
  if (!ob || ob.offering_id !== input.offeringId) forbid("that investor isn't in this fund.");
  if (!doc || doc.offering_id !== input.offeringId || !doc.requires_signature) forbid("that document isn't a signature document for this fund.");
  const note = input.note?.trim() || null;
  const { data: sigs } = ob.application_id
    ? await db.from("document_signatures").select("id, provider_status, signed_at, cancelled_at, superseded_by").eq("application_id", ob.application_id).eq("offering_document_id", doc.id)
    : { data: [] };
  const { data: invSigned } = await db.from("document_signature_signers").select("id").in("signature_id", ((sigs ?? []) as any[]).filter((s) => !s.cancelled_at && !s.superseded_by).map((s) => s.id).concat(["00000000-0000-0000-0000-000000000000"])).neq("role_key", "fund_manager").eq("status", "signed").limit(1);
  const investorSigned = ((sigs ?? []) as any[]).some((s) => !s.cancelled_at && !s.superseded_by && s.provider_status === "completed") || Boolean((invSigned ?? []).length);
  const refusal = decisionRefusal({ investorSigned, decision: input.decision, note });
  if (refusal) throw new Error(refusal);
  const { error } = await db.from("investor_document_approvals").insert({
    offering_id: input.offeringId, onboarding_id: ob.id, offering_document_id: doc.id, version: doc.active_version ?? null,
    decision: input.decision, note, decided_by: userId,
  });
  if (error) throw new Error(error.message);
  await db.from("offering_document_events").insert({ offering_id: input.offeringId, offering_document_id: doc.id, version: doc.active_version, event: input.decision === "approved" ? "approved_for_investor" : "returned_for_investor", actor_user_id: userId, detail: { onboardingId: ob.id, afterSigning: true } }).then(() => null, () => null);
  if (input.decision === 'approved') {
    const signatureIds = ((sigs ?? []) as any[]).filter((s) => !s.cancelled_at && !s.superseded_by).map((s) => s.id);
    const { data: signer } = signatureIds.length ? await db.from('document_signature_signers')
      .select('id, signature_id, signer_user_id').in('signature_id', signatureIds).eq('role_key', 'fund_manager')
      .in('status', ['waiting', 'sent', 'viewed']).order('signing_order').limit(1).maybeSingle() : { data: null };
    if (signer?.signer_user_id && signer.signer_user_id !== userId) {
      const { notifyInvestorApproval } = await import('@/lib/investor-approval-notify.server');
      await notifyInvestorApproval({ onboardingId: ob.id, action: 'sign', ref: `countersign:${signer.signature_id}`, signerUserId: signer.signer_user_id });
    }
  }
  if (input.decision === "returned") {
    const { data: ex } = await db.from("investor_onboarding_exceptions")
      .insert({ onboarding_id: ob.id, exception_type: "manager_declined_documents", severity: "blocking", owner: "harmonious", detail: `Fund manager declined ${doc.title}: ${note}`, raised_by: userId })
      .select("id").single().then((r: any) => r, () => ({ data: null }));
    const { notifyDocumentsDeclined } = await import("@/lib/investor-blocked-notify.server");
    await notifyDocumentsDeclined({ onboardingId: ob.id, offeringId: input.offeringId, investorUserId: ob.investor_user_id ?? null, documentTitle: doc.title, ref: ex?.id ?? `${ob.id}:${doc.id}` });
  }
  return { ok: true };
}

export async function signedCopyUrl(userId: string, input: { offeringId: string; signatureId: string }) {
  await assertManager(userId, input.offeringId);
  const db = await admin();
  const { data: sig } = await db.from("document_signatures").select("id, application_id, pdf_path, offering_document_id").eq("id", input.signatureId).maybeSingle();
  if (!sig?.pdf_path) throw new Error("No signed copy is stored for that agreement yet.");
  const { data: app } = await db.from("investor_applications").select("offering_id").eq("id", sig.application_id).maybeSingle();
  if (app?.offering_id !== input.offeringId) forbid("that agreement isn't for this fund.");
  const { data, error } = await db.storage.from("signed-documents").createSignedUrl(sig.pdf_path, 300, { download: true });
  if (error || !data) throw new Error("Couldn't open the signed copy.");
  return { url: data.signedUrl as string };
}

async function myEmail(db: any, userId: string) {
  const { data } = await db.auth.admin.getUserById(userId);
  return (data?.user?.email as string | undefined)?.toLowerCase() ?? null;
}

/** Funds the signed-in person is invited to (matched on their own email), plus whether they've started. */
export async function myInvitedFunds(userId: string) {
  const db = await admin();
  const email = await myEmail(db, userId);
  if (!email) return [];
  const { data: invs } = await db.from("fund_invitations").select("id, offering_id, status, expires_at, intended_amount_cents, email").ilike("email", email).in("status", ["invited", "pending", "accepted"]);
  const list = ((invs ?? []) as any[]).filter((i) => String(i.email).toLowerCase() === email && (!i.expires_at || i.expires_at > new Date().toISOString() || i.status === "accepted"));
  if (!list.length) return [];
  const ids = [...new Set(list.map((i) => i.offering_id))];
  const [{ data: funds }, { data: obs }] = await Promise.all([
    db.from("offerings").select("id, name, is_open").in("id", ids),
    db.from("investor_onboardings").select("id, offering_id, stage").eq("investor_user_id", userId).in("offering_id", ids).is("removed_at", null),
  ]);
  return ids.map((id) => {
    const inv = list.find((i) => i.offering_id === id);
    const f = ((funds ?? []) as any[]).find((x) => x.id === id);
    const ob = ((obs ?? []) as any[]).find((o) => o.offering_id === id && !["closed", "declined", "cancelled"].includes(o.stage));
    return { invitationId: inv.id as string, offeringId: id as string, fundName: (f?.name as string) ?? "Fund", open: Boolean(f?.is_open), intendedAmountCents: (inv.intended_amount_cents ?? null) as number | null, onboardingId: (ob?.id ?? null) as string | null };
  });
}

export async function startInvitedFund(userId: string, invitationId: string) {
  const db = await admin();
  const email = await myEmail(db, userId);
  const { data: inv } = await db.from("fund_invitations").select("id, offering_id, token, email").eq("id", invitationId).maybeSingle();
  if (!inv || !email || String(inv.email).toLowerCase() !== email) forbid("that invitation isn't for you.");
  const { startOnboarding } = await import("@/lib/investor-onboarding.server");
  return startOnboarding(userId, { slugOrId: inv.offering_id, invitationToken: inv.token });
}
