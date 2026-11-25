import type { PreparedField } from "@/lib/investor-prep-model";
import { type FieldProvenance, confirmedFacts, docApplies, effectiveResolverFacts, fingerprint, initialProvenance, investingPartyName, mergeDocument, ownEntrySnapshotPlan, requiredMergeFields, reviewField, signatureConfig } from "@/lib/prepared-investor-workflow";

type ProvOnboarding = { id: string; offering_id: string; invitation_id: string | null };

/** Field provenance for many investments in two reads. A failed read is logged and treated as no rows (the pre-batch behavior). Single-row callers use the same path. */
export async function loadProvenanceMany(db: any, obs: ProvOnboarding[]) {
  const out = new Map<string, { draft: any; prov: Record<string, FieldProvenance> }>();
  const invIds = [...new Set(obs.map((o) => o.invitation_id).filter((x): x is string => !!x))];
  const drafts: any[] = [];
  for (let i = 0; i < invIds.length; i += 100) {
    const { data, error } = await db.from("investor_prep_drafts").select("*").in("invitation_id", invIds.slice(i, i + 100)).eq("status", "sent");
    if (error) console.error(`Prepared draft read failed (treated as no rows): ${error.message}`);
    else drafts.push(...((data ?? []) as any[]));
  }
  const draftFor = (o: ProvOnboarding) => {
    const m = drafts.filter((d) => d.invitation_id === o.invitation_id && d.offering_id === o.offering_id);
    return m.length === 1 ? m[0] : null; // maybeSingle semantics: ambiguous → none
  };
  const withDraft = obs.filter((o) => o.invitation_id && draftFor(o));
  const reviews: any[] = [];
  const obIds = withDraft.map((o) => o.id);
  for (let i = 0; i < obIds.length; i += 100) {
    const { data, error } = await db.from("investor_prep_field_reviews").select("*").in("onboarding_id", obIds.slice(i, i + 100)).order("created_at");
    if (error) console.error(`Prepared review read failed (treated as no rows): ${error.message}`);
    else reviews.push(...((data ?? []) as any[]));
  }
  for (const o of obs) {
    const draft = o.invitation_id ? draftFor(o) : null;
    if (!draft) { out.set(o.id, { draft: null as any, prov: {} }); continue; }
    const prov = initialProvenance(((draft as any).fields ?? {}) as Record<string, PreparedField>, (draft as any).sent_at ?? (draft as any).updated_at);
    for (const r of reviews.filter((x) => x.onboarding_id === o.id)) {
      const p = prov[r.field_key]; if (!p) continue;
      prov[r.field_key] = reviewField(p, r.action === "confirm" ? { confirm: true } : { correct: r.new_value }, r.created_at);
    }
    out.set(o.id, { draft, prov });
  }
  return out;
}

/** Field provenance for one investment, rebuilt from the prepared draft + append-only review history. */
export async function loadProvenance(db: any, onboarding: ProvOnboarding) {
  return (await loadProvenanceMany(db, [onboarding])).get(onboarding.id)!;
}

export async function loadConfirmedFacts(db: any, onboarding: ProvOnboarding) {
  const { prov } = await loadProvenance(db, onboarding);
  return confirmedFacts(prov);
}

/** Loads the investor's own onboarding + the prepared draft. Anyone else is rejected. */
export async function ownContext(userId: string, onboardingId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: ob } = await db.from("investor_onboardings").select("id, offering_id, investor_user_id, invitation_id, requested_amount_cents, application_id")
    .eq("id", onboardingId).maybeSingle();
  if (!ob || (ob as any).investor_user_id !== userId) throw new Error("This investment isn't available.");
  const { draft, prov } = await loadProvenance(db, ob as any);
  return { db, ob: ob as any, draft, prov };
}

export async function docContext(userId: string, onboardingId: string) {
  const c = await ownContext(userId, onboardingId);
  const { db, ob, draft, prov } = c;
  const { data: fund } = await db.from("offerings").select("id, name, legal_entity_name").eq("id", ob.offering_id).maybeSingle();
  const { data: investment, error: investmentError } = await db.from("investor_onboardings").select("investment_profile_id, offering_class_key, person_id").eq("id", ob.id).single();
  if (investmentError || !investment) throw new Error("Investment document context isn't available.");
  const { data: storedProfile, error: profileError } = investment.investment_profile_id
    ? await db.from("investment_profiles").select("profile_type, legal_name, person_id, address_line1, address_line2, city, region, postal_code, country").eq("id", investment.investment_profile_id).maybeSingle()
    : { data: null, error: null };
  if (profileError) throw new Error("Investment profile isn't available.");
  const { data: docs, error: docsError } = await db.from("offering_documents")
    .select("id, offering_id, title, investor_required, requires_signature, signing_mode, template_key, file_path, applies_to, applicability")
    .eq("offering_id", ob.offering_id);
  if (docsError) throw new Error("Investment documents aren't available.");
  const { documentApplies } = await import("@/lib/offering-document-model");
  const confirmed = confirmedFacts(prov);
  const pt = String(effectiveResolverFacts({ profileType: storedProfile?.profile_type ?? null, requestedAmountCents: null, country: null }, confirmed).profileType ?? "unknown");
  const chosen = ((docs ?? []) as any[]).filter((d) =>
    docApplies(d.applies_to, pt) && documentApplies(d.applicability, { profileType: pt, classKey: investment?.offering_class_key ?? null }),
  );
  const profile: Record<string, unknown> = {};
  const { data: me } = await db.from("profiles").select("legal_name, email").eq("user_id", ob.investor_user_id).maybeSingle();
  // The investing party (investment profile / its person) names the documents; the login profile is only a last fallback.
  const personId = (storedProfile as any)?.person_id ?? (investment as any).person_id ?? null;
  const { data: person } = personId
    ? await db.from("persons").select("legal_first_name, legal_last_name").eq("id", personId).maybeSingle()
    : { data: null };
  const partyName = investingPartyName({
    investmentProfileLegalName: (storedProfile as any)?.legal_name, personFirst: (person as any)?.legal_first_name,
    personLast: (person as any)?.legal_last_name, loginLegalName: (me as any)?.legal_name,
  });
  if (partyName) profile["legal_name"] = partyName;
  const sp: any = storedProfile ?? {};
  if (!["unknown", "individual", "joint"].includes(String(sp.profile_type ?? "individual")) && sp.legal_name) profile["entity_name"] = sp.legal_name;
  const address = [sp.address_line1, sp.address_line2, sp.city, [sp.region, sp.postal_code].filter(Boolean).join(" "), sp.country]
    .map((v: unknown) => String(v ?? "").trim()).filter(Boolean).join(", ");
  if (address) profile["address"] = address;
  // Newer invited investors may have no legacy profiles row; fall back to the confirmed login email.
  const { accountContactFor } = await import("@/lib/account-contact.server");
  const contactEmail = (me as any)?.email || (ob.investor_user_id ? (await accountContactFor(db as any, ob.investor_user_id)).email : null);
  if (contactEmail) profile["email"] = contactEmail;
  // Trust documents reuse the investment's own recorded trustee, never the
  // login label, a co-trustee picked by row order or someone from another trust.
  // This supplies merge facts only; verification and signing authority stay
  // with the existing server gates, and prepared answers below keep precedence.
  if (pt === "trust" && investment.investment_profile_id && investment.person_id) {
    const { data: trustee, error: trusteeError } = await db.from("investment_profile_relationships")
      .select("persons:person_id(legal_first_name, legal_last_name)")
      .eq("profile_id", investment.investment_profile_id)
      .eq("person_id", investment.person_id)
      .eq("role", "trustee")
      .eq("status", "active")
      .eq("is_authorized_signer", true)
      .maybeSingle();
    if (trusteeError) throw new Error("Recorded trustee details couldn't be checked. Please try again.");
    const trusteePerson = (trustee as any)?.persons;
    const trusteeName = [trusteePerson?.legal_first_name, trusteePerson?.legal_last_name]
      .map((value: unknown) => typeof value === "string" ? value.trim() : "")
      .filter(Boolean).join(" ");
    if (trusteeName) {
      profile["authorized_signer_name"] = trusteeName;
      profile["signer_title"] = "Trustee";
    }
  }
  for (const [k, p] of Object.entries(prov)) profile[k] = p.currentValue;
  profile["profile_type"] = pt;
  const profileType = pt;
  const commitment = (profile["commitment_cents"] as number | undefined) ?? ob.requested_amount_cents ?? null;
  return { ...c, fund: fund as any, chosen, profile, profileType, commitment };
}

/** Fresh merge values for one document (used by the signing gate). */
export async function currentMerge(x: Awaited<ReturnType<typeof docContext>>, d: any) {
  const cfg = signatureConfig({ ...d, template_ready: true });
  return mergeDocument({ profile: { ...x.profile }, investment: { commitment_cents: x.commitment }, fund: { name: x.fund?.name ?? "", legal_entity_name: x.fund?.legal_entity_name ?? null }, effectiveDate: new Date().toISOString().slice(0, 10) }, requiredMergeFields(x.profileType, cfg.mode));
}


/**
 * Investor-entered investments (no staff-prepared draft): before the signing gate, record the
 * exact current document version as reviewed by this investor. Append-only: older versions are
 * superseded, never rewritten. Staff-prepared drafts are untouched (their review step remains).
 */
export async function ensureOwnEntrySnapshot(
  x: Awaited<ReturnType<typeof docContext>>, d: any, merged: Awaited<ReturnType<typeof currentMerge>>, userId: string,
) {
  const { data: snaps } = await x.db.from("investor_document_snapshots").select("*")
    .eq("onboarding_id", x.ob.id).eq("document_id", d.id).order("version", { ascending: false }).limit(1);
  const latest = ((snaps ?? []) as any[])[0] ?? null;
  const plan = ownEntrySnapshotPlan({ hasPreparedDraft: !!x.draft, missing: merged.missing.length, latest, currentMergeValues: merged.values, investorUserId: userId });
  if (plan === "none") return;
  const now = new Date().toISOString();
  if (plan === "mark_reviewed") {
    const { error } = await x.db.from("investor_document_snapshots")
      .update({ status: "reviewed", reviewed_at: now, reviewed_by: userId, reviewed_fingerprint: fingerprint(latest.merge_values) })
      .eq("id", latest.id).eq("status", "prepared");
    if (error) throw new Error("The document couldn't be prepared for signing. Please try again.");
    return;
  }
  if (latest && latest.status !== "superseded" && latest.status !== "sent_for_signature") {
    await x.db.from("investor_document_snapshots").update({ status: "superseded" }).eq("id", latest.id);
  }
  const cfg = signatureConfig({ ...d, template_ready: true });
  const { error } = await x.db.from("investor_document_snapshots").insert({
    onboarding_id: x.ob.id, offering_id: x.ob.offering_id, document_id: d.id, version: (latest?.version ?? 0) + 1,
    template_ref: String(d.template_key ?? d.file_path ?? d.id), profile_fingerprint: fingerprint(x.profile),
    merge_values: merged.values, merge_sources: merged.sources, signing_mode: cfg.mode, created_by: userId,
    status: "reviewed", reviewed_at: now, reviewed_by: userId, reviewed_fingerprint: fingerprint(merged.values),
  });
  if (error) throw new Error("The document couldn't be prepared for signing. Please try again.");
}
