/**
 * Fictional custom services for /qa-sandbox. Same pure rules as the server; nothing leaves the browser,
 * no AI is called and nothing is posted to Slack.
 */
import { canChangeCustomService, canCreateCustomService, canReviewCustomServices, cleanCustomService, customServiceKey, customServiceProblem, editReopensReview, reviewProblem } from "@/lib/custom-service-model";

export const QA_CUSTOM_SERVICE_FNS = ["listCustomServices", "createCustomService", "updateCustomService", "reviewCustomService", "retireCustomService", "draftCustomServiceWithAi"] as const;

export type QaCustomActor = "writer" | "reviewer";
export type QaCustomServices = { actor: QaCustomActor; rows: any[]; events: any[]; notices: string[]; seq: number };

const PEOPLE: Record<QaCustomActor, { id: string; name: string; roles: string[] }> = {
  writer: { id: "qa-cs-writer", name: "Sam Rivera (fictional Account Executive)", roles: ["account_executive"] },
  reviewer: { id: "qa-cs-reviewer", name: "Jordan Lee (fictional Product Reviewer)", roles: ["product_reviewer"] },
};

export const createQaCustomServices = (): QaCustomServices => ({ actor: "writer", rows: [], events: [], notices: [], seq: 1 });

export function handleQaCustomServiceCall(fn: string, data: any, s: QaCustomServices): unknown {
  const me = PEOPLE[s.actor];
  const now = () => new Date(Date.now() + s.seq++).toISOString();
  const nameOf = (id: string | null) => (id ? Object.values(PEOPLE).find((p) => p.id === id)?.name ?? "Team member" : null);
  const ev = (id: string, event: string, detail: any = {}) => s.events.unshift({ service_id: id, event, actor_id: me.id, detail, created_at: now() });
  const row = (id: string) => { const r = s.rows.find((x) => x.id === id); if (!r) throw new Error("Custom service not found."); return r; };
  switch (fn) {
    case "listCustomServices": {
      const rows = s.rows.filter((r) => data?.includeRetired || !r.archived_at);
      return {
        canCreate: canCreateCustomService(me.roles), canReview: canReviewCustomServices(me.roles), userId: me.id,
        services: rows.map((r) => ({
          id: r.id, serviceKey: customServiceKey(r.id), name: r.name, category: r.category, summary: r.summary, included: r.included, excluded: r.excluded,
          billingFrequency: r.billing_frequency, suggestedPriceCents: r.suggested_price_cents, writtenWith: r.written_with, reviewStatus: r.review_status,
          productTarget: r.product_target, reviewNote: r.review_note, reviewedByName: nameOf(r.reviewed_by), reviewedAt: r.reviewed_at,
          createdBy: r.created_by, createdByName: nameOf(r.created_by), createdAt: r.created_at, updatedAt: r.updated_at, archivedAt: r.archived_at, quoteUses: 0,
          canChange: canChangeCustomService({ actorId: me.id, roles: me.roles, createdBy: r.created_by }) && !r.archived_at,
          reviewBlocker: reviewProblem({ actorId: me.id, roles: me.roles, createdBy: r.created_by, decision: "not_tech", archived: !!r.archived_at }),
          history: s.events.filter((e) => e.service_id === r.id).map((e) => ({ event: e.event, actorName: nameOf(e.actor_id), at: e.created_at, detail: e.detail })),
        })),
      };
    }
    case "draftCustomServiceWithAi": {
      if (!canCreateCustomService(me.roles)) throw new Error("Your role can't add custom services.");
      return { summary: `Fictional draft for ${data?.name || "this service"}: Harmonious prepares and delivers the work described by Sales. [confirm: scope]`, included: ["Kickoff call", "Prepared deliverable", "One round of revisions"], excluded: ["Legal or tax advice"], category: "administration" };
    }
    case "createCustomService": {
      if (!canCreateCustomService(me.roles)) throw new Error("Your role can't add custom services.");
      const c = cleanCustomService(data);
      const p = customServiceProblem(c); if (p) throw new Error(p);
      if (s.rows.some((r) => !r.archived_at && r.name.toLowerCase() === c.name.toLowerCase())) throw new Error(`A custom service named "${c.name}" already exists. Pick it from the list or use another name.`);
      const at = now();
      const r = { id: `00000000-0000-4000-8000-${String(s.seq++).padStart(12, "0")}`, name: c.name, category: c.category, summary: c.summary, included: c.included, excluded: c.excluded, billing_frequency: c.billingFrequency, suggested_price_cents: c.suggestedPriceCents, written_with: data?.writtenWith ?? "manual", review_status: "pending", product_target: null, review_note: null, reviewed_by: null, reviewed_at: null, archived_at: null, created_by: me.id, created_at: at, updated_at: at };
      s.rows.unshift(r); ev(r.id, "created", { writtenWith: r.written_with }); s.notices.push(`New custom service from Sales · ${r.name}`);
      return { id: r.id };
    }
    case "updateCustomService": {
      const r = row(data.id);
      if (!canChangeCustomService({ actorId: me.id, roles: me.roles, createdBy: r.created_by })) throw new Error("Only the person who wrote it, a Sales leader or a reviewer can change this service.");
      if (r.updated_at !== data.expectedUpdatedAt) throw new Error("Someone else changed this service. Refresh and try again.");
      const c = cleanCustomService(data); const p = customServiceProblem(c); if (p) throw new Error(p);
      const before = cleanCustomService({ name: r.name, summary: r.summary, included: r.included, excluded: r.excluded, category: r.category, billingFrequency: r.billing_frequency, suggestedPriceCents: r.suggested_price_cents });
      const reopen = editReopensReview(r.review_status, before, c);
      Object.assign(r, { name: c.name, category: c.category, summary: c.summary, included: c.included, excluded: c.excluded, billing_frequency: c.billingFrequency, suggested_price_cents: c.suggestedPriceCents, updated_at: now() },
        reopen ? { review_status: "pending", product_target: null, review_note: null, reviewed_by: null, reviewed_at: null } : {});
      ev(r.id, "updated", { reopenedReview: reopen });
      if (reopen) { ev(r.id, "reopened"); s.notices.push(`Custom service changed, review again · ${r.name}`); }
      return { ok: true, reopened: reopen };
    }
    case "reviewCustomService": {
      const r = row(data.id);
      const p = reviewProblem({ actorId: me.id, roles: me.roles, createdBy: r.created_by, decision: data.decision, productTarget: data.productTarget, archived: !!r.archived_at });
      if (p) throw new Error(p);
      if (r.updated_at !== data.expectedUpdatedAt) throw new Error("Someone else changed this service. Refresh and try again.");
      Object.assign(r, { review_status: data.decision, product_target: data.decision === "add_to_product" ? String(data.productTarget).trim() : null, review_note: data.note || null, reviewed_by: me.id, reviewed_at: now(), updated_at: now() });
      ev(r.id, "reviewed", { decision: data.decision });
      return { ok: true };
    }
    case "retireCustomService": {
      const r = row(data.id);
      if (!canChangeCustomService({ actorId: me.id, roles: me.roles, createdBy: r.created_by })) throw new Error("Only the person who wrote it, a Sales leader or a reviewer can retire this service.");
      if (String(data.reason ?? "").trim().length < 5) throw new Error("Say why it's being retired.");
      r.archived_at = now(); r.updated_at = r.archived_at; ev(r.id, "retired", { reason: data.reason });
      return { ok: true };
    }
  }
  throw new Error(`Not modeled: ${fn}`);
}
