/**
 * Fund manager → investor document sending. Managers of the exact fund (or
 * Harmonious staff) send the fund's in-use document versions to the investors
 * they apply to. Each send is an append-only record plus one email per
 * investor with a sign-in link. Sending never changes signed copies, never
 * starts provider signing, and never sends unapproved versions.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { setupActor, forbid } from "@/lib/fund-setup.server";
import { documentApplies, DOCUMENT_CATEGORY_LABELS } from "@/lib/offering-document-model";
import { investorDocuments } from "@/lib/offering-document-setup.server";

const db = () => supabaseAdmin as any;
const PORTAL = "https://onboard.harmonious.co";
const SENDABLE = ["subscription_agreement", "operating_agreement", "ppm", "offering_memorandum", "side_letter", "other"];

async function assertManager(userId: string, offeringId: string) {
  const a = await setupActor(userId);
  if (!a.isStaff && !a.offeringIds.includes(offeringId)) forbid("you do not manage that fund.");
  return a;
}

function personName(p: any) {
  if (!p) return null;
  return p.preferred_name || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") || null;
}

async function loadRoster(offeringId: string) {
  const { data: rows } = await db().from("investor_onboardings").select("id, investor_user_id, person_id, investment_profile_id, offering_class_key").eq("offering_id", offeringId).is("removed_at", null);
  const list = (rows ?? []) as any[];
  const personIds = list.map((r) => r.person_id).filter(Boolean);
  const profileIds = list.map((r) => r.investment_profile_id).filter(Boolean);
  const [{ data: persons }, { data: profiles }] = await Promise.all([
    personIds.length ? db().from("persons").select("id, email, preferred_name, legal_first_name, legal_last_name").in("id", personIds) : { data: [] },
    profileIds.length ? db().from("investment_profiles").select("id, profile_type").in("id", profileIds) : { data: [] },
  ]);
  const pMap = new Map(((persons ?? []) as any[]).map((p) => [p.id, p]));
  const prMap = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p.profile_type]));
  return list.map((r) => {
    const p = pMap.get(r.person_id);
    return { onboardingId: r.id as string, userId: r.investor_user_id as string | null, name: personName(p), email: (p?.email as string) || null, profileType: prMap.get(r.investment_profile_id) ?? null, classKey: r.offering_class_key ?? null };
  });
}

async function activeDocs(offeringId: string) {
  const { data } = await db().from("offering_documents").select("id, title, document_category, usage, applicability, active_version").eq("offering_id", offeringId).not("active_version", "is", null).order("sort_order");
  return ((data ?? []) as any[]).filter((d) => !d.document_category || SENDABLE.includes(d.document_category));
}

/** Documents in use for the fund plus each investor's send history. */
export async function listSendableDocuments(userId: string, offeringId: string) {
  await assertManager(userId, offeringId);
  const [docs, roster, { data: sends }] = await Promise.all([
    activeDocs(offeringId),
    loadRoster(offeringId),
    db().from("offering_document_sends").select("offering_document_id, version, onboarding_id, sent_at").eq("offering_id", offeringId).order("sent_at", { ascending: false }),
  ]);
  const sendList = (sends ?? []) as any[];
  return {
    documents: docs.map((d) => ({
      id: d.id as string,
      title: d.title as string,
      category: (DOCUMENT_CATEGORY_LABELS as any)[d.document_category] ?? "Document",
      version: d.active_version as number,
      usage: d.usage as string,
      appliesTo: roster.filter((r) => documentApplies(d.applicability, r)).map((r) => r.onboardingId),
    })),
    investors: roster.map((r) => ({
      onboardingId: r.onboardingId,
      name: r.name ?? r.email ?? "Unnamed investor",
      hasEmail: Boolean(r.email || r.userId),
      signedIn: Boolean(r.userId),
      sent: sendList.filter((s) => s.onboarding_id === r.onboardingId).map((s) => ({ documentId: s.offering_document_id as string, version: s.version as number, sentAt: s.sent_at as string })),
    })),
  };
}

export async function sendDocumentsToInvestors(userId: string, input: { offeringId: string; documentIds: string[]; onboardingIds: string[]; note?: string | null | undefined }) {
  await assertManager(userId, input.offeringId);
  if (!input.documentIds.length || !input.onboardingIds.length) throw new Error("Choose at least one document and one investor.");
  const docs = (await activeDocs(input.offeringId)).filter((d) => input.documentIds.includes(d.id));
  if (docs.length !== new Set(input.documentIds).size) throw new Error("Only documents currently in use for this fund can be sent.");
  const roster = (await loadRoster(input.offeringId)).filter((r) => input.onboardingIds.includes(r.onboardingId));
  if (roster.length !== new Set(input.onboardingIds).size) forbid("one of those investors isn't in this fund.");
  const { data: fund } = await db().from("offerings").select("name").eq("id", input.offeringId).maybeSingle();
  const { data: sender } = await db().from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");

  const results: { onboardingId: string; name: string; documents: number; emailed: boolean; skipped?: string | undefined }[] = [];
  for (const inv of roster) {
    const mine = docs.filter((d) => documentApplies(d.applicability, inv));
    const name = inv.name ?? inv.email ?? "Investor";
    if (!mine.length) { results.push({ onboardingId: inv.onboardingId, name, documents: 0, emailed: false, skipped: "No selected document applies to this investor." }); continue; }
    let email = inv.email;
    if (!email && inv.userId) {
      const { data } = await supabaseAdmin.auth.admin.getUserById(inv.userId);
      email = data.user?.email ?? null;
    }
    let emailed = false;
    if (email) {
      try {
        const r = await sendTemplateEmail("documents-sent", email, { templateData: {
          investorName: inv.name ?? "", fundName: fund?.name ?? "your fund", senderName: sender?.full_name ?? "Your fund manager",
          documents: mine.map((d) => d.title), note: input.note || "", ctaUrl: `${PORTAL}/investment/${inv.onboardingId}`,
        } });
        emailed = Boolean(r.sent);
      } catch (e) {
        console.error("documents-sent email failed", e instanceof Error ? e.message : e);
      }
    }
    const { error } = await db().from("offering_document_sends").insert(mine.map((d) => ({
      offering_id: input.offeringId, offering_document_id: d.id, version: d.active_version, onboarding_id: inv.onboardingId,
      recipient_email: email, note: input.note || null, email_sent: emailed, sent_by: userId,
    })));
    if (error) throw new Error(error.message);
    await db().from("offering_document_events").insert(mine.map((d) => ({ offering_id: input.offeringId, offering_document_id: d.id, version: d.active_version, event: "sent_to_investor", actor_user_id: userId, detail: { onboardingId: inv.onboardingId, emailed } })));
    results.push({ onboardingId: inv.onboardingId, name, documents: mine.length, emailed, skipped: email ? undefined : "No email on file - visible in their portal once they sign in." });
  }
  return { results };
}

/** Everything sent to the signed-in investor, across their investments. */
export async function myDocumentInbox(userId: string) {
  const { data: rows } = await db().from("investor_onboardings").select("id, offering_id").eq("investor_user_id", userId).is("removed_at", null);
  const list = (rows ?? []) as any[];
  if (!list.length) return [];
  const offeringIds = [...new Set(list.map((r) => r.offering_id))];
  const [{ data: funds }, { data: sends }] = await Promise.all([
    db().from("offerings").select("id, name").in("id", offeringIds),
    db().from("offering_document_sends").select("offering_document_id, onboarding_id, sent_at").in("onboarding_id", list.map((r) => r.id)).order("sent_at", { ascending: false }),
  ]);
  const fundName = new Map(((funds ?? []) as any[]).map((f) => [f.id, f.name]));
  const out = [];
  for (const r of list) {
    const docs = await investorDocuments(userId, r.id).catch(() => []);
    out.push({
      onboardingId: r.id as string,
      fundName: (fundName.get(r.offering_id) as string) ?? "Fund",
      documents: docs.map((d: any) => ({ ...d, sentAt: (((sends ?? []) as any[]).find((s) => s.onboarding_id === r.id && s.offering_document_id === d.id)?.sent_at as string) ?? null })),
    });
  }
  return out;
}
