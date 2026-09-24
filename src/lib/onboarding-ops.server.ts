/**
 * Harmonious Operations: tax review list, compliance policy and legal wording
 * administration. Every entry point re-reads the caller's roles on each
 * request, so a revoked permission stops working on the next call.
 */
import { hasTaxPermission, taxPermissions } from "@/lib/onboarding-intake-model";
import { IRS_FORM_REVISIONS } from "@/lib/onboarding-compliance-model";
import { requireTaxPermission, staffRoles } from "@/lib/onboarding-compliance.server";

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}
function fail(m: string): never {
  throw new Error(m);
}

/** Masked list for tax personnel. Never contains a full TIN. */
export async function staffTaxReviewList(userId: string) {
  const roles = await requireTaxPermission(userId, "view_tax_status");
  const d = await db();
  const [{ data: forms }, { data: facts }] = await Promise.all([
    d.from("investor_tax_forms")
      .select("id, investment_profile_id, form_type, irs_revision, classification, legal_name, tin_last4, status, certified_at, expires_on, document_path")
      .order("certified_at", { ascending: false }).limit(500),
    d.from("investor_tax_facts")
      .select("id, investment_profile_id, routing_status, form_type, review_reason, created_at")
      .is("superseded_by", null).order("created_at", { ascending: false }).limit(500),
  ]);
  const profileIds = [...new Set([...(forms ?? []), ...(facts ?? [])].map((r: any) => r.investment_profile_id).filter(Boolean))];
  const { data: profiles } = profileIds.length
    ? await d.from("investment_profiles").select("id, legal_name, display_label, profile_type").in("id", profileIds)
    : { data: [] };
  const pById = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p]));
  const formsByProfile = new Map<string, any>();
  for (const f of (forms ?? []) as any[]) if (f.status !== "superseded" && !formsByProfile.has(f.investment_profile_id)) formsByProfile.set(f.investment_profile_id, f);
  const rows = profileIds.map((pid) => {
    const p = pById.get(pid);
    const f = formsByProfile.get(pid) ?? null;
    const fact = ((facts ?? []) as any[]).find((x) => x.investment_profile_id === pid) ?? null;
    const requiredForm = fact?.form_type ?? f?.form_type ?? null;
    return {
      profileId: pid,
      profileName: p?.legal_name ?? p?.display_label ?? "—",
      profileType: p?.profile_type ?? null,
      classification: f?.classification ?? null,
      requiredForm: requiredForm ? IRS_FORM_REVISIONS[requiredForm as keyof typeof IRS_FORM_REVISIONS]?.title ?? requiredForm : null,
      formStatus: f ? f.status : fact?.routing_status === "needs_review" ? "needs_review" : "not_started",
      revision: f?.irs_revision ?? null,
      signedAt: f?.certified_at ?? null,
      expiresOn: f?.expires_on ?? null,
      tinMasked: f?.tin_last4 ? `•••••${f.tin_last4}` : null,
      reviewStatus: fact?.routing_status === "needs_review" ? `Needs review: ${fact.review_reason ?? ""}` : fact ? "Determined" : "Not started",
      taxFormId: f?.id ?? null,
      hasDocument: Boolean(f?.document_path),
    };
  });
  return { rows, permissions: taxPermissions(roles) };
}

// ------------------------------------------------------ compliance policy

export async function listCompliancePolicy(userId: string) {
  const roles = await requireTaxPermission(userId, "review_compliance");
  const d = await db();
  const { data } = await d.from("compliance_policy_entries").select("*").order("created_at", { ascending: false }).limit(500);
  return { entries: data ?? [], canApprove: hasTaxPermission(roles, "approve_compliance_exceptions"), me: userId };
}

export async function createPolicyDraft(userId: string, input: {
  kind: "high_risk_jurisdiction" | "edd_amount_threshold";
  countryCode?: string | null | undefined; riskClassification?: string | null | undefined;
  thresholdCents?: number | null | undefined; currency?: string | null | undefined;
  scope: "global" | "fund"; offeringId?: string | null | undefined;
  effectiveDate: string; sourceReference: string; reason?: string | null | undefined;
}) {
  await requireTaxPermission(userId, "review_compliance");
  const d = await db();
  const { error } = await d.from("compliance_policy_entries").insert({
    kind: input.kind,
    country_code: input.countryCode ? input.countryCode.toUpperCase() : null,
    risk_classification: input.riskClassification ?? null,
    threshold_cents: input.thresholdCents ?? null,
    currency: input.currency ? input.currency.toUpperCase() : null,
    scope: input.scope,
    offering_id: input.scope === "fund" ? input.offeringId : null,
    effective_date: input.effectiveDate,
    source_reference: input.sourceReference,
    reason: input.reason ?? null,
    status: "draft",
    created_by: userId,
  });
  if (error) fail(error.message);
  return { ok: true };
}

/** Maker-checker: the approver must hold the approval permission and differ from the author. */
export async function decidePolicyEntry(userId: string, input: { id: string; action: "approve" | "retire" }) {
  await requireTaxPermission(userId, "approve_compliance_exceptions");
  const d = await db();
  const { data: e } = await d.from("compliance_policy_entries").select("*").eq("id", input.id).maybeSingle();
  if (!e) fail("Policy entry not found.");
  if (input.action === "approve") {
    if (e.status !== "draft") fail("Only drafts can be approved.");
    if (e.created_by === userId) fail("A different person must approve this entry.");
    const now = new Date().toISOString();
    const { error } = await d.from("compliance_policy_entries").update({ status: "approved", approved_by: userId, reviewed_by: userId, approved_at: now }).eq("id", e.id);
    if (error) fail(error.message);
    // Supersede prior approved entries for the same subject.
    let q = d.from("compliance_policy_entries").update({ status: "superseded", superseded_by: e.id })
      .eq("kind", e.kind).eq("status", "approved").eq("scope", e.scope).neq("id", e.id);
    q = e.kind === "high_risk_jurisdiction" ? q.eq("country_code", e.country_code) : q;
    q = e.scope === "fund" ? q.eq("offering_id", e.offering_id) : q;
    await q;
  } else {
    if (e.status !== "approved") fail("Only approved entries can be retired.");
    await d.from("compliance_policy_entries").update({ status: "retired" }).eq("id", e.id);
  }
  return { ok: true };
}

// ------------------------------------------------------------ legal wording

const WORDING_AUTHORS = ["super_admin", "legal", "compliance"];
const WORDING_APPROVERS = ["super_admin", "legal"];

export async function listLegalWording(userId: string) {
  const roles = await staffRoles(userId);
  if (!WORDING_AUTHORS.some((r) => roles.includes(r))) fail("Forbidden: legal or compliance access is required.");
  const d = await db();
  const { data } = await d.from("legal_wording_versions").select("*").order("requirement_key").order("version", { ascending: false });
  return { rows: data ?? [], canApprove: WORDING_APPROVERS.some((r) => roles.includes(r)), me: userId };
}

export async function createWordingDraft(userId: string, input: { requirementKey: string; title: string; wording: string; effectiveDate: string }) {
  const roles = await staffRoles(userId);
  if (!WORDING_AUTHORS.some((r) => roles.includes(r))) fail("Forbidden: legal or compliance access is required.");
  const d = await db();
  const { data: last } = await d.from("legal_wording_versions").select("version").eq("requirement_key", input.requirementKey).order("version", { ascending: false }).limit(1);
  const { error } = await d.from("legal_wording_versions").insert({
    requirement_key: input.requirementKey, title: input.title, wording: input.wording,
    version: Number(last?.[0]?.version ?? 0) + 1, effective_date: input.effectiveDate, status: "draft", created_by: userId,
  });
  if (error) fail(error.message);
  return { ok: true };
}

export async function decideWording(userId: string, input: { id: string; action: "approve" | "retire" }) {
  const roles = await staffRoles(userId);
  if (!WORDING_APPROVERS.some((r) => roles.includes(r))) fail("Forbidden: only Legal can approve or retire wording.");
  const d = await db();
  const { data: w } = await d.from("legal_wording_versions").select("*").eq("id", input.id).maybeSingle();
  if (!w) fail("Wording not found.");
  const now = new Date().toISOString();
  if (input.action === "approve") {
    if (w.status !== "draft") fail("Only drafts can be approved.");
    if (w.created_by === userId) fail("A different person must approve this wording.");
    const { error } = await d.from("legal_wording_versions").update({ status: "approved", approved_by: userId, approved_at: now }).eq("id", w.id);
    if (error) fail(error.message);
    // Earlier approved versions retire; records already certified keep their pinned version.
    await d.from("legal_wording_versions").update({ status: "retired", retired_at: now })
      .eq("requirement_key", w.requirement_key).eq("status", "approved").neq("id", w.id);
  } else {
    if (w.status !== "approved") fail("Only approved wording can be retired.");
    await d.from("legal_wording_versions").update({ status: "retired", retired_at: now }).eq("id", w.id);
  }
  return { ok: true };
}
