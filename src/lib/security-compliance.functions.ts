import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { authorize } from "@/lib/authorize";
import { ATOMIC_PERMISSIONS } from "@/lib/atomic-permissions";
import {
  acceptanceProblem, ASSURANCE_STATUSES, assuranceProblem, evidenceCurrent, frameworkReadiness, LIFECYCLE, lifecycleProblem,
  policyCoverage, policyEditProblem, policyTransitionProblem, POLICY_STATUSES, publicationProblem, PUBLICATION_STATES,
  riskBand, riskScore, scCapabilities, SCOPE_ITEM_TYPES, TREATMENTS, type Lifecycle, type PolicyStatus, type PublicationState, type ScCapability,
} from "@/lib/security-compliance-model";

/**
 * Internal Security & Compliance Center. Every call re-derives the caller's
 * capabilities on the server; every write is recorded in compliance_audit_log.
 * Nothing here publishes externally or sets certification on its own.
 */

const ADMIN_PERMS = ATOMIC_PERMISSIONS.filter((a) => a.area === "administration").map((a) => a.key);

async function ctxFor(context: any) {
  const { loadBundle, authzFactsFor } = await import("@/lib/access-control.server");
  const b = await loadBundle();
  const userId = context.userId as string;
  const facts = authzFactsFor(b, userId);
  const perms = ADMIN_PERMS.filter((p) => authorize(facts, p, { type: "global", id: null }).allowed);
  const roles = b.roles.filter((r: any) => r.user_id === userId).map((r: any) => String(r.role));
  const caps = scCapabilities(roles, perms);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { b, userId, caps, db: supabaseAdmin as any };
}
type Ctx = Awaited<ReturnType<typeof ctxFor>>;
function need(c: Ctx, cap: ScCapability) {
  if (!c.caps.includes(cap)) throw new Error("Forbidden: you don't have permission for this Security & Compliance action.");
}
async function log(c: Ctx, action: string, recordType: string, recordId: string, before: unknown, after: unknown, reason = "") {
  await c.db.from("compliance_audit_log").insert({ actor: c.userId, action, record_type: recordType, record_id: recordId, before: before ?? null, after: after ?? null, reason });
}
function ok<T>(r: { data: T; error: any }): T {
  if (r.error) throw new Error(r.error.message?.includes("append-only") ? "This record is append-only." : r.error.message ?? "Could not save.");
  return r.data;
}
const all = async (db: any, t: string, order = "created_at") => ((await db.from(t).select("*").order(order, { ascending: true }).limit(5000)).data ?? []) as any[];
const latestBy = <T extends Record<string, any>>(rows: T[], key: string): T[] => {
  const m = new Map<string, T>();
  for (const r of rows) m.set(r[key], r); // rows ordered ascending → last wins
  return [...m.values()];
};
const today = () => new Date().toISOString().slice(0, 10);
async function selfOk(userId: string, action: string, ids: string[]) {
  const { selfApprove } = await import("@/lib/self-approval.server");
  return selfApprove(userId, action, ids);
}

// ================================================================ read

export const getSecurityCompliance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await ctxFor(context);
    need(c, "security_compliance_view");
    const canEv = c.caps.includes("evidence_view");
    const [controls, details, reqs, mappings, frameworks, scopes, scopeItems, evidence, evReviews, evDetails, risks, policies, acks, audits, pubs, pubEvents, docReqs, records, reviews, log_] = await Promise.all([
      all(c.db, "compliance_controls"), all(c.db, "compliance_control_details"), all(c.db, "compliance_requirements"), all(c.db, "compliance_control_mappings"),
      all(c.db, "compliance_frameworks", "sort"), all(c.db, "compliance_scopes"), all(c.db, "compliance_scope_items"),
      canEv ? all(c.db, "compliance_evidence") : Promise.resolve([]), canEv ? all(c.db, "compliance_evidence_reviews") : Promise.resolve([]),
      canEv ? all(c.db, "compliance_evidence_details") : Promise.resolve([]),
      all(c.db, "compliance_risk_assessments"), all(c.db, "compliance_policy_versions"), all(c.db, "compliance_policy_acknowledgments"),
      all(c.db, "compliance_audits"), all(c.db, "trust_publications", "sort"), all(c.db, "trust_publication_events"),
      c.caps.includes("security_compliance_manage") ? all(c.db, "trust_document_requests") : Promise.resolve([]),
      all(c.db, "compliance_records"), all(c.db, "compliance_access_reviews"),
      c.caps.includes("security_compliance_manage") ? (c.db.from("compliance_audit_log").select("*").order("created_at", { ascending: false }).limit(200).then((r: any) => r.data ?? [])) : Promise.resolve([]),
    ]);
    const t = today();
    const names = new Map<string, string>(c.b.users.map((u: any) => [u.id, u.email ?? u.id]));
    const who = (id: string | null | undefined) => (id ? names.get(id) ?? "Unknown" : null);

    const evLatestDetails = latestBy(evDetails, "evidence_id");
    const evRows = evidence.map((e) => {
      const d = evLatestDetails.find((x) => x.evidence_id === e.id) ?? null;
      const accepted = evReviews.some((r) => r.evidence_id === e.id && r.decision === "accepted");
      const superseded = evidence.some((o) => o.supersedes_id === e.id);
      const controlKeys = [...new Set([e.control_key, ...(d?.control_keys ?? [])])];
      return {
        id: e.id, title: e.artifact_reference || e.evidence_type, type: e.evidence_type, source: e.source, collected_at: e.collected_at,
        collected_by: who(e.collected_by), period_start: e.period_start, period_end: e.period_end, has_file: Boolean(e.file_path),
        accepted, superseded, controlKeys, details: d, current: evidenceCurrent({ reviewedAccepted: accepted, expiresOn: d?.expires_on ?? null, superseded }, t),
      };
    });

    const baseLatest = latestBy(controls, "control_key");
    const detLatest = latestBy(details, "control_key");
    const controlRows = baseLatest.map((b) => {
      const d = detLatest.find((x) => x.control_key === b.control_key) ?? null;
      const ev = evRows.filter((e) => e.controlKeys.includes(b.control_key));
      return {
        control_key: b.control_key, canonical_id: d?.canonical_id ?? b.control_key, domain: d?.domain ?? "GRC", name: b.name, objective: b.objective,
        description: b.description, owner: b.owner_label, control_type: b.control_type, frequency: b.frequency, evidence_requirements: b.evidence_requirements,
        details: d, lifecycle: (d?.lifecycle_status ?? "not_assessed") as Lifecycle,
        evidence: ev.map((e) => ({ id: e.id, title: e.title, current: e.current })),
        mappings: mappings.filter((m) => m.control_key === b.control_key).map((m) => reqs.find((r) => r.id === m.requirement_id)).filter(Boolean).map((r: any) => `${r.framework}: ${r.code}`),
        risks: [] as string[], policies: [] as string[],
        history: details.filter((x) => x.control_key === b.control_key).map((x) => ({ version: x.version, status: x.lifecycle_status, reason: x.change_reason, by: who(x.created_by), at: x.created_at })),
      };
    }).sort((a, b) => a.canonical_id.localeCompare(b.canonical_id));

    const riskLatest = latestBy(risks, "risk_ref").map((r) => ({
      ...r, inherent: riskScore(r.inherent_likelihood, r.inherent_impact), residual: riskScore(r.residual_likelihood, r.residual_impact),
      band: riskBand(riskScore(r.residual_likelihood, r.residual_impact) ?? riskScore(r.inherent_likelihood, r.inherent_impact)),
      accepted_by_label: who(r.accepted_by), history: risks.filter((x) => x.risk_ref === r.risk_ref).map((x) => ({ version: x.version, status: x.status, reason: x.change_reason, by: who(x.created_by), at: x.created_at })),
    }));
    const policyLatest = latestBy(policies, "policy_ref").map((p) => ({
      ...p, approved_by_label: who(p.approved_by), acks: acks.filter((a) => a.policy_ref === p.policy_ref && a.version === p.version).length,
      history: policies.filter((x) => x.policy_ref === p.policy_ref).map((x) => ({ version: x.version, status: x.status, reason: x.change_reason, by: who(x.created_by), at: x.created_at })),
    }));
    for (const cr of controlRows) {
      cr.risks = riskLatest.filter((r) => (r.control_keys ?? []).includes(cr.control_key)).map((r) => r.risk_ref);
      cr.policies = policyLatest.filter((p) => (p.control_keys ?? []).includes(cr.control_key)).map((p) => p.policy_ref);
    }

    const effective = new Set(controlRows.filter((x) => ["operating_effectively", "auditor_verified"].includes(x.lifecycle)).map((x) => x.control_key));
    const frameworkRows = frameworks.map((f) => {
      const fr = reqs.filter((r) => r.framework === f.requirement_framework);
      return { ...f, scope_name: scopes.find((s) => s.id === f.scope_id)?.name ?? null, ...frameworkReadiness(fr, mappings, effective),
        requirements: fr.map((r) => ({ id: r.id, code: r.code, title: r.title, controls: mappings.filter((m) => m.requirement_id === r.id).map((m) => controlRows.find((x) => x.control_key === m.control_key)?.canonical_id ?? m.control_key) })),
        audits: audits.filter((a) => a.framework_key === f.key).length };
    });

    const latestRecords = latestBy(records.map((r) => ({ ...r, k: `${r.kind}:${r.record_ref}` })), "k");
    const open = (kind: string, closed: string[]) => latestRecords.filter((r) => r.kind === kind && !closed.includes(r.status)).length;
    const due = (d: string | null | undefined) => Boolean(d && d <= new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10));
    const domains = [...new Set(controlRows.map((x) => x.domain))].sort().map((d) => {
      const cs = controlRows.filter((x) => x.domain === d);
      return { domain: d, total: cs.length, effective: cs.filter((x) => effective.has(x.control_key)).length };
    });
    const overview = {
      controlsEffective: effective.size, controlsTotal: controlRows.length,
      evidenceCurrent: evRows.filter((e) => e.current).length, evidenceTotal: evRows.length,
      openHighRisks: riskLatest.filter((r) => r.status !== "closed" && ["high", "critical"].includes(r.band)).length,
      openFindings: open("exception", ["closed"]),
      policiesDue: policyLatest.filter((p) => !["superseded", "retired"].includes(p.status) && due(p.next_review)).length,
      vendorReviewsDue: latestRecords.filter((r) => r.kind === "vendor" && due(r.data?.next_review)).length,
      accessReviewsDue: reviews.filter((r) => r.status !== "completed" && due(r.due_date ?? r.period_end)).length,
      openIncidents: open("incident", ["closed"]),
      auditReadiness: frameworkRows.length ? Math.round(frameworkRows.reduce((s, f) => s + f.readiness, 0) / frameworkRows.length) : 0,
      domains, frameworks: frameworkRows.map((f) => ({ name: f.name, readiness: f.readiness, gaps: f.gaps })),
      matrix: riskLatest.filter((r) => r.status !== "closed").map((r) => ({ ref: r.risk_ref, il: r.inherent_likelihood, ii: r.inherent_impact, rl: r.residual_likelihood, ri: r.residual_impact })),
    };

    return {
      caps: c.caps, me: c.userId, overview, frameworks: frameworkRows, controls: controlRows, evidence: evRows, risks: riskLatest,
      policies: policyLatest, coverage: policyCoverage(policyLatest.filter((p) => !["superseded", "retired"].includes(p.status))),
      audits: audits.map((a) => ({ ...a, recorded_by_label: who(a.result_recorded_by) })),
      scopes: scopes.map((s) => ({ ...s, items: scopeItems.filter((i) => i.scope_id === s.id) })),
      publications: pubs.map((p) => ({ ...p, approved_by_label: who(p.approved_by), events: pubEvents.filter((e) => e.publication_id === p.id).map((e) => ({ ...e, actor_label: who(e.actor) })) })),
      documentRequests: docReqs,
      registers: latestRecords.map((r) => ({ kind: r.kind, ref: r.record_ref, title: r.title, status: r.status })),
      auditLog: log_.map((l: any) => ({ ...l, actor_label: who(l.actor) })),
    };
  });

// ================================================================ controls

export const saveControlDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    control_key: z.string().min(1).max(20),
    domain: z.string().min(2).max(10),
    executive_owner: z.string().max(120),
    nature: z.enum(["preventive", "detective", "corrective"]).nullable(),
    automation: z.enum(["manual", "automated", "hybrid"]).nullable(),
    systems_in_scope: z.array(z.string().max(80)).max(30),
    data_classifications: z.array(z.string().max(60)).max(10),
    lifecycle_status: z.enum(LIFECYCLE),
    audit_id: z.string().uuid().nullable(),
    last_tested: z.string().date().nullable(),
    next_test: z.string().date().nullable(),
    auditor_notes: z.string().max(4000),
    internal_notes: z.string().max(4000),
    change_reason: z.string().trim().min(5).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "security_compliance_manage");
    const prev = (await c.db.from("compliance_control_details").select("*").eq("control_key", data.control_key).order("version", { ascending: false }).limit(1)).data?.[0] ?? null;
    if (!prev) throw new Error("Control not found.");
    if (prev.lifecycle_status !== data.lifecycle_status) {
      const [ev, rev, det] = await Promise.all([
        c.db.from("compliance_evidence").select("id, supersedes_id, control_key"),
        c.db.from("compliance_evidence_reviews").select("evidence_id, decision"),
        c.db.from("compliance_evidence_details").select("evidence_id, expires_on, control_keys, created_at").order("created_at"),
      ]);
      const evs = (ev.data ?? []) as any[];
      const dets = latestBy((det.data ?? []) as any[], "evidence_id");
      const linked = evs.filter((e) => e.control_key === data.control_key || dets.find((d) => d.evidence_id === e.id)?.control_keys?.includes(data.control_key));
      const facts = linked.map((e) => ({ reviewedAccepted: (rev.data ?? []).some((r: any) => r.evidence_id === e.id && r.decision === "accepted"), expiresOn: dets.find((d) => d.evidence_id === e.id)?.expires_on ?? null, superseded: evs.some((o) => o.supersedes_id === e.id) }));
      let auditVerified = false;
      if (data.audit_id) {
        const a = (await c.db.from("compliance_audits").select("result, report_evidence_id").eq("id", data.audit_id).maybeSingle()).data;
        auditVerified = Boolean(a && a.report_evidence_id && ["report_issued", "certified", "qualified"].includes(a.result));
      }
      const p = lifecycleProblem(data.lifecycle_status, { evidence: facts, today: today(), auditVerified });
      if (p) throw new Error(p);
    }
    const row = { ...data, canonical_id: prev.canonical_id, version: prev.version + 1, created_by: c.userId };
    ok(await c.db.from("compliance_control_details").insert(row));
    await log(c, "control.update", "control", prev.canonical_id, prev, row, data.change_reason);
    return { ok: true };
  });

// ================================================================ frameworks & scope

export const saveFramework = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    key: z.string().min(2).max(40), applicability: z.string().max(2000), scope_id: z.string().uuid().nullable(),
    program_status: z.enum(["not_started", "planned", "in_progress", "active", "paused"]),
    assessment_start: z.string().date().nullable(), assessment_end: z.string().date().nullable(), assessor: z.string().max(200), notes: z.string().max(4000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "security_compliance_manage");
    const before = (await c.db.from("compliance_frameworks").select("*").eq("key", data.key).single()).data;
    const { key, ...rest } = data;
    ok(await c.db.from("compliance_frameworks").update({ ...rest, updated_at: new Date().toISOString() }).eq("key", key));
    await log(c, "framework.update", "framework", key, before, rest);
    return { ok: true };
  });

export const saveScopeItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().optional(), scope_id: z.string().uuid(), item_type: z.enum(SCOPE_ITEM_TYPES),
    name: z.string().trim().min(1).max(160), notes: z.string().max(1000), in_scope: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "security_compliance_manage");
    if (data.id) {
      const before = (await c.db.from("compliance_scope_items").select("*").eq("id", data.id).single()).data;
      ok(await c.db.from("compliance_scope_items").update({ name: data.name, notes: data.notes, in_scope: data.in_scope, item_type: data.item_type, updated_at: new Date().toISOString() }).eq("id", data.id));
      await log(c, "scope_item.update", "scope_item", data.id, before, data);
    } else {
      const row = ok(await c.db.from("compliance_scope_items").insert({ ...data, created_by: c.userId }).select("id").single()) as any;
      await log(c, "scope_item.create", "scope_item", row.id, null, data);
    }
    return { ok: true };
  });

// ================================================================ evidence

export const saveEvidenceDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    evidence_id: z.string().uuid(), expires_on: z.string().date().nullable(), sensitivity: z.enum(["internal", "restricted", "highly_restricted"]),
    systems: z.array(z.string().max(80)).max(30), collection_method: z.enum(["manual", "automated", "system_generated"]),
    control_keys: z.array(z.string().max(20)).max(50), requirement_ids: z.array(z.string().uuid()).max(100), file_sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "evidence_manage");
    const ev = (await c.db.from("compliance_evidence").select("id").eq("id", data.evidence_id).maybeSingle()).data;
    if (!ev) throw new Error("Evidence not found.");
    ok(await c.db.from("compliance_evidence_details").insert({ ...data, created_by: c.userId }));
    await log(c, "evidence.details", "evidence", data.evidence_id, null, data);
    return { ok: true };
  });

export const logEvidenceView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ evidence_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "evidence_view");
    await c.db.from("compliance_evidence_access_log").insert({ evidence_id: data.evidence_id, user_id: c.userId, action: "view" });
    return { ok: true };
  });

// ================================================================ risks

const riskFields = z.object({
  risk_ref: z.string().max(20).optional(),
  title: z.string().trim().min(3).max(200), description: z.string().max(4000), category: z.string().max(80),
  affected_systems: z.string().max(1000), affected_data: z.string().max(1000), threat: z.string().max(2000), vulnerability: z.string().max(2000),
  inherent_likelihood: z.number().int().min(1).max(5), inherent_impact: z.number().int().min(1).max(5),
  residual_likelihood: z.number().int().min(1).max(5).nullable(), residual_impact: z.number().int().min(1).max(5).nullable(),
  treatment: z.enum(TREATMENTS).nullable(), owner: z.string().max(120), target_date: z.string().date().nullable(), review_date: z.string().date().nullable(),
  status: z.enum(["open", "treating", "closed"]), control_keys: z.array(z.string().max(20)).max(50), change_reason: z.string().trim().min(5).max(500),
});

export const saveRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => riskFields.parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "risk_manage");
    if ((data.residual_likelihood == null) !== (data.residual_impact == null)) throw new Error("Assess both residual likelihood and impact, or neither.");
    let prev: any = null, ref = data.risk_ref;
    if (ref) prev = (await c.db.from("compliance_risk_assessments").select("*").eq("risk_ref", ref).order("version", { ascending: false }).limit(1)).data?.[0] ?? null;
    if (ref && !prev) throw new Error("Risk not found.");
    if (!ref) {
      const { count } = await c.db.from("compliance_risk_assessments").select("risk_ref", { count: "exact", head: true }).eq("version", 1);
      ref = `RSK-${String((count ?? 0) + 1).padStart(3, "0")}`;
    }
    const residualChanged = !prev || prev.residual_likelihood !== data.residual_likelihood || prev.residual_impact !== data.residual_impact;
    const { risk_ref: _r, ...fields } = data;
    const row = {
      ...fields, risk_ref: ref, version: (prev?.version ?? 0) + 1, created_by: c.userId,
      residual_assessed_by: residualChanged ? (data.residual_likelihood ? c.userId : null) : prev.residual_assessed_by,
      // Saving a risk never carries over or grants an acceptance.
      status: prev?.status === "accepted" && data.status !== "closed" ? "accepted" : data.status,
      accepted_by: prev?.status === "accepted" ? prev.accepted_by : null, acceptance_reason: prev?.status === "accepted" ? prev.acceptance_reason : null,
      acceptance_expires: prev?.status === "accepted" ? prev.acceptance_expires : null,
    };
    ok(await c.db.from("compliance_risk_assessments").insert(row));
    await log(c, prev ? "risk.update" : "risk.create", "risk", ref!, prev, row, data.change_reason);
    return { ok: true, risk_ref: ref };
  });

export const decideRiskAcceptance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ risk_ref: z.string().max(20), action: z.enum(["request", "approve", "reject"]), reason: z.string().max(1000), expires: z.string().date().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "risk_manage");
    const prev = (await c.db.from("compliance_risk_assessments").select("*").eq("risk_ref", data.risk_ref).order("version", { ascending: false }).limit(1)).data?.[0];
    if (!prev) throw new Error("Risk not found.");
    const { id: _id, created_at: _c, ...base } = prev;
    let row: any;
    if (data.action === "request") {
      if (prev.treatment !== "accept") throw new Error("Set the treatment to Accept before requesting acceptance.");
      if (prev.residual_likelihood == null) throw new Error("Assess residual risk before requesting acceptance.");
      row = { ...base, status: "acceptance_requested", acceptance_requested_by: c.userId, acceptance_reason: data.reason, acceptance_expires: data.expires, change_reason: `Acceptance requested: ${data.reason}` };
    } else {
      if (prev.status !== "acceptance_requested") throw new Error("No acceptance request is pending.");
      if (data.action === "approve") {
        const selfApproved = prev.acceptance_requested_by === c.userId ? await selfOk(c.userId, "risk_acceptance", [prev.id]) : false;
        const p = acceptanceProblem({ requestedBy: prev.acceptance_requested_by, approver: c.userId, selfApproved, reason: data.reason, expires: data.expires, today: today() });
        if (p) throw new Error(p);
        row = { ...base, status: "accepted", accepted_by: c.userId, acceptance_reason: data.reason, acceptance_expires: data.expires, change_reason: `Acceptance approved${selfApproved ? " (Super Admin self-approval)" : ""}: ${data.reason}` };
      } else {
        row = { ...base, status: "open", accepted_by: null, acceptance_expires: null, change_reason: `Acceptance rejected: ${data.reason}` };
      }
    }
    row.version = prev.version + 1;
    row.created_by = c.userId;
    ok(await c.db.from("compliance_risk_assessments").insert(row));
    await log(c, `risk.acceptance.${data.action}`, "risk", data.risk_ref, { status: prev.status }, { status: row.status, expires: row.acceptance_expires }, data.reason);
    return { ok: true };
  });

// ================================================================ policies

export const savePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    policy_ref: z.string().max(20).optional(), title: z.string().trim().min(3).max(200), category: z.string().min(2).max(80), owner: z.string().max(120),
    body: z.string().max(100_000), next_review: z.string().date().nullable(), control_keys: z.array(z.string().max(20)).max(50),
    requires_acknowledgment: z.boolean(), change_reason: z.string().trim().min(5).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "security_compliance_manage");
    let prev: any = null, ref = data.policy_ref;
    if (ref) prev = (await c.db.from("compliance_policy_versions").select("*").eq("policy_ref", ref).order("created_at", { ascending: false }).limit(1)).data?.[0] ?? null;
    if (ref && !prev) throw new Error("Policy not found.");
    if (!ref) {
      const refs = new Set(((await c.db.from("compliance_policy_versions").select("policy_ref")).data ?? []).map((r: any) => r.policy_ref));
      let n = refs.size + 1;
      while (refs.has(`POL-${String(n).padStart(3, "0")}`)) n++;
      ref = `POL-${String(n).padStart(3, "0")}`;
    }
    // Locked versions are never edited: a change starts the next version as Draft.
    const locked = prev ? policyEditProblem(prev.status as PolicyStatus) : null;
    const version = !prev ? 1 : locked ? prev.version + 1 : prev.version;
    const row = { ...data, policy_ref: ref, version, status: "draft", effective_date: null, approved_by: null, created_by: c.userId };
    ok(await c.db.from("compliance_policy_versions").insert(row));
    await log(c, prev ? "policy.edit" : "policy.create", "policy", ref!, prev ? { version: prev.version, status: prev.status } : null, { version, status: "draft" }, data.change_reason);
    return { ok: true, policy_ref: ref };
  });

export const transitionPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ policy_ref: z.string().max(20), to: z.enum(POLICY_STATUSES), reason: z.string().trim().min(5).max(500), effective_date: z.string().date().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "security_compliance_manage");
    const rows = ((await c.db.from("compliance_policy_versions").select("*").eq("policy_ref", data.policy_ref).order("created_at", { ascending: true })).data ?? []) as any[];
    const prev = rows.at(-1);
    if (!prev) throw new Error("Policy not found.");
    const p = policyTransitionProblem(prev.status, data.to);
    if (p) throw new Error(p);
    let approved_by = prev.approved_by;
    if (data.to === "approved") {
      const authors = new Set(rows.filter((r) => r.version === prev.version).map((r) => r.created_by));
      if (authors.has(c.userId) && !(await selfOk(c.userId, "policy_approval", [prev.id]))) throw new Error("A different person must approve a policy they didn't write.");
      if (!prev.body?.trim()) throw new Error("A policy needs written text before it can be approved.");
      approved_by = c.userId;
    }
    if (data.to === "effective" && !data.effective_date) throw new Error("Set an effective date.");
    const { id: _i, created_at: _c, ...base } = prev;
    const row = { ...base, status: data.to, approved_by, effective_date: data.to === "effective" ? data.effective_date : prev.effective_date, change_reason: data.reason, created_by: c.userId };
    ok(await c.db.from("compliance_policy_versions").insert(row));
    // A newly effective version supersedes the previous effective version.
    if (data.to === "effective") {
      const older = latestBy(rows.filter((r) => r.version < prev.version), "version").filter((r) => r.status === "effective");
      for (const o of older) {
        const { id: _x, created_at: _y, ...ob } = o;
        await c.db.from("compliance_policy_versions").insert({ ...ob, status: "superseded", change_reason: `Superseded by version ${prev.version}`, created_by: c.userId });
      }
    }
    await log(c, `policy.${data.to}`, "policy", data.policy_ref, { status: prev.status, version: prev.version }, { status: data.to, version: prev.version }, data.reason);
    return { ok: true };
  });

// ================================================================ audits

export const saveAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().optional(), framework_key: z.string().max(40),
    audit_type: z.enum(["readiness", "soc2_type1", "soc2_type2", "iso_certification", "csa_assessment", "internal", "penetration_test", "other"]),
    scope_id: z.string().uuid().nullable(), period_start: z.string().date().nullable(), period_end: z.string().date().nullable(), assessor: z.string().max(200),
    status: z.enum(["planned", "in_progress", "fieldwork", "completed", "closed"]),
    result: z.enum(["none", "report_issued", "certified", "qualified", "failed"]), report_evidence_id: z.string().uuid().nullable(), notes: z.string().max(4000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "audit_manage");
    if (!data.scope_id) throw new Error("An assessment must reference a defined compliance scope.");
    if (["report_issued", "certified", "qualified"].includes(data.result) && !data.report_evidence_id) throw new Error("Attach the external report or certificate as evidence before recording this result.");
    const before = data.id ? (await c.db.from("compliance_audits").select("*").eq("id", data.id).single()).data : null;
    const resultChanged = !before || before.result !== data.result;
    const { id, ...fields } = data;
    const row = { ...fields, ...(resultChanged && data.result !== "none" ? { result_recorded_by: c.userId, result_recorded_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString() };
    let auditId = id;
    if (id) ok(await c.db.from("compliance_audits").update(row).eq("id", id));
    else auditId = (ok(await c.db.from("compliance_audits").insert({ ...row, created_by: c.userId }).select("id").single()) as any).id;
    await log(c, resultChanged && data.result !== "none" ? "audit.result_recorded" : id ? "audit.update" : "audit.create", "audit", auditId!, before, row);
    return { ok: true };
  });

// ================================================================ trust center

export const savePublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().optional(), item_type: z.enum(["assurance", "section", "document"]), item_key: z.string().trim().min(2).max(60),
    title: z.string().trim().min(2).max(200), body: z.string().max(20_000), framework_key: z.string().max(40).nullable(),
    assurance_status: z.enum(ASSURANCE_STATUSES).nullable(), audit_id: z.string().uuid().nullable(),
    access_level: z.enum(["public", "login_required", "nda_required", "internal"]), sort: z.number().int().min(0).max(999),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "security_compliance_manage");
    if (data.item_type === "assurance") {
      if (!data.framework_key || !data.assurance_status) throw new Error("Choose the framework and its assurance status.");
      const audit = data.audit_id ? (await c.db.from("compliance_audits").select("result, report_evidence_id, framework_key").eq("id", data.audit_id).maybeSingle()).data : null;
      const p = assuranceProblem(data.assurance_status, audit, data.framework_key);
      if (p) throw new Error(p);
    }
    const before = data.id ? (await c.db.from("trust_publications").select("*").eq("id", data.id).single()).data : null;
    const { id, ...fields } = data;
    // Any edit returns the item to Internal Only; it must be re-approved before it shows again.
    const row = { ...fields, state: "internal_only", approved_by: null, published_at: null };
    let pubId = id;
    if (id) ok(await c.db.from("trust_publications").update(row).eq("id", id));
    else pubId = (ok(await c.db.from("trust_publications").insert({ ...row, created_by: c.userId }).select("id").single()) as any).id;
    await c.db.from("trust_publication_events").insert({ publication_id: pubId, from_state: before?.state ?? null, to_state: "internal_only", snapshot: row, reason: id ? "Edited" : "Created", actor: c.userId });
    await log(c, id ? "trust.edit" : "trust.create", "trust_publication", pubId!, before, row);
    return { ok: true };
  });

export const transitionPublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), to: z.enum(PUBLICATION_STATES), reason: z.string().trim().min(5).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    if (data.to === "internal_only" || data.to === "withdrawn") need(c, "security_compliance_manage");
    else need(c, "trust_center_publish");
    const pub = (await c.db.from("trust_publications").select("*").eq("id", data.id).single()).data;
    if (!pub) throw new Error("Item not found.");
    const lastEdit = (await c.db.from("trust_publication_events").select("actor").eq("publication_id", data.id).eq("to_state", "internal_only").order("created_at", { ascending: false }).limit(1)).data?.[0];
    const editor = lastEdit?.actor ?? pub.created_by;
    const selfApproved = data.to === "approved" && editor === c.userId ? await selfOk(c.userId, "trust_publication", [pub.id]) : false;
    const p = publicationProblem(pub.state as PublicationState, data.to, { actor: c.userId, editor, selfApproved });
    if (p) throw new Error(p);
    const patch: any = { state: data.to };
    if (data.to === "approved") patch.approved_by = c.userId;
    if (data.to === "published") patch.published_at = new Date().toISOString();
    ok(await c.db.from("trust_publications").update(patch).eq("id", data.id));
    await c.db.from("trust_publication_events").insert({ publication_id: data.id, from_state: pub.state, to_state: data.to, snapshot: { ...pub, ...patch }, reason: data.reason + (selfApproved ? " (Super Admin self-approval)" : ""), actor: c.userId });
    await log(c, `trust.${data.to}`, "trust_publication", data.id, { state: pub.state }, { state: data.to }, data.reason);
    return { ok: true };
  });

export const decideDocumentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), status: z.enum(["approved", "declined", "fulfilled"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "security_compliance_manage");
    const before = (await c.db.from("trust_document_requests").select("status").eq("id", data.id).single()).data;
    ok(await c.db.from("trust_document_requests").update({ status: data.status, decided_by: c.userId, decided_at: new Date().toISOString() }).eq("id", data.id));
    await log(c, `trust_request.${data.status}`, "trust_document_request", data.id, before, { status: data.status });
    return { ok: true };
  });
