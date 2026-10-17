/**
 * Portal document catalog — server services. Every read and download re-checks
 * authority from canonical records and logs the decision (allow and deny).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authorizedProfiles,
  decideAccess,
  freshSecondFactor,
  hasAal2,
  matchDocument,
  DENY_MESSAGES,
  type EntitlementRow,
  type FolderMapping,
  type FreezeRow,
} from "@/lib/portal-documents";
import { pickStepUpMethod, type StepUpProof, type StepUpProofUsed } from "@/lib/mfa-ease";
import { providerFor, ProviderNotAuthorizedError, type ProviderItem } from "@/lib/document-providers.server";

const db = () => supabaseAdmin as any;
const nowIso = () => new Date().toISOString();
const STEP_UP_ACTION = "tax_document_download";
const STEP_UP_TTL_MS = 5 * 60_000;

function forbid(msg: string): never { throw new Error(`Forbidden: ${msg}`); }

async function log(actor: string | null, documentId: string | null, action: string, decision: "allow" | "deny", reason: string) {
  await db().from("document_access_events").insert({ actor_user_id: actor, document_id: documentId, action, decision, reason_code: reason, request_id: crypto.randomUUID() });
}

// ------------------------------------------------------------------ actor --

async function roles(userId: string) {
  const { data } = await db().from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}

export async function assertPortalStaff(userId: string) {
  if (!(await roles(userId)).includes("admin")) forbid("Harmonious administrator access is required.");
}

/** Investment profiles this person may receive tax documents for (canonical records only). */
export async function myAuthorizedProfiles(userId: string): Promise<string[]> {
  const { data: persons } = await db().from("persons").select("id").eq("user_id", userId);
  const personIds = ((persons ?? []) as any[]).map((p) => p.id as string);
  const [{ data: profiles }, { data: rels }] = await Promise.all([
    personIds.length
      ? db().from("investment_profiles").select("id, profile_type, owner_user_id, person_id").or(`owner_user_id.eq.${userId},person_id.in.(${personIds.join(",")})`)
      : db().from("investment_profiles").select("id, profile_type, owner_user_id, person_id").eq("owner_user_id", userId),
    personIds.length
      ? db().from("investment_profile_relationships").select("profile_id, person_id, status, verification_status, is_authorized_signer").in("person_id", personIds)
      : Promise.resolve({ data: [] }),
  ]);
  return authorizedProfiles(userId, personIds, (profiles ?? []) as any[], (rels ?? []) as any[]);
}

async function activeFreezes(): Promise<FreezeRow[]> {
  const { data } = await db().from("document_access_freezes").select("scope, scope_id, lifted_at").is("lifted_at", null);
  return (data ?? []) as FreezeRow[];
}

async function entitlementsFor(docIds: string[]): Promise<Record<string, EntitlementRow[]>> {
  if (!docIds.length) return {};
  const { data } = await db().from("document_entitlements").select("document_id, principal_type, principal_id, action, created_at").in("document_id", docIds);
  const out: Record<string, EntitlementRow[]> = {};
  for (const r of (data ?? []) as any[]) (out[r.document_id] ??= []).push(r);
  return out;
}

// --------------------------------------------------------------- investor --

export async function investorTaxView(userId: string, claims: unknown) {
  if (!hasAal2(claims as any)) {
    await log(userId, null, "list", "deny", "mfa_required");
    return { mfaRequired: true as const, investments: [] };
  }
  const profileIds = await myAuthorizedProfiles(userId);
  if (!profileIds.length) {
    await log(userId, null, "list", "allow", "no_profiles");
    return { mfaRequired: false as const, investments: [] };
  }
  const [{ data: onboardings }, { data: profiles }, { data: docs }, freezes] = await Promise.all([
    db().from("investor_onboardings").select("offering_id, investment_profile_id, offerings(name)").in("investment_profile_id", profileIds),
    db().from("investment_profiles").select("id, legal_name, display_label, profile_type").in("id", profileIds),
    db().from("document_catalog").select("id, file_name, tax_year, document_type, offering_id, recipient_profile_id, status").in("recipient_profile_id", profileIds).eq("status", "published"),
    activeFreezes(),
  ]);
  const ents = await entitlementsFor(((docs ?? []) as any[]).map((d) => d.id));
  const visible = ((docs ?? []) as any[]).filter((d) =>
    decideAccess({ userId, aal2: true, doc: d, entitlements: ents[d.id] ?? [], authorizedProfileIds: profileIds, freezes, intent: "list" }).allow,
  );
  const nameOf = Object.fromEntries(((profiles ?? []) as any[]).map((p) => [p.id, p.legal_name ?? p.display_label]));
  const investments = ((onboardings ?? []) as any[]).map((o) => ({
    offeringId: o.offering_id as string,
    fundName: (o.offerings?.name ?? "Fund") as string,
    profileId: o.investment_profile_id as string,
    profileName: (nameOf[o.investment_profile_id] ?? "Investment profile") as string,
    documents: visible
      .filter((d) => d.offering_id === o.offering_id && d.recipient_profile_id === o.investment_profile_id)
      .map((d) => ({ id: d.id as string, taxYear: d.tax_year as number | null, label: `Schedule K-1 ${d.tax_year ?? ""}`.trim() }))
      .sort((a, b) => (b.taxYear ?? 0) - (a.taxYear ?? 0)),
  }));
  await log(userId, null, "list", "allow", `listed_${visible.length}`);
  return { mfaRequired: false as const, investments };
}

async function docRow(documentId: string) {
  const { data } = await db().from("document_catalog").select("id, source_id, external_file_id, file_name, status, recipient_profile_id, offering_id, tax_year").eq("id", documentId).maybeSingle();
  return data as any;
}

async function decide(userId: string, claims: unknown, documentId: string, intent: "list" | "download", stepUpVerified = false) {
  const doc = await docRow(documentId);
  if (!doc) return { doc: null, decision: { allow: false, reason: "not_found" } };
  const [profileIds, freezes, ents] = await Promise.all([myAuthorizedProfiles(userId), activeFreezes(), entitlementsFor([documentId])]);
  const decision = decideAccess({ userId, aal2: hasAal2(claims as any), doc, entitlements: ents[documentId] ?? [], authorizedProfileIds: profileIds, freezes, intent, stepUpVerified });
  return { doc, decision };
}

/**
 * Records a step-up for one document. The fresh second factor normally comes
 * from a re-verified authenticator (amr in the session); a remembered device
 * token or a single-use emailed code can stand in for the freshness check only.
 * The session itself must still be aal2 (checked inside decide()).
 */
export async function beginTaxStepUp(userId: string, claims: unknown, documentId: string, proof?: StepUpProof) {
  const { decision } = await decide(userId, claims, documentId, "list");
  if (!decision.allow) {
    await log(userId, documentId, "step_up", "deny", decision.reason);
    forbid(DENY_MESSAGES[decision.reason] ?? "Not available.");
  }
  let method = "mfa_reverify";
  let proofUsed: StepUpProofUsed = "fresh";
  if (!freshSecondFactor(claims as any)) {
    const ease = await import("@/lib/mfa-ease.server");
    const trustedOk = proof?.trustedDeviceToken
      ? (await ease.checkTrustedDevice(userId, proof.trustedDeviceToken)).trusted
      : false;
    let emailOk = false;
    if (!trustedOk && proof?.emailCode) {
      try {
        emailOk = (await ease.verifyFallbackCode(userId, proof.emailCode, "tax_document")).ok;
      } catch {
        emailOk = false;
      }
    }
    const picked = pickStepUpMethod({ freshSecondFactor: false, trustedDeviceOk: trustedOk, emailCodeOk: emailOk });
    if (!picked.proofUsed) {
      await log(userId, documentId, "step_up", "deny", "second_factor_not_fresh");
      forbid("Please confirm your two-step code again.");
    }
    method = picked.method;
    proofUsed = picked.proofUsed;
  }
  const { data, error } = await db().from("stepup_authentications").insert({
    user_id: userId, method, action: STEP_UP_ACTION, resource_type: "document_catalog", resource_id: documentId,
    status: "verified", verified_at: nowIso(), expires_at: new Date(Date.now() + STEP_UP_TTL_MS).toISOString(),
  }).select("id").single();
  if (error) throw new Error(error.message);
  await log(userId, documentId, "step_up", "allow", `verified (${proofUsed})`);
  return { stepUpId: data.id as string };
}

/** Single-use: one conditional write claims the step-up, so it cannot be replayed. */
async function consumeStepUp(userId: string, stepUpId: string, documentId: string) {
  const { data } = await db().from("stepup_authentications").update({ consumed_at: nowIso(), status: "consumed" })
    .eq("id", stepUpId).eq("user_id", userId).eq("action", STEP_UP_ACTION).eq("resource_id", documentId)
    .eq("status", "verified").is("consumed_at", null).gt("expires_at", nowIso()).select("id");
  return ((data ?? []) as any[]).length === 1;
}

export async function downloadTaxDocument(userId: string, claims: unknown, documentId: string, stepUpId: string) {
  const pre = await decide(userId, claims, documentId, "list");
  if (!pre.decision.allow) {
    await log(userId, documentId, "download", "deny", pre.decision.reason);
    forbid(DENY_MESSAGES[pre.decision.reason] ?? "Not available.");
  }
  const stepped = await consumeStepUp(userId, stepUpId, documentId);
  const { doc, decision } = await decide(userId, claims, documentId, "download", stepped);
  if (!decision.allow) {
    await log(userId, documentId, "download", "deny", decision.reason);
    forbid(DENY_MESSAGES[decision.reason] ?? "Not available.");
  }
  const { data: source } = await db().from("document_sources").select("*").eq("id", doc.source_id).maybeSingle();
  if (!source || source.status !== "approved") {
    await log(userId, documentId, "download", "deny", "source_not_approved");
    return { ok: false as const, message: "This document is temporarily unavailable. Please try again later." };
  }
  try {
    const file = await providerFor(source).getContent(doc.external_file_id);
    await log(userId, documentId, "download", "allow", decision.reason);
    let bin = "";
    for (const b of file.bytes) bin += String.fromCharCode(b);
    return { ok: true as const, fileName: file.name, mimeType: file.mimeType, base64: btoa(bin) };
  } catch {
    await log(userId, documentId, "download", "deny", "source_unavailable");
    return { ok: false as const, message: "This document is temporarily unavailable. Please try again later." };
  }
}

// ---------------------------------------------------------------- manager --

/** Delivery status per investor and year. File names and contents are never included. */
export async function managerTaxDelivery(userId: string) {
  const { data: managed } = await db().from("fund_managers").select("offering_id, offerings(name)").eq("user_id", userId);
  const offeringIds = ((managed ?? []) as any[]).map((m) => m.offering_id as string);
  if (!offeringIds.length) return { funds: [] };
  const [{ data: onboardings }, { data: docs }] = await Promise.all([
    db().from("investor_onboardings").select("offering_id, investment_profile_id, investment_profiles(legal_name, display_label)").in("offering_id", offeringIds),
    db().from("document_catalog").select("id, offering_id, recipient_profile_id, tax_year, status").in("offering_id", offeringIds),
  ]);
  const ents = await entitlementsFor(((docs ?? []) as any[]).map((d) => d.id));
  const freezes = await activeFreezes();
  const funds = ((managed ?? []) as any[]).map((m) => {
    const fdocs = ((docs ?? []) as any[]).filter((d) => d.offering_id === m.offering_id);
    const years = [...new Set(fdocs.map((d) => d.tax_year).filter(Boolean))].sort((a, b) => b - a) as number[];
    const investors = ((onboardings ?? []) as any[]).filter((o) => o.offering_id === m.offering_id && o.investment_profile_id).map((o) => ({
      profileId: o.investment_profile_id as string,
      name: (o.investment_profiles?.legal_name ?? o.investment_profiles?.display_label ?? "Investor") as string,
      years: Object.fromEntries(years.map((y) => {
        const d = fdocs.find((x) => x.recipient_profile_id === o.investment_profile_id && x.tax_year === y && x.status === "published");
        const canOpen = d ? decideAccess({ userId, aal2: true, doc: d, entitlements: ents[d.id] ?? [], authorizedProfileIds: [], freezes, intent: "list" }).allow : false;
        return [y, { status: d ? "Available" : "Not available", documentId: canOpen ? d.id : null }];
      })),
    }));
    return {
      offeringId: m.offering_id as string,
      fundName: (m.offerings?.name ?? "Fund") as string,
      years,
      investors,
      unresolved: fdocs.filter((d) => d.status === "quarantined" || d.status === "matched").length,
    };
  });
  await log(userId, null, "manager_delivery", "allow", "status_only");
  return { funds };
}

// ------------------------------------------------------------- operations --

export async function opsOverview(userId: string) {
  await assertPortalStaff(userId);
  const [sources, runs, catalog, reviews, freezes, events, ents] = await Promise.all([
    db().from("document_sources").select("*").order("created_at"),
    db().from("connector_sync_runs").select("*").order("started_at", { ascending: false }).limit(30),
    db().from("document_catalog").select("id, source_id, file_name, tax_year, document_type, offering_id, recipient_profile_id, status, status_reason, duplicate_of, last_seen_at, is_test_demo, offerings(name), investment_profiles(legal_name)").order("file_name"),
    db().from("document_match_reviews").select("id, document_id, candidate_profile_id, candidate_offering_id, reason, review_status, reviewed_at, review_note, created_at, investment_profiles(legal_name)").order("created_at", { ascending: false }),
    db().from("document_access_freezes").select("*").order("created_at", { ascending: false }),
    db().from("document_access_events").select("*").order("created_at", { ascending: false }).limit(200),
    db().from("document_entitlements").select("*").order("created_at", { ascending: false }),
  ]);
  const offeringIds = [...new Set(((catalog.data ?? []) as any[]).map((d) => d.offering_id).filter(Boolean))];
  const { data: investors } = offeringIds.length
    ? await db().from("investor_onboardings").select("offering_id, investment_profile_id, investor_user_id, investment_profiles(legal_name, person_id, owner_user_id)").in("offering_id", offeringIds)
    : { data: [] };
  const readiness = ((investors ?? []) as any[]).filter((o) => o.investment_profile_id).map((o) => {
    const docs = ((catalog.data ?? []) as any[]).filter((d) => d.recipient_profile_id === o.investment_profile_id && d.offering_id === o.offering_id);
    return {
      offeringId: o.offering_id, profileId: o.investment_profile_id,
      name: o.investment_profiles?.legal_name ?? "Investor",
      hasLogin: !!(o.investor_user_id || o.investment_profiles?.owner_user_id),
      published: docs.filter((d) => d.status === "published").length,
      pending: docs.filter((d) => d.status === "matched" || d.status === "quarantined").length,
    };
  });
  return {
    sources: sources.data ?? [], runs: runs.data ?? [], catalog: catalog.data ?? [], reviews: reviews.data ?? [],
    freezes: freezes.data ?? [], events: events.data ?? [], entitlements: ents.data ?? [], readiness,
  };
}

export async function approveSource(userId: string, sourceId: string, approve: boolean) {
  await assertPortalStaff(userId);
  const { data: src } = await db().from("document_sources").select("connection_reference, is_test_demo").eq("id", sourceId).maybeSingle();
  if (!src) throw new Error("Source not found.");
  if (approve && !String(src.connection_reference).startsWith("synthetic:")) forbid("Live sources need separate Phase C approval.");
  await db().from("document_sources").update(approve ? { status: "approved", approved_by: userId, approved_at: nowIso() } : { status: "suspended" }).eq("id", sourceId);
  await log(userId, null, approve ? "source_approved" : "source_suspended", "allow", sourceId);
  return { ok: true };
}

export async function discoverFolders(userId: string, sourceId: string, folderId: string | null) {
  await assertPortalStaff(userId);
  const { data: src } = await db().from("document_sources").select("*").eq("id", sourceId).maybeSingle();
  if (!src) throw new Error("Source not found.");
  const target = folderId ?? src.allowed_root_ids?.[0];
  if (!target) return { ok: false as const, message: "No approved root folder for this source." };
  try {
    const items = await providerFor(src).listFolder(target);
    return { ok: true as const, folderId: target, items: items.map((i) => ({ id: i.id, name: i.name, kind: i.kind })) };
  } catch (e) {
    if (e instanceof ProviderNotAuthorizedError) return { ok: false as const, message: e.message };
    return { ok: false as const, message: "The source could not be reached. Nothing was changed." };
  }
}

/** Metadata-only inventory of approved roots, then deterministic matching. Never deletes. */
export async function runSync(userId: string, sourceId: string) {
  await assertPortalStaff(userId);
  const { data: src } = await db().from("document_sources").select("*").eq("id", sourceId).maybeSingle();
  if (!src) throw new Error("Source not found.");
  if (src.status !== "approved") forbid("Approve this source before scanning.");
  const { data: run } = await db().from("connector_sync_runs").insert({ source_id: sourceId, triggered_by: userId }).select("id").single();
  let discovered = 0, updated = 0, missing = 0, errors = 0;
  try {
    const provider = providerFor(src);
    const files: ProviderItem[] = [];
    const queue = [...(src.allowed_root_ids ?? [])];
    const seen = new Set<string>();
    while (queue.length) {
      const folder = queue.shift()!;
      if (seen.has(folder)) continue;
      seen.add(folder);
      for (const item of await provider.listFolder(folder)) {
        if (item.kind === "folder") queue.push(item.id); else files.push(item);
      }
    }
    const { data: existing } = await db().from("document_catalog").select("id, external_file_id, status, checksum").eq("source_id", sourceId);
    const byExt = new Map(((existing ?? []) as any[]).map((r) => [r.external_file_id, r]));
    const mappings = (src.folder_mappings ?? []) as FolderMapping[];
    const offeringIds = [...new Set(mappings.map((m) => m.offering_id))];
    const { data: onb } = offeringIds.length
      ? await db().from("investor_onboardings").select("offering_id, investment_profile_id, investment_profiles(legal_name)").in("offering_id", offeringIds)
      : { data: [] };
    const investorsByOffering: Record<string, string[]> = {};
    const profileNames: Record<string, string> = {};
    for (const o of (onb ?? []) as any[]) {
      if (!o.investment_profile_id) continue;
      (investorsByOffering[o.offering_id] ??= []).push(o.investment_profile_id);
      profileNames[o.investment_profile_id] = o.investment_profiles?.legal_name ?? "";
    }
    const { data: sums } = await db().from("document_catalog").select("id, checksum, source_id, external_file_id").not("checksum", "is", null);
    const knownChecksums: Record<string, string> = {};
    for (const s of (sums ?? []) as any[]) knownChecksums[s.checksum] = s.id;

    for (const f of files) {
      const prior = byExt.get(f.id);
      if (prior) {
        await db().from("document_catalog").update({ last_seen_at: nowIso(), ...(prior.status === "source_missing" ? { status: "quarantined", status_reason: "reappeared_in_source" } : {}) }).eq("id", prior.id);
        updated++;
        continue;
      }
      const ownSums = { ...knownChecksums };
      const m = matchDocument({ id: f.id, name: f.name, parent_folder_id: f.parentId, checksum: f.checksum }, { mappings, investorsByOffering, profileNames, knownChecksums: ownSums });
      const { data: inserted, error } = await db().from("document_catalog").insert({
        source_id: sourceId, external_file_id: f.id, external_revision: f.revision ?? null, parent_folder_id: f.parentId,
        file_name: f.name, mime_type: f.mimeType ?? null, size_bytes: f.size ?? null, checksum: f.checksum ?? null,
        document_type: m.documentType, tax_year: m.taxYear, offering_id: m.offeringId, recipient_profile_id: m.recipientProfileId,
        status: m.status, status_reason: m.reason, duplicate_of: m.duplicateOf, source_modified_at: f.modifiedAt ?? null, is_test_demo: !!src.is_test_demo,
      }).select("id").single();
      if (error) { errors++; continue; }
      discovered++;
      if (f.checksum) knownChecksums[f.checksum] = inserted.id;
      if (m.status === "quarantined") {
        await db().from("document_match_reviews").insert({ document_id: inserted.id, candidate_profile_id: m.candidateProfileId, candidate_offering_id: m.offeringId, reason: m.reason, evidence: { folder: f.parentId, file: f.name, duplicate_of: m.duplicateOf } });
      }
    }
    const present = new Set(files.map((f) => f.id));
    for (const r of (existing ?? []) as any[]) {
      if (!present.has(r.external_file_id) && r.status !== "source_missing") {
        await db().from("document_catalog").update({ status: "source_missing", status_reason: "not_found_in_full_scan" }).eq("id", r.id);
        missing++;
      }
    }
    await db().from("connector_sync_runs").update({ finished_at: nowIso(), status: "succeeded", discovered_count: discovered, updated_count: updated, missing_count: missing, error_count: errors }).eq("id", run.id);
    await db().from("document_sources").update({ last_sync_at: nowIso() }).eq("id", sourceId);
  } catch (e) {
    // A failed scan never marks documents missing or removed.
    await db().from("connector_sync_runs").update({ finished_at: nowIso(), status: "failed", error_detail: e instanceof Error ? e.message.slice(0, 300) : "failed", error_count: errors + 1 }).eq("id", run.id);
  }
  return { discovered, updated, missing, errors };
}

async function grant(userId: string, documentId: string, principal_type: "investment_profile" | "user", principal_id: string, action: "grant" | "revoke", reason: string) {
  const { error } = await db().from("document_entitlements").insert({ document_id: documentId, principal_type, principal_id, action, reason, decided_by: userId });
  if (error) throw new Error(error.message);
  await log(userId, documentId, `entitlement_${action}`, "allow", `${principal_type}:${principal_id}`);
}

/** Publishing a matched document grants its verified recipient profile. */
export async function publishMatched(userId: string, documentIds: string[], reason: string) {
  await assertPortalStaff(userId);
  const { data } = await db().from("document_catalog").select("id, status, recipient_profile_id, offering_id").in("id", documentIds);
  let published = 0;
  for (const d of (data ?? []) as any[]) {
    if (d.status !== "matched" || !d.recipient_profile_id || !d.offering_id) continue;
    await db().from("document_catalog").update({ status: "published", published_at: nowIso(), published_by: userId }).eq("id", d.id);
    await grant(userId, d.id, "investment_profile", d.recipient_profile_id, "grant", reason);
    published++;
  }
  return { published };
}

export async function resolveReview(userId: string, input: { reviewId: string; approve: boolean; profileId?: string | null | undefined; note: string }) {
  await assertPortalStaff(userId);
  const { data: rv } = await db().from("document_match_reviews").select("*").eq("id", input.reviewId).maybeSingle();
  if (!rv || rv.review_status !== "open") throw new Error("This review is already closed.");
  const { data: doc } = await db().from("document_catalog").select("id, offering_id, tax_year, duplicate_of").eq("id", rv.document_id).single();
  if (input.approve) {
    const profileId = input.profileId ?? rv.candidate_profile_id;
    if (!profileId || !doc.offering_id) throw new Error("Choose the verified recipient and fund first.");
    if (!doc.tax_year) throw new Error("This document has no tax year; it cannot be published.");
    if (doc.duplicate_of) throw new Error("Duplicates are never published. Reject this review instead.");
    const { data: inv } = await db().from("investor_onboardings").select("id").eq("offering_id", doc.offering_id).eq("investment_profile_id", profileId).limit(1);
    if (!((inv ?? []) as any[]).length) throw new Error("That investor has no investment in this fund.");
    await db().from("document_catalog").update({ recipient_profile_id: profileId, status: "published", status_reason: "approved_by_review", published_at: nowIso(), published_by: userId }).eq("id", doc.id);
    await grant(userId, doc.id, "investment_profile", profileId, "grant", input.note);
  } else {
    await db().from("document_catalog").update({ status: "withdrawn", status_reason: "rejected_in_review" }).eq("id", doc.id);
  }
  await db().from("document_match_reviews").update({ review_status: input.approve ? "approved" : "rejected", reviewer_id: userId, reviewed_at: nowIso(), review_note: input.note }).eq("id", rv.id);
  return { ok: true };
}

export async function changeEntitlement(userId: string, input: { documentId: string; principalType: "investment_profile" | "user"; principalId: string; action: "grant" | "revoke"; reason: string }) {
  await assertPortalStaff(userId);
  await grant(userId, input.documentId, input.principalType, input.principalId, input.action, input.reason);
  return { ok: true };
}

export async function setFreeze(userId: string, input: { scope: FreezeRow["scope"]; scopeId: string | null; reason: string }) {
  await assertPortalStaff(userId);
  const { error } = await db().from("document_access_freezes").insert({ scope: input.scope, scope_id: input.scope === "all" ? null : input.scopeId, reason: input.reason, created_by: userId });
  if (error) throw new Error(error.message);
  await log(userId, null, "emergency_freeze", "allow", `${input.scope}:${input.scopeId ?? "all"}`);
  return { ok: true };
}

export async function liftFreeze(userId: string, freezeId: string, reason: string) {
  await assertPortalStaff(userId);
  await db().from("document_access_freezes").update({ lifted_by: userId, lifted_at: nowIso(), lift_reason: reason }).eq("id", freezeId).is("lifted_at", null);
  await log(userId, null, "emergency_freeze_lifted", "allow", freezeId);
  return { ok: true };
}
