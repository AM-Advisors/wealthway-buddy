/**
 * Investor document review: the fund manager approves each investor's
 * signature documents before the investor can sign, and signed agreements are
 * listed back for the manager. Approvals are append-only and tied to the
 * document version in use — a new version needs a fresh approval.
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

/** True only when the fund manager approved the current version for this investor. */
export async function approvedForSigning(db: any, applicationId: string, documentId: string) {
  const [{ data: ob }, { data: doc }] = await Promise.all([
    db.from("investor_onboardings").select("id").eq("application_id", applicationId).is("removed_at", null).maybeSingle(),
    db.from("offering_documents").select("active_version").eq("id", documentId).maybeSingle(),
  ]);
  if (!ob) return false;
  const { data } = await db.from("investor_document_approvals").select("onboarding_id, offering_document_id, version, decision")
    .eq("onboarding_id", ob.id).eq("offering_document_id", documentId).order("decided_at", { ascending: false });
  return latestDecision(data ?? [], ob.id, documentId, doc?.active_version ?? null)?.decision === "approved";
}

export async function listDocumentReviews(userId: string, offeringId: string) {
  await assertManager(userId, offeringId);
  const db = await admin();
  const [{ data: obs }, { data: docs }] = await Promise.all([
    db.from("investor_onboardings").select("id, application_id, person_id, investor_user_id, stage").eq("offering_id", offeringId).is("removed_at", null),
    db.from("offering_documents").select("id, title, active_version, requires_signature").eq("offering_id", offeringId).eq("requires_signature", true).order("sort_order"),
  ]);
  const rows = (obs ?? []) as any[];
  const personIds = rows.map((r) => r.person_id).filter(Boolean);
  const appIds = rows.map((r) => r.application_id).filter(Boolean);
  const [{ data: persons }, { data: decisions }, { data: sigs }] = await Promise.all([
    personIds.length ? db.from("persons").select("id, email, preferred_name, legal_first_name, legal_last_name").in("id", personIds) : { data: [] },
    rows.length ? db.from("investor_document_approvals").select("*").in("onboarding_id", rows.map((r) => r.id)).order("decided_at", { ascending: false }) : { data: [] },
    appIds.length ? db.from("document_signatures").select("id, application_id, offering_document_id, signer_name, provider_status, provider_completed_at, signed_at, pdf_path, cancelled_at, superseded_by").in("application_id", appIds) : { data: [] },
  ]);
  const pMap = new Map(((persons ?? []) as any[]).map((p) => [p.id, p]));
  const docList = (docs ?? []) as any[];
  const signed = ((sigs ?? []) as any[]).filter((s) => !s.cancelled_at && !s.superseded_by && (s.provider_status === "completed" || s.signed_at) && s.pdf_path);
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
            decision: (dec?.decision ?? null) as "approved" | "returned" | null,
            note: (dec?.note ?? null) as string | null,
            decidedAt: (dec?.decided_at ?? null) as string | null,
            signed: sig ? { signatureId: sig.id as string, signerName: sig.signer_name as string | null, signedAt: (sig.provider_completed_at ?? sig.signed_at) as string } : null,
          };
        }),
      };
    }),
  };
}

export async function decideDocument(userId: string, input: { offeringId: string; onboardingId: string; documentId: string; decision: "approved" | "returned"; note?: string | null | undefined }) {
  await assertManager(userId, input.offeringId);
  const db = await admin();
  const [{ data: ob }, { data: doc }] = await Promise.all([
    db.from("investor_onboardings").select("id, offering_id").eq("id", input.onboardingId).is("removed_at", null).maybeSingle(),
    db.from("offering_documents").select("id, offering_id, active_version, requires_signature").eq("id", input.documentId).maybeSingle(),
  ]);
  if (!ob || ob.offering_id !== input.offeringId) forbid("that investor isn't in this fund.");
  if (!doc || doc.offering_id !== input.offeringId || !doc.requires_signature) forbid("that document isn't a signature document for this fund.");
  const note = input.note?.trim() || null;
  if (input.decision === "returned" && !note) throw new Error("Add a note explaining what needs to change.");
  const { error } = await db.from("investor_document_approvals").insert({
    offering_id: input.offeringId, onboarding_id: ob.id, offering_document_id: doc.id, version: doc.active_version ?? null,
    decision: input.decision, note, decided_by: userId,
  });
  if (error) throw new Error(error.message);
  await db.from("offering_document_events").insert({ offering_id: input.offeringId, offering_document_id: doc.id, version: doc.active_version, event: input.decision === "approved" ? "approved_for_investor" : "returned_for_investor", actor_user_id: userId, detail: { onboardingId: ob.id } }).then(() => null, () => null);
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
