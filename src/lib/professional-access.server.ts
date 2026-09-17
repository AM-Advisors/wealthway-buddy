/**
 * Phase 3A — read-only delegated access for professionals.
 *
 * Everything a professional can see is assembled here, and every single item is
 * cleared by the centralized `canAct(actor, capability, resource)` decision
 * against the *resolved* resource. Nothing is trusted from the browser: the
 * delegation id is re-read and re-validated on every request, the principal is
 * taken from the stored delegation row, and each resource is looked up and
 * matched to its real owner before it is returned.
 *
 * This layer never mutates client data. It reads, redacts, and audits.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  canAct,
  recordDelegationAudit,
  type ResourceRef,
} from "@/lib/delegated-access.server";
import type { AuthorityLevel, DelegationCapability } from "@/lib/delegation-model";

export { PHASE_3A_CAPABILITIES, SENSITIVE_CAPABILITIES } from "@/lib/professional-model";

const db = () => supabaseAdmin as any;

export interface DelegatedContext {
  delegationId: string;
  actorUserId: string;
  organizationId: string | null;
  organizationName: string | null;
  principalUserId: string;
  principalName: string;
  scopeType: string;
  scopeId: string | null;
  scopeLabel: string;
  authorityLevel: AuthorityLevel;
  capabilities: DelegationCapability[];
  effectiveAt: string | null;
  expiresAt: string | null;
  status: string;
}

function live(row: any, now = new Date()): boolean {
  if (!row) return false;
  if (row.status !== "active") return false;
  if (row.revoked_at) return false;
  if (row.effective_at && new Date(row.effective_at) > now) return false;
  if (row.expires_at && new Date(row.expires_at) <= now) return false;
  return true;
}

async function personName(userId: string): Promise<string> {
  const { data } = await db()
    .from("persons")
    .select("legal_first_name, legal_last_name, preferred_name, email")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) {
    const name = [data.legal_first_name, data.legal_last_name].filter(Boolean).join(" ").trim();
    if (name) return name;
    if (data.preferred_name) return data.preferred_name;
    if (data.email) return data.email;
  }
  const { data: profile } = await db()
    .from("profiles")
    .select("legal_name, email")
    .eq("user_id", userId)
    .maybeSingle();
  return profile?.legal_name || profile?.email || "Client";
}

/**
 * Re-establishes delegated context from the database on every request.
 * A revoked, suspended, expired or not-yet-effective delegation resolves to
 * null here, no matter what the browser still has cached.
 */
export async function loadDelegatedContext(
  actorUserId: string | null | undefined,
  delegationId: string,
): Promise<DelegatedContext | null> {
  if (!actorUserId || !delegationId) return null;

  const { data: row } = await db()
    .from("delegations")
    .select(
      "id, principal_user_id, delegate_user_id, organization_id, scope_type, scope_id, authority_level, status, effective_at, expires_at, revoked_at",
    )
    .eq("id", delegationId)
    .maybeSingle();

  if (!row) return null;
  if (row.delegate_user_id !== actorUserId) return null;
  if (!live(row)) return null;

  if (row.organization_id) {
    const { data: seat } = await db()
      .from("professional_memberships")
      .select("status")
      .eq("organization_id", row.organization_id)
      .eq("user_id", actorUserId)
      .maybeSingle();
    if (!seat || seat.status !== "active") return null;
  }

  const [{ data: perms }, { data: org }] = await Promise.all([
    db().from("delegation_permissions").select("capability").eq("delegation_id", row.id),
    row.organization_id
      ? db().from("professional_organizations").select("name").eq("id", row.organization_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const capabilities = ((perms ?? []) as any[]).map((p) => p.capability as DelegationCapability);
  const scopeLabel = await describeScope(row.scope_type, row.scope_id);

  return {
    delegationId: row.id,
    actorUserId,
    organizationId: row.organization_id,
    organizationName: org?.name ?? null,
    principalUserId: row.principal_user_id,
    principalName: await personName(row.principal_user_id),
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    scopeLabel,
    authorityLevel: row.authority_level,
    capabilities,
    effectiveAt: row.effective_at,
    expiresAt: row.expires_at,
    status: row.status,
  };
}

async function describeScope(scopeType: string, scopeId: string | null): Promise<string> {
  if (scopeType === "person") return "All of this client's data in scope";
  if (!scopeId) return scopeType.replace(/_/g, " ");
  if (scopeType === "investment_profile") {
    const { data } = await db()
      .from("investment_profiles")
      .select("display_label")
      .eq("id", scopeId)
      .maybeSingle();
    return data?.display_label ?? "Investment profile";
  }
  if (scopeType === "fund") {
    const { data } = await db().from("offerings").select("name").eq("id", scopeId).maybeSingle();
    return data?.name ?? "Fund";
  }
  if (scopeType === "investment") {
    const { data } = await db()
      .from("investor_applications")
      .select("id, offerings(name)")
      .eq("id", scopeId)
      .maybeSingle();
    return data?.offerings?.name ? `Investment in ${data.offerings.name}` : "Investment";
  }
  return scopeType.replace(/_/g, " ");
}

/** Every live delegation held by this professional, as a client list. */
export async function listDelegatedClients(actorUserId: string | null | undefined) {
  if (!actorUserId) return [];
  const { data: rows } = await db()
    .from("delegations")
    .select(
      "id, principal_user_id, organization_id, scope_type, scope_id, authority_level, status, effective_at, expires_at, revoked_at, last_used_at",
    )
    .eq("delegate_user_id", actorUserId);

  const out: any[] = [];
  for (const row of (rows ?? []) as any[]) {
    if (!live(row)) continue;
    const ctx = await loadDelegatedContext(actorUserId, row.id);
    if (!ctx) continue;
    out.push({
      delegationId: ctx.delegationId,
      principalName: ctx.principalName,
      organizationName: ctx.organizationName,
      organizationId: ctx.organizationId,
      scopeType: ctx.scopeType,
      scopeLabel: ctx.scopeLabel,
      authorityLevel: ctx.authorityLevel,
      capabilities: ctx.capabilities,
      effectiveAt: ctx.effectiveAt,
      expiresAt: ctx.expiresAt,
      status: ctx.status,
      lastActivityAt: row.last_used_at ?? null,
    });
  }
  return out;
}

async function allowed(
  ctx: DelegatedContext,
  capability: DelegationCapability,
  resource: ResourceRef,
): Promise<boolean> {
  if (!ctx.capabilities.includes(capability)) return false;
  const res = await canAct(ctx.actorUserId, capability, resource, {
    organizationId: ctx.organizationId ?? null,
  });
  return res.allowed && res.delegationId === ctx.delegationId;
}

/** Sensitive sections leave an explicit access record. */
async function recordView(
  ctx: DelegatedContext,
  action: string,
  detail: string,
  capability: DelegationCapability,
) {
  await recordDelegationAudit({
    actorUserId: ctx.actorUserId,
    action,
    organizationId: ctx.organizationId,
    delegationId: ctx.delegationId,
    principalUserId: ctx.principalUserId,
    delegateUserId: ctx.actorUserId,
    scopeType: ctx.scopeType as any,
    scopeId: ctx.scopeId,
    authorityLevel: ctx.authorityLevel,
    capabilities: [capability],
    outcome: "viewed",
    detail,
  });
}

const CHECK_SUMMARY: Record<string, string> = {
  not_started: "Not started",
  pending: "In progress",
  review: "In review",
  approved: "Verified",
  declined: "Needs attention",
};

/**
 * The whole delegated picture for one delegation, section by section.
 * Sections the delegation does not carry simply do not appear.
 */
export async function buildDelegatedClientView(
  actorUserId: string | null | undefined,
  delegationId: string,
) {
  const ctx = await loadDelegatedContext(actorUserId, delegationId);
  if (!ctx) return null;

  const view: any = {
    context: {
      delegationId: ctx.delegationId,
      principalName: ctx.principalName,
      organizationName: ctx.organizationName,
      scopeLabel: ctx.scopeLabel,
      scopeType: ctx.scopeType,
      authorityLevel: ctx.authorityLevel,
      capabilities: ctx.capabilities,
      expiresAt: ctx.expiresAt,
    },
    person: null,
    profiles: [],
    funds: [],
    investments: [],
    documents: [],
    taxDocuments: [],
    statements: [],
    compliance: null,
    banking: [],
    tasks: [],
  };

  // ---- person summary (never raw identity data) -------------------------
  if (await allowed(ctx, "view_profile", { type: "person", id: ctx.principalUserId })) {
    const { data: person } = await db()
      .from("persons")
      .select(
        "legal_first_name, legal_last_name, preferred_name, email, phone, city, region, country, residence_country, citizenship_country, onboarding_state, kyc_status, aml_status",
      )
      .eq("user_id", ctx.principalUserId)
      .maybeSingle();
    if (person) {
      view.person = {
        name: [person.legal_first_name, person.legal_last_name].filter(Boolean).join(" "),
        preferredName: person.preferred_name,
        email: person.email,
        phone: person.phone,
        location: [person.city, person.region, person.country].filter(Boolean).join(", "),
        residence: person.residence_country,
        citizenship: person.citizenship_country,
        onboardingState: person.onboarding_state,
      };
    }
  }

  // ---- investment profiles ---------------------------------------------
  const { data: profileRows } = await db()
    .from("investment_profiles")
    .select("id, display_label, profile_type, status")
    .eq("owner_user_id", ctx.principalUserId);
  for (const p of (profileRows ?? []) as any[]) {
    if (await allowed(ctx, "view_profile", { type: "investment_profile", id: p.id })) {
      view.profiles.push({
        id: p.id,
        label: p.display_label,
        type: p.profile_type,
        status: p.status,
      });
    }
  }

  // ---- investments and their funds --------------------------------------
  const { data: applications } = await db()
    .from("investor_applications")
    .select(
      "id, offering_id, status, commitment_cents, funding_status, kyc_status, aml_status, accreditation_status, submitted_at, offerings(id, name, reg_type)",
    )
    .eq("user_id", ctx.principalUserId);

  const permittedApplicationIds: string[] = [];
  const fundIds = new Set<string>();
  for (const app of (applications ?? []) as any[]) {
    if (!(await allowed(ctx, "view_investments", { type: "investment", id: app.id }))) continue;
    permittedApplicationIds.push(app.id);
    fundIds.add(app.offering_id);
    view.investments.push({
      id: app.id,
      fundId: app.offering_id,
      fundName: app.offerings?.name ?? "Fund",
      status: app.status,
      commitmentCents: app.commitment_cents,
      fundingStatus: app.funding_status,
      submittedAt: app.submitted_at,
    });
    if (!view.funds.some((f: any) => f.id === app.offering_id)) {
      view.funds.push({
        id: app.offering_id,
        name: app.offerings?.name ?? "Fund",
        regType: app.offerings?.reg_type ?? null,
      });
    }
  }

  // ---- documents ---------------------------------------------------------
  if (permittedApplicationIds.length > 0) {
    for (const appId of permittedApplicationIds) {
      if (!(await allowed(ctx, "view_documents", { type: "investment", id: appId }))) continue;
      const { data: docs } = await db()
        .from("investor_documents")
        .select("id, doc_kind, file_name, review_status, uploaded_at, application_id")
        .eq("application_id", appId);
      for (const d of (docs ?? []) as any[]) {
        view.documents.push({
          id: d.id,
          kind: d.doc_kind,
          name: d.file_name,
          status: d.review_status,
          uploadedAt: d.uploaded_at,
          investmentId: d.application_id,
        });
      }
    }

    // ---- financial statements -------------------------------------------
    for (const appId of permittedApplicationIds) {
      if (!(await allowed(ctx, "view_financial_statements", { type: "investment", id: appId })))
        continue;
      const { data: rows } = await db()
        .from("capital_account_statements")
        .select("id, statement_date, period_end, version, superseded, application_id")
        .eq("application_id", appId)
        .eq("superseded", false);
      for (const s of (rows ?? []) as any[]) {
        view.statements.push({
          id: s.id,
          date: s.statement_date,
          periodEnd: s.period_end,
          version: s.version,
          investmentId: s.application_id,
        });
      }
    }
  }

  // ---- tax documents (explicit capability + explicit access record) -----
  if (ctx.capabilities.includes("view_tax_documents")) {
    for (const fundId of fundIds) {
      if (!(await allowed(ctx, "view_tax_documents", { type: "fund", id: fundId }))) continue;
      const { data: rows } = await db()
        .from("fund_tax_documents")
        .select("id, doc_type, file_name, tax_year, review_status, offering_id")
        .eq("offering_id", fundId)
        .eq("investor_user_id", ctx.principalUserId);
      for (const t of (rows ?? []) as any[]) {
        view.taxDocuments.push({
          id: t.id,
          type: t.doc_type,
          name: t.file_name,
          year: t.tax_year,
          status: t.review_status,
          fundId: t.offering_id,
        });
      }
    }
    if (view.taxDocuments.length > 0) {
      await recordView(ctx, "delegated_tax_view", "Tax documents viewed", "view_tax_documents");
    }
  }

  // ---- compliance status (summary only, never provider payloads) --------
  if (await allowed(ctx, "view_compliance_status", { type: "person", id: ctx.principalUserId })) {
    const { data: person } = await db()
      .from("persons")
      .select("kyc_status, aml_status, onboarding_state, identity_verified_at, aml_screened_at")
      .eq("user_id", ctx.principalUserId)
      .maybeSingle();
    const { data: accreditations } = await db()
      .from("profile_accreditations")
      .select("status, basis, expires_at, profile_id")
      .in(
        "profile_id",
        view.profiles.length > 0 ? view.profiles.map((p: any) => p.id) : ["00000000-0000-0000-0000-000000000000"],
      );
    view.compliance = {
      identity: CHECK_SUMMARY[person?.kyc_status ?? "not_started"] ?? "Not started",
      screening: CHECK_SUMMARY[person?.aml_status ?? "not_started"] ?? "Not started",
      onboardingState: person?.onboarding_state ?? null,
      identityVerifiedAt: person?.identity_verified_at ?? null,
      accreditations: ((accreditations ?? []) as any[]).map((a) => ({
        profileId: a.profile_id,
        status: CHECK_SUMMARY[a.status] ?? a.status,
        basis: a.basis,
        expiresAt: a.expires_at,
      })),
    };
    await recordView(
      ctx,
      "delegated_compliance_view",
      "Compliance status viewed",
      "view_compliance_status",
    );
  }

  // ---- banking (masked, opt-in only, explicit access record) ------------
  if (ctx.capabilities.includes("view_banking_info")) {
    for (const fundId of fundIds) {
      if (!(await allowed(ctx, "view_banking_info", { type: "fund", id: fundId }))) continue;
      const { data: rows } = await db()
        .from("bank_accounts")
        .select("id, institution_name, account_name, account_mask, status, offering_id")
        .eq("offering_id", fundId);
      for (const b of (rows ?? []) as any[]) {
        view.banking.push({
          id: b.id,
          institution: b.institution_name,
          label: b.account_name,
          // Only ever the last four digits: numbers never leave the server.
          endingIn: b.account_mask ? String(b.account_mask).slice(-4) : null,
          status: b.status,
          fundId: b.offering_id,
        });
      }
    }
    if (view.banking.length > 0) {
      await recordView(ctx, "delegated_banking_view", "Banking summary viewed", "view_banking_info");
    }
  }

  // ---- tasks: outstanding items the professional can see ----------------
  for (const app of view.investments) {
    if (app.fundingStatus && app.fundingStatus !== "settled") {
      view.tasks.push({ label: `Funding outstanding — ${app.fundName}`, investmentId: app.id });
    }
  }
  if (view.compliance && view.compliance.identity !== "Verified") {
    view.tasks.push({ label: "Identity verification outstanding", investmentId: null });
  }

  await db()
    .from("delegations")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", ctx.delegationId);

  return view;
}

/** Audit history for one delegation, visible to its delegate and principal. */
export async function delegationActivity(
  actorUserId: string | null | undefined,
  delegationId: string,
) {
  if (!actorUserId) return [];
  const { data: row } = await db()
    .from("delegations")
    .select("id, principal_user_id, delegate_user_id")
    .eq("id", delegationId)
    .maybeSingle();
  if (!row) return [];
  if (row.principal_user_id !== actorUserId && row.delegate_user_id !== actorUserId) return [];

  const { data } = await db()
    .from("delegation_audit_events")
    .select("action, outcome, detail, created_at, capabilities")
    .eq("delegation_id", delegationId)
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}
