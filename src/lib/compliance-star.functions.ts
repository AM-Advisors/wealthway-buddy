import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { authorize } from "@/lib/authorize";

/**
 * CSA STAR Level 1 (CAIQ v4 self-assessment). Staff-only via administration.controls.*.
 * Answers are append-only; approval needs a second person (or a reasoned Super Admin
 * self-approval). Harmonious never submits to the STAR Registry - staff do that manually.
 */
const VIEW = "administration.controls.view", EDIT = "administration.controls.edit";

async function ctxFor(context: any) {
  const { loadBundle, authzFactsFor } = await import("@/lib/access-control.server");
  const b = await loadBundle();
  const userId = context.userId as string;
  const facts = authzFactsFor(b, userId);
  const perms = [VIEW, EDIT].filter((p) => authorize(facts, p as any, { type: "global", id: null }).allowed);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { userId, perms, db: supabaseAdmin as any };
}
const need = (c: { perms: string[] }, p: string) => { if (!c.perms.includes(p)) throw new Error("Forbidden: you don't have permission for this action."); };
const GOOD = ["implemented", "operating", "tested"];

export const getStar = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await ctxFor(context); need(c, VIEW);
    const [qs, ans, ev, reqs, maps, st, evid, events] = await Promise.all([
      c.db.from("star_questions").select("*").order("sort").limit(2000),
      c.db.from("star_answers").select("*").order("created_at", { ascending: false }).limit(10000),
      c.db.from("star_assessment_events").select("*").order("created_at", { ascending: false }).limit(200),
      c.db.from("compliance_requirements").select("id, code, title").eq("framework", "CSA CCM v4"),
      c.db.from("compliance_control_mappings").select("control_key, requirement_id"),
      c.db.from("compliance_control_status_events").select("control_key, status, created_at").order("created_at", { ascending: false }).limit(5000),
      c.db.from("compliance_evidence").select("id, control_key, summary").limit(5000),
      null,
    ]);
    void events;
    const reqRows = (reqs.data ?? []) as any[];
    const reqById = new Map(reqRows.map((r) => [r.id, r.code]));
    const domainControls: Record<string, string[]> = {};
    for (const m of (maps.data ?? []) as any[]) { const d = reqById.get(m.requirement_id); if (d) (domainControls[d] ??= []).push(m.control_key); }
    const status: Record<string, string> = {};
    for (const s of (st.data ?? []) as any[]) status[s.control_key] ??= s.status;
    const evByControl: Record<string, { id: string; summary: string }[]> = {};
    for (const e of (evid.data ?? []) as any[]) (evByControl[e.control_key] ??= []).push({ id: e.id, summary: e.summary });
    const latest = new Map<string, any>(), approved = new Map<string, any>();
    for (const a of (ans.data ?? []) as any[]) {
      if (!latest.has(a.question_id)) latest.set(a.question_id, a);
      if (a.status === "approved" && !approved.has(a.question_id)) approved.set(a.question_id, a);
    }
    const questions = ((qs.data ?? []) as any[]).map((q) => {
      const ctrls = domainControls[q.domain_code] ?? [];
      const proven = ctrls.filter((k) => GOOD.includes(status[k] ?? "") && (evByControl[k]?.length ?? 0) > 0);
      const suggestion = proven.length
        ? { answer: "yes", control_keys: proven, evidence_ids: proven.flatMap((k) => evByControl[k]!.map((e) => e.id)).slice(0, 10), note: `Supported by ${proven.join(", ")} with recorded evidence. Confirm it fully answers this question.` }
        : { answer: "no", control_keys: ctrls, evidence_ids: [], note: ctrls.length ? `Related controls (${ctrls.join(", ")}) lack implemented status with evidence.` : "No Harmonious control covers this area yet." };
      const l = latest.get(q.question_id), ap = approved.get(q.question_id);
      return { ...q, latest: l ?? null, approved: ap ?? null, approvedIsLatest: !!ap && l?.id === ap.id || (!!ap && l?.approves_id != null && l.id === ap.id), suggestion };
    });
    const ev0 = (ev.data ?? []) as any[];
    const pick = (a: string) => ev0.find((e) => e.action === a)?.value ?? null;
    return {
      canEdit: c.perms.includes(EDIT), me: c.userId, questions,
      domains: reqRows.map((r) => ({ code: r.code, title: r.title, controls: domainControls[r.code] ?? [] })),
      owner: pick("owner_set"), submittedOn: pick("submitted"), registryUrl: pick("registry_url"),
      history: ev0.slice(0, 50),
    };
  });

export const importStarQuestions = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ rows: z.array(z.object({ question_id: z.string().trim().min(3).max(40), question: z.string().trim().min(3).max(4000), ccm_control_id: z.string().max(40).nullable() })).min(1).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context); need(c, EDIT);
    const rows = data.rows.map((r, i) => ({
      question_id: r.question_id, question: r.question, ccm_control_id: r.ccm_control_id ?? r.question_id.replace(/\.\d+$/, ""),
      domain_code: r.question_id.split("-")[0]!.toUpperCase(), sort: i, imported_by: c.userId,
    }));
    const { error } = await c.db.from("star_questions").upsert(rows, { onConflict: "question_id", ignoreDuplicates: true });
    if (error) throw new Error("Could not save the questions.");
    return { count: rows.length };
  });

export const saveStarAnswer = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    question_id: z.string().max(40), answer: z.enum(["yes", "no", "na"]), responsibility: z.enum(["csp", "csc", "shared"]),
    explanation: z.string().trim().min(3).max(4000), control_keys: z.array(z.string().max(20)).max(30), evidence_ids: z.array(z.string().uuid()).max(30),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context); need(c, EDIT);
    if (data.answer === "yes" && data.responsibility !== "csc" && !data.evidence_ids.length) throw new Error("A \"Yes\" needs at least one linked evidence record.");
    const { error } = await c.db.from("star_answers").insert({ ...data, status: "draft", created_by: c.userId });
    if (error) throw new Error("Could not save the answer.");
    return { ok: true };
  });

export const approveStarAnswer = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context); need(c, EDIT);
    const { data: d } = await c.db.from("star_answers").select("*").eq("id", data.id).maybeSingle();
    if (!d || d.status !== "draft") throw new Error("Only a draft answer can be approved.");
    let self = false;
    if (d.created_by === c.userId) {
      const { selfApprove } = await import("@/lib/self-approval.server");
      self = await selfApprove(c.userId, "star_answer_approve", [d.id]);
      if (!self) throw new Error("A different person must approve this answer.");
    }
    const { id: _id, created_at: _c, ...rest } = d;
    const { error } = await c.db.from("star_answers").insert({ ...rest, status: "approved", approves_id: d.id, created_by: c.userId, self_approved: self });
    if (error) throw new Error("Could not approve.");
    return { ok: true };
  });

export const recordStarEvent = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ action: z.enum(["owner_set", "submitted", "registry_url"]), value: z.string().trim().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const c = await ctxFor(context); need(c, EDIT);
    if (data.action === "registry_url" && !/^https:\/\/cloudsecurityalliance\.org\//.test(data.value)) throw new Error("Use the cloudsecurityalliance.org registry link.");
    await c.db.from("star_assessment_events").insert({ ...data, actor_id: c.userId });
    return { ok: true };
  });
