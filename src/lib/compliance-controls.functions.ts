import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { authorize } from "@/lib/authorize";
import { ATOMIC_PERMISSIONS } from "@/lib/atomic-permissions";
import { accessReviewPopulation, buildRbacEvidence } from "@/lib/compliance-evidence";
import {
  BASELINE_CONTROLS, CONTROL_STATUSES, CONTROL_TYPES, dashboard, EVIDENCE_QUERIES, EVIDENCE_QUERY_VERSION, evidenceReviewProblem,
  FREQUENCIES, latestVersions, nextDue, recordProblem, REGISTERS, registerPermissions, stableJson, statusProblem, type ControlStatus,
} from "@/lib/compliance-model";

/**
 * Compliance & Controls (Stage 2.7). Harmonious internal only: every call is
 * authorized server-side against canonical administration.* permissions.
 * Tables are append-only; nothing here changes access or business records.
 */

const ADMIN_PERMS = ATOMIC_PERMISSIONS.filter((a) => a.area === "administration").map((a) => a.key);

async function ctxFor(context: any) {
  const { loadBundle, authzFactsFor } = await import("@/lib/access-control.server");
  const b = await loadBundle();
  const userId = context.userId as string;
  const facts = authzFactsFor(b, userId);
  const perms = ADMIN_PERMS.filter((p) => authorize(facts, p, { type: "global", id: null }).allowed);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { b, userId, perms, db: supabaseAdmin as any };
}
function need(c: { perms: string[] }, p: string) {
  if (!c.perms.includes(p)) throw new Error("Forbidden: you don't have permission for this Compliance & Controls action.");
}
async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const all = async (db: any, t: string, order = "created_at") => ((await db.from(t).select("*").order(order, { ascending: true }).limit(5000)).data ?? []) as any[];
function unwrap<T>(r: { data: T; error: any }): T {
  if (r.error) throw new Error(r.error.message?.includes("append-only") ? "This record is append-only." : "Could not save.");
  return r.data;
}

export const getCompliance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await ctxFor(context);
    need(c, "administration.controls.view");
    const [controls, requirements, mappings, statusEvents, evidence, evReviews, reviews, decisions, records] = await Promise.all([
      all(c.db, "compliance_controls"), all(c.db, "compliance_requirements"), all(c.db, "compliance_control_mappings"), all(c.db, "compliance_control_status_events"),
      c.perms.includes("administration.evidence.view") ? all(c.db, "compliance_evidence") : Promise.resolve([]),
      c.perms.includes("administration.evidence.view") ? all(c.db, "compliance_evidence_reviews") : Promise.resolve([]),
      c.perms.includes("administration.access_reviews.manage") ? all(c.db, "compliance_access_reviews") : all(c.db, "compliance_access_reviews").then((r) => r.filter((x) => x.reviewer_user_id === c.userId)),
      all(c.db, "compliance_access_review_decisions"),
      all(c.db, "compliance_records"),
    ]);
    const visibleRecords = records.filter((r) => c.perms.includes(registerPermissions(r.kind).view));
    const latest = latestVersions(controls.map((x) => ({ ...x, kind: "control", record_ref: x.control_key })));
    const statusOf = (k: string) => statusEvents.filter((e) => e.control_key === k).at(-1) ?? null;
    const perfOf = (k: string) => statusEvents.filter((e) => e.control_key === k && ["operating", "tested"].includes(e.status)).at(-1)?.created_at ?? null;
    const testOf = (k: string) => statusEvents.filter((e) => e.control_key === k && e.status === "tested").at(-1)?.created_at ?? null;
    const today = new Date().toISOString().slice(0, 10);
    const controlRows = latest.map((x) => ({
      ...x, status: (statusOf(x.control_key)?.status ?? null) as ControlStatus | null, last_performed: perfOf(x.control_key), last_tested: testOf(x.control_key),
      next_due: nextDue(perfOf(x.control_key), x.frequency, x.effective_at),
      versions: controls.filter((v) => v.control_key === x.control_key).map((v) => ({ version: v.version, created_at: v.created_at, change_reason: v.change_reason, name: v.name, description: v.description })),
      mappings: mappings.filter((m) => m.control_key === x.control_key).map((m) => requirements.find((r) => r.id === m.requirement_id)).filter(Boolean).map((r: any) => `${r.framework}: ${r.code}`),
      exceptions: visibleRecords.filter((r) => r.kind === "exception" && r.data?.control_key === x.control_key).length,
    })).sort((a, b) => a.control_key.localeCompare(b.control_key));
    const evRows = evidence.map((e) => ({ ...e, reviews: evReviews.filter((r) => r.evidence_id === e.id), superseded: evidence.some((o) => o.supersedes_id === e.id) }));
    const reviewRows = reviews.map((r) => ({ ...r, decisions: decisions.filter((d) => d.review_id === r.id), completed: decisions.some((d) => d.review_id === r.id && d.decision === "complete") }));
    const names = new Map<string, string>(c.b.users.map((u: any) => [u.id, u.email ?? u.id]));
    const staff: { id: string; label: string }[] = [...new Set<string>(c.b.roles.filter((r: any) => r.role !== "investor").map((r: any) => r.user_id as string))].map((id: string) => ({ id, label: String(names.get(id) ?? id) })).sort((a, b) => a.label.localeCompare(b.label));
    const latestRecords = latestVersions(visibleRecords);
    const report = BASELINE_CONTROLS.map((bc) => {
      const row = controlRows.find((r) => r.control_key === bc.key);
      const hasEv = evRows.filter((e) => e.control_key === bc.key);
      return { control: `${bc.key} — ${bc.name}`, implementation: bc.implementation, available: [bc.evidenceAvailable, hasEv.length ? `${hasEv.length} evidence record(s)` : ""].filter(Boolean).join("; "),
        missing: hasEv.some((e) => e.reviews.some((r: any) => r.decision === "accepted")) ? "—" : bc.evidenceMissing,
        soc2: bc.mappings.filter((m) => m.startsWith("SOC 2:")).map((m) => m.slice(6)).join(", "), gdpr: bc.mappings.filter((m) => m.startsWith("GDPR:")).map((m) => m.slice(5)).join(", "),
        status: row?.status ?? bc.status };
    });
    return {
      perms: c.perms, me: c.userId, staff,
      controls: controlRows, requirements, evidence: evRows, reviews: reviewRows,
      records: latestRecords, recordHistory: visibleRecords.map((r) => ({ id: r.id, kind: r.kind, record_ref: r.record_ref, version: r.version, status: r.status, change_reason: r.change_reason, created_at: r.created_at, created_by: r.created_by })),
      providers: ((await c.db.from("third_party_providers").select("id, name, provider_type, data_categories, contract_status").limit(500)).data ?? []) as any[],
      dashboard: dashboard({ controls: controlRows.map((x) => ({ key: x.control_key, status: x.status, nextDue: x.next_due })), evidence: evRows.map((e) => ({ reviewed: e.reviews.length > 0, collected_at: e.collected_at })), reviews: reviewRows.map((r) => ({ completed: r.completed, period_end: r.period_end })), records: latestRecords, today }),
      report,
    };
  });

const reasonZ = z.string().trim().min(5, "Give a reason (at least 5 characters).").max(500);

export const saveControlVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    control_key: z.string().trim().regex(/^[A-Z]{2,4}-\d{2,3}$/, "Use an ID like AC-07."), name: z.string().trim().min(3), objective: z.string().max(2000), description: z.string().max(4000),
    control_type: z.enum(CONTROL_TYPES), system_process: z.string().max(200), owner_label: z.string().max(200), operator_user_id: z.string().uuid().nullable(), reviewer_user_id: z.string().uuid().nullable(),
    frequency: z.enum(FREQUENCIES), evidence_requirements: z.string().max(2000), implementation: z.string().max(2000), sod_required: z.boolean(), change_reason: reasonZ,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "administration.controls.edit");
    if (data.sod_required && data.operator_user_id && data.operator_user_id === data.reviewer_user_id) throw new Error("Operator and reviewer must be different people.");
    const prev = (await c.db.from("compliance_controls").select("version").eq("control_key", data.control_key).order("version", { ascending: false }).limit(1)).data?.[0];
    unwrap(await c.db.from("compliance_controls").insert({ ...data, version: (prev?.version ?? 0) + 1, created_by: c.userId }));
    return { ok: true };
  });

export const addControlMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ control_key: z.string(), requirement_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "administration.controls.edit");
    unwrap(await c.db.from("compliance_control_mappings").insert({ ...data, created_by: c.userId }));
    return { ok: true };
  });

export const addRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ framework: z.string().trim().min(2).max(60), code: z.string().trim().min(1).max(60), title: z.string().trim().min(2).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "administration.controls.approve");
    unwrap(await c.db.from("compliance_requirements").insert(data));
    return { ok: true };
  });

export const recordControlStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ control_key: z.string(), status: z.enum(CONTROL_STATUSES), evidence_id: z.string().uuid().nullable(), note: reasonZ }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "administration.controls.review");
    const ev = (await c.db.from("compliance_evidence").select("id, control_key, collected_by").eq("control_key", data.control_key)).data ?? [];
    const revs = (await c.db.from("compliance_evidence_reviews").select("evidence_id, decision, reviewer_user_id")).data ?? [];
    const problem = statusProblem(data.status, ev.map((e: any) => ({ ...e, reviews: revs.filter((r: any) => r.evidence_id === e.id) })), data.evidence_id);
    if (problem) throw new Error(problem);
    unwrap(await c.db.from("compliance_control_status_events").insert({ ...data, actor_user_id: c.userId }));
    return { ok: true };
  });

export const addManualEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    control_key: z.string(), evidence_type: z.string().trim().min(2).max(100), source: z.string().trim().min(2).max(200),
    period_start: z.string().date().nullable(), period_end: z.string().date().nullable(), artifact_reference: z.string().trim().min(2).max(500),
    note: z.string().max(1000), supersedes_id: z.string().uuid().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "administration.evidence.collect");
    const { note, ...row } = data;
    const summary = { note };
    unwrap(await c.db.from("compliance_evidence").insert({ ...row, summary, system_generated: false, collected_by: c.userId, fingerprint: await sha256(stableJson({ row, summary })) }));
    return { ok: true };
  });

/** Reads access state only; it never changes it. */
export const collectRbacEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ query: z.enum(Object.keys(EVIDENCE_QUERIES) as [keyof typeof EVIDENCE_QUERIES, ...(keyof typeof EVIDENCE_QUERIES)[]]), period_start: z.string().date(), period_end: z.string().date(), supersedes_id: z.string().uuid().nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "administration.evidence.collect");
    const result = buildRbacEvidence(data.query, c.b as any, { start: data.period_start, end: data.period_end });
    const fingerprint = await sha256(stableJson(result));
    unwrap(await c.db.from("compliance_evidence").insert({
      control_key: result.control, evidence_type: result.label, source: "Access Control (authoritative server data)", period_start: data.period_start, period_end: data.period_end,
      collected_by: c.userId, system_generated: true, artifact_reference: `rbac:${data.query}`, fingerprint, record_count: result.record_count, query_version: EVIDENCE_QUERY_VERSION,
      summary: result, supersedes_id: data.supersedes_id ?? null,
    }));
    return { ok: true, record_count: result.record_count, fingerprint };
  });

export const reviewEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ evidence_id: z.string().uuid(), decision: z.enum(["accepted", "exception"]), note: z.string().trim().max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "administration.evidence.review");
    const ev = (await c.db.from("compliance_evidence").select("*").eq("id", data.evidence_id).single()).data;
    if (!ev) throw new Error("Evidence not found.");
    const ctl = (await c.db.from("compliance_controls").select("operator_user_id, sod_required, version").eq("control_key", ev.control_key).order("version", { ascending: false }).limit(1)).data?.[0];
    const mine = (await c.db.from("compliance_evidence_reviews").select("id").eq("evidence_id", ev.id).eq("reviewer_user_id", c.userId)).data ?? [];
    const problem = evidenceReviewProblem({ reviewerId: c.userId, collectedBy: ev.collected_by, operatorId: ctl?.operator_user_id ?? null, sodRequired: ctl?.sod_required ?? true, alreadyReviewedByMe: mine.length > 0 });
    if (problem) throw new Error(problem);
    if (data.decision === "exception" && data.note.length < 5) throw new Error("Describe the exception.");
    unwrap(await c.db.from("compliance_evidence_reviews").insert({ ...data, reviewer_user_id: c.userId }));
    return { ok: true };
  });

export const createAccessReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ title: z.string().trim().min(5).max(200), population: z.enum(["privileged", "staff", "scoped"]), period_start: z.string().date(), period_end: z.string().date(), reviewer_user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    need(c, "administration.access_reviews.manage");
    const items = accessReviewPopulation(data.population, c.b as any);
    const snapshot = { taken_at: new Date().toISOString(), items };
    unwrap(await c.db.from("compliance_access_reviews").insert({ ...data, snapshot, fingerprint: await sha256(stableJson(snapshot)), created_by: c.userId }));
    return { ok: true, count: items.length };
  });

/** Records a decision only; revoking/reducing access still happens in Access Control. */
export const decideAccessReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ review_id: z.string().uuid(), item_key: z.string().max(400), decision: z.enum(["approve", "revoke", "reduce", "investigate", "complete"]), note: z.string().trim().max(1000), target: z.string().max(200).nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    const review = (await c.db.from("compliance_access_reviews").select("*").eq("id", data.review_id).single()).data;
    if (!review) throw new Error("Review not found.");
    if (review.reviewer_user_id !== c.userId) throw new Error("Only the assigned reviewer can record decisions.");
    const prior = (await c.db.from("compliance_access_review_decisions").select("item_key, decision").eq("review_id", review.id)).data ?? [];
    if (prior.some((p: any) => p.decision === "complete")) throw new Error("This review is complete; its evidence is frozen.");
    if (data.decision !== "approve" && data.note.length < 5) throw new Error("Add a review note for changes and exceptions.");
    if (data.decision === "complete") {
      const keys = new Set((review.snapshot?.items ?? []).map((i: any) => i.key));
      const decided = new Set(prior.map((p: any) => p.item_key));
      if ([...keys].some((k) => !decided.has(k))) throw new Error("Decide every item before completing the review.");
    } else {
      const item = (review.snapshot?.items ?? []).find((i: any) => i.key === data.item_key);
      if (!item) throw new Error("That item isn't in this review's snapshot.");
      const roles: string[] = (item.roles ?? [{ role: item.role }]).map((r: any) => r.role);
      if (data.target && !roles.includes(data.target) && !(item.direct_grants ?? []).includes(data.target)) throw new Error("Pick a role or permission that belongs to this person.");
      if ((data.decision === "revoke" || data.decision === "reduce") && roles.length > 1 && !data.target) throw new Error("Choose which role or permission should be removed or reduced.");
    }
    unwrap(await c.db.from("compliance_access_review_decisions").insert({ ...data, reviewer_user_id: c.userId }));
    return { ok: true };
  });

export const saveRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ kind: z.string(), record_ref: z.string().nullable(), title: z.string().trim().min(2).max(200), status: z.string(), data: z.record(z.string(), z.union([z.string().max(4000), z.boolean(), z.null()])), change_reason: z.string().trim().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context);
    const spec = REGISTERS[data.kind];
    if (!spec) throw new Error("Unknown register.");
    need(c, registerPermissions(data.kind).manage);
    const evidenceIds = data.kind === "exception" ? (((await c.db.from("compliance_evidence").select("id")).data ?? []) as any[]).map((e) => e.id) : undefined;
    const problem = recordProblem(data.kind, data.status, data.data, { evidenceIds });
    if (problem) throw new Error(problem);
    let ref = data.record_ref, version = 1, supersedes: string | null = null;
    if (ref) {
      const prev = (await c.db.from("compliance_records").select("id, version").eq("kind", data.kind).eq("record_ref", ref).order("version", { ascending: false }).limit(1)).data?.[0];
      if (!prev) throw new Error("Record not found.");
      if (data.change_reason.length < 5) throw new Error("Give a reason for this change (at least 5 characters).");
      version = prev.version + 1; supersedes = prev.id;
    } else {
      const { count } = await c.db.from("compliance_records").select("id", { count: "exact", head: true }).eq("kind", data.kind).eq("version", 1);
      ref = `${spec.prefix}-${String((count ?? 0) + 1).padStart(3, "0")}`;
    }
    unwrap(await c.db.from("compliance_records").insert({ kind: data.kind, record_ref: ref, version, supersedes_id: supersedes, title: data.title, status: data.status, data: data.data, change_reason: data.change_reason || "Created", created_by: c.userId }));
    return { ok: true, record_ref: ref };
  });
