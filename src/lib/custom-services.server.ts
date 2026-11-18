/**
 * Server-only custom services engine. Sales write (or AI-draft) a reusable service; reviewers
 * classify it (design/build, add to a product, not tech related). Classification never approves
 * prices, quotes, money or access; quote prices for custom services always need CEO or CRO.
 */
import { generateResponse, GatewayError, PaymentRequiredError, RateLimitError } from "@lovable.dev/ai-gateway";
import { SERVICE_CATEGORIES } from "@/lib/service-catalog.functions";
import {
  canChangeCustomService, canCreateCustomService, canReviewCustomServices, canSeeCustomServices, cleanCustomService, customServiceKey,
  customServiceProblem, editReopensReview, reviewProblem, buildUpdateProblem, releaseProblem, canReleaseCustomService,
  type BuildStage, type CustomBilling, type CustomReviewStatus, type CustomServiceInput,
} from "@/lib/custom-service-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const MODEL = "openai/gpt-6.1-sol";

async function rolesOf(userId: string): Promise<string[]> {
  const { data, error } = await (await admin()).from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error("Couldn't verify your access.");
  return ((data ?? []) as any[]).map((r) => String(r.role));
}

async function event(serviceId: string, ev: string, actorId: string, detail: Record<string, unknown> = {}) {
  const { error } = await (await admin()).from("sales_custom_service_events").insert({ service_id: serviceId, event: ev, actor_id: actorId, detail });
  if (error) console.error("custom service event", error.message);
}

const toInput = (row: any) => cleanCustomService({ name: row.name, category: row.category, summary: row.summary, included: row.included ?? [], excluded: row.excluded ?? [], billingFrequency: row.billing_frequency, suggestedPriceCents: row.suggested_price_cents });

const shape = (row: any, nm: Map<string, string>, uses: Map<string, number>) => ({
  id: row.id as string, serviceKey: customServiceKey(row.id), name: row.name as string, category: row.category as string,
  summary: row.summary as string, included: (row.included ?? []) as string[], excluded: (row.excluded ?? []) as string[],
  billingFrequency: row.billing_frequency as "one_time" | "monthly" | "quarterly" | "annual",
  suggestedPriceCents: row.suggested_price_cents == null ? null : Number(row.suggested_price_cents),
  writtenWith: row.written_with as "manual" | "ai", reviewStatus: row.review_status as CustomReviewStatus,
  productTarget: (row.product_target ?? null) as string | null, reviewNote: (row.review_note ?? null) as string | null,
  reviewedByName: row.reviewed_by ? nm.get(row.reviewed_by) ?? "Team member" : null, reviewedAt: (row.reviewed_at ?? null) as string | null,
  createdBy: row.created_by as string, createdByName: nm.get(row.created_by) ?? "Team member", createdAt: row.created_at as string,
  updatedAt: row.updated_at as string, archivedAt: (row.archived_at ?? null) as string | null, quoteUses: uses.get(customServiceKey(row.id)) ?? 0,
  buildStage: (row.build_stage ?? null) as BuildStage | null, buildNote: (row.build_note ?? null) as string | null,
  buildUpdatedAt: (row.build_updated_at ?? null) as string | null, buildUpdatedByName: row.build_updated_by ? nm.get(row.build_updated_by) ?? "Team member" : null,
  listPriceCents: row.list_price_cents == null ? null : Number(row.list_price_cents), listBilling: (row.list_billing ?? null) as CustomBilling | null,
  releasedAt: (row.released_at ?? null) as string | null, releasedByName: row.released_by ? nm.get(row.released_by) ?? "Team member" : null,
  releaseNote: (row.release_note ?? null) as string | null,
});
export type CustomService = ReturnType<typeof shape>;

/** Active services for the quote pickers (any Sales role that can see quotes). */
export async function activeCustomServices(): Promise<CustomService[]> {
  const db = await admin();
  const { data, error } = await db.from("sales_custom_services").select("*").is("archived_at", null).order("name");
  if (error) throw new Error("Couldn't load custom services.");
  return ((data ?? []) as any[]).map((r) => shape(r, new Map(), new Map()));
}

export async function listCustomServices(userId: string, opts: { includeRetired?: boolean | undefined }) {
  const roles = await rolesOf(userId);
  if (!canSeeCustomServices(roles)) throw new Error("Custom services are for Harmonious Sales and the review team.");
  const db = await admin();
  let q = db.from("sales_custom_services").select("*").order("created_at", { ascending: false }).limit(500);
  if (!opts.includeRetired) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw new Error("Couldn't load custom services.");
  const rows = (data ?? []) as any[];
  const keys = rows.map((r) => customServiceKey(r.id));
  const uses = new Map<string, number>();
  if (keys.length) {
    const { data: lines } = await db.from("sales_quote_lines").select("service_key").in("service_key", keys);
    for (const l of (lines ?? []) as any[]) uses.set(l.service_key, (uses.get(l.service_key) ?? 0) + 1);
  }
  const ids = rows.map((r) => r.id);
  const { data: evs } = ids.length ? await db.from("sales_custom_service_events").select("*").in("service_id", ids).order("created_at", { ascending: false }).limit(1000) : { data: [] };
  const { names } = await import("@/lib/sales-hub.server");
  const nm = await names([...rows.flatMap((r) => [r.created_by, r.reviewed_by, r.build_updated_by, r.released_by]), ...((evs ?? []) as any[]).map((e) => e.actor_id)]);
  const history = new Map<string, { event: string; actorName: string; at: string; detail: any }[]>();
  for (const e of (evs ?? []) as any[]) {
    const list = history.get(e.service_id) ?? [];
    if (list.length < 20) list.push({ event: e.event, actorName: e.actor_id ? nm.get(e.actor_id) ?? "Team member" : "System", at: e.created_at, detail: e.detail ?? {} });
    history.set(e.service_id, list);
  }
  return {
    canCreate: canCreateCustomService(roles), canReview: canReviewCustomServices(roles), canRelease: canReleaseCustomService(roles), userId,
    services: rows.map((r) => ({ ...shape(r, nm, uses), canChange: canChangeCustomService({ actorId: userId, roles, createdBy: r.created_by }) && !r.archived_at,
      reviewBlocker: r.released_at ? "This service is on quotes at a standard price, so its decision is final." : reviewProblem({ actorId: userId, roles, createdBy: r.created_by, decision: "not_tech", archived: !!r.archived_at }),
      buildBlocker: buildUpdateProblem({ roles, reviewStatus: r.review_status, archived: !!r.archived_at, released: !!r.released_at, stage: "ready" }),
      releaseBlocker: releaseProblem({ actorId: userId, roles, createdBy: r.created_by, reviewStatus: r.review_status, buildStage: r.build_stage ?? null, archived: !!r.archived_at }),
      history: history.get(r.id) ?? [] })),
  };
}

const uniqueNameError = (e: any) => String(e?.message ?? "").includes("sales_custom_services_active_name") || e?.code === "23505";

export async function createCustomService(userId: string, input: CustomServiceInput & { writtenWith: "manual" | "ai" }) {
  const roles = await rolesOf(userId);
  if (!canCreateCustomService(roles)) throw new Error("Your role can't add custom services.");
  const c = cleanCustomService(input);
  const problem = customServiceProblem(c);
  if (problem) throw new Error(problem);
  const db = await admin();
  const { data, error } = await db.from("sales_custom_services").insert({
    name: c.name, category: c.category, summary: c.summary, included: c.included, excluded: c.excluded, billing_frequency: c.billingFrequency,
    suggested_price_cents: c.suggestedPriceCents, written_with: input.writtenWith, created_by: userId, updated_by: userId,
  }).select("id, updated_at").single();
  if (error) throw new Error(uniqueNameError(error) ? `A custom service named "${c.name}" already exists. Pick it from the list or use another name.` : "Couldn't save the custom service.");
  await event(data.id, "created", userId, { writtenWith: input.writtenWith });
  const { notifyCustomService } = await import("@/lib/ops-slack-notify.server");
  await notifyCustomService({ serviceId: data.id, name: c.name, createdBy: userId, version: "created" });
  return { id: data.id as string };
}

export async function updateCustomService(userId: string, d: CustomServiceInput & { id: string; expectedUpdatedAt: string }) {
  const roles = await rolesOf(userId);
  const db = await admin();
  const { data: row } = await db.from("sales_custom_services").select("*").eq("id", d.id).maybeSingle();
  if (!row) throw new Error("Custom service not found.");
  if (row.archived_at) throw new Error("This custom service was retired.");
  if (!canChangeCustomService({ actorId: userId, roles, createdBy: row.created_by })) throw new Error("Only the person who wrote it, a Sales leader or a reviewer can change this service.");
  if (row.updated_at !== d.expectedUpdatedAt) throw new Error("Someone else changed this service. Refresh and try again.");
  const c = cleanCustomService(d);
  const problem = customServiceProblem(c);
  if (problem) throw new Error(problem);
  const reopen = editReopensReview(row.review_status, toInput(row), c);
  if (row.released_at && reopen) throw new Error("This service is on quotes at a standard price, so its wording is fixed. Retire it and add a new one to change what it is.");
  const now = new Date().toISOString();
  const { data: saved, error } = await db.from("sales_custom_services").update({
    name: c.name, category: c.category, summary: c.summary, included: c.included, excluded: c.excluded, billing_frequency: c.billingFrequency,
    suggested_price_cents: c.suggestedPriceCents, updated_by: userId, updated_at: now,
    ...(reopen ? { review_status: "pending", product_target: null, review_note: null, reviewed_by: null, reviewed_at: null } : {}),
  }).eq("id", d.id).eq("updated_at", d.expectedUpdatedAt).select("id").maybeSingle();
  if (error) throw new Error(uniqueNameError(error) ? `A custom service named "${c.name}" already exists.` : "Couldn't save the custom service.");
  if (!saved) throw new Error("Someone else changed this service. Refresh and try again.");
  await event(d.id, "updated", userId, { reopenedReview: reopen, previousDecision: reopen ? row.review_status : undefined });
  if (reopen) {
    await event(d.id, "reopened", userId, { previousDecision: row.review_status });
    const { notifyCustomService } = await import("@/lib/ops-slack-notify.server");
    await notifyCustomService({ serviceId: d.id, name: c.name, createdBy: userId, version: now, reopened: true });
  }
  return { ok: true, reopened: reopen };
}

export async function reviewCustomService(userId: string, d: { id: string; decision: string; productTarget?: string | null | undefined; note?: string | null | undefined; expectedUpdatedAt: string }) {
  const roles = await rolesOf(userId);
  const db = await admin();
  const { data: row } = await db.from("sales_custom_services").select("*").eq("id", d.id).maybeSingle();
  if (!row) throw new Error("Custom service not found.");
  const problem = reviewProblem({ actorId: userId, roles, createdBy: row.created_by, decision: d.decision, productTarget: d.productTarget, archived: !!row.archived_at });
  if (problem) throw new Error(problem);
  if (row.released_at) throw new Error("This service is on quotes at a standard price, so its decision is final.");
  if (row.updated_at !== d.expectedUpdatedAt) throw new Error("Someone else changed this service. Refresh and try again.");
  const now = new Date().toISOString();
  const note = (d.note ?? "").trim().slice(0, 2000) || null;
  const target = d.decision === "add_to_product" ? (d.productTarget ?? "").trim().slice(0, 200) : null;
  const { data: saved, error } = await db.from("sales_custom_services").update({
    review_status: d.decision, product_target: target, review_note: note, reviewed_by: userId, reviewed_at: now, updated_by: userId, updated_at: now,
    // "Needs design or build" starts the build tracker (keeping earlier progress); other decisions have nothing to build.
    build_stage: d.decision === "design_build" ? row.build_stage ?? "not_started" : null,
  }).eq("id", d.id).eq("updated_at", d.expectedUpdatedAt).select("id").maybeSingle();
  if (error) throw new Error("Couldn't save the decision.");
  if (!saved) throw new Error("Someone else changed this service. Refresh and try again.");
  await event(d.id, "reviewed", userId, { decision: d.decision, previous: row.review_status, productTarget: target, note });
  return { ok: true };
}

/** Reviewers record where the build is. Reaching Ready tells the CEO and CRO it can be released to quotes. */
export async function updateCustomServiceBuild(userId: string, d: { id: string; stage: string; note?: string | null | undefined; expectedUpdatedAt: string }) {
  const roles = await rolesOf(userId);
  const db = await admin();
  const { data: row } = await db.from("sales_custom_services").select("*").eq("id", d.id).maybeSingle();
  if (!row) throw new Error("Custom service not found.");
  const problem = buildUpdateProblem({ roles, reviewStatus: row.review_status, archived: !!row.archived_at, released: !!row.released_at, stage: d.stage });
  if (problem) throw new Error(problem);
  if (row.updated_at !== d.expectedUpdatedAt) throw new Error("Someone else changed this service. Refresh and try again.");
  const now = new Date().toISOString();
  const note = (d.note ?? "").trim().slice(0, 2000) || null;
  const { data: saved, error } = await db.from("sales_custom_services").update({
    build_stage: d.stage, build_note: note ?? row.build_note ?? null, build_updated_by: userId, build_updated_at: now, updated_by: userId, updated_at: now,
  }).eq("id", d.id).eq("updated_at", d.expectedUpdatedAt).select("id").maybeSingle();
  if (error) throw new Error("Couldn't save the build progress.");
  if (!saved) throw new Error("Someone else changed this service. Refresh and try again.");
  await event(d.id, "build_updated", userId, { stage: d.stage, previous: row.build_stage, note });
  if (d.stage === "ready" && row.build_stage !== "ready") {
    const { notifyCustomService } = await import("@/lib/ops-slack-notify.server");
    await notifyCustomService({ serviceId: d.id, name: row.name, createdBy: row.created_by, version: `ready:${now}`, stage: "ready" });
  }
  return { ok: true };
}

/**
 * CEO or CRO releases a built service to quotes with a standard price, or changes that price later.
 * Quotes at or above it on the same billing need no executive approval; quotes already saved keep their prices.
 */
export async function releaseCustomService(userId: string, d: { id: string; listPriceCents: number; listBilling: string; note?: string | null | undefined; expectedUpdatedAt: string }) {
  const roles = await rolesOf(userId);
  const db = await admin();
  const { data: row } = await db.from("sales_custom_services").select("*").eq("id", d.id).maybeSingle();
  if (!row) throw new Error("Custom service not found.");
  const problem = releaseProblem({ actorId: userId, roles, createdBy: row.created_by, reviewStatus: row.review_status, buildStage: row.build_stage ?? null, archived: !!row.archived_at, priceCents: d.listPriceCents, billing: d.listBilling });
  if (problem) throw new Error(problem);
  if (row.updated_at !== d.expectedUpdatedAt) throw new Error("Someone else changed this service. Refresh and try again.");
  const now = new Date().toISOString();
  const note = (d.note ?? "").trim().slice(0, 2000) || null;
  const first = !row.released_at;
  const price = Math.round(Number(d.listPriceCents));
  const { data: saved, error } = await db.from("sales_custom_services").update({
    list_price_cents: price, list_billing: d.listBilling, release_note: note ?? row.release_note ?? null, updated_by: userId, updated_at: now,
    ...(first ? { released_at: now, released_by: userId } : {}),
  }).eq("id", d.id).eq("updated_at", d.expectedUpdatedAt).select("id").maybeSingle();
  if (error) throw new Error("Couldn't release the service.");
  if (!saved) throw new Error("Someone else changed this service. Refresh and try again.");
  await event(d.id, first ? "released" : "price_changed", userId, { listPriceCents: price, listBilling: d.listBilling, previousPriceCents: row.list_price_cents ?? null, previousBilling: row.list_billing ?? null, note });
  if (first) {
    const { notifyCustomService } = await import("@/lib/ops-slack-notify.server");
    await notifyCustomService({ serviceId: d.id, name: row.name, createdBy: row.created_by, version: `released:${now}`, stage: "released" });
  }
  return { ok: true, released: first };
}

export async function retireCustomService(userId: string, d: { id: string; reason: string }) {
  const roles = await rolesOf(userId);
  const db = await admin();
  const { data: row } = await db.from("sales_custom_services").select("*").eq("id", d.id).maybeSingle();
  if (!row) throw new Error("Custom service not found.");
  if (row.archived_at) return { ok: true };
  if (!canChangeCustomService({ actorId: userId, roles, createdBy: row.created_by })) throw new Error("Only the person who wrote it, a Sales leader or a reviewer can retire this service.");
  const reason = d.reason.trim();
  if (reason.length < 5) throw new Error("Say why it's being retired.");
  const now = new Date().toISOString();
  const { error } = await db.from("sales_custom_services").update({ archived_at: now, archived_by: userId, updated_by: userId, updated_at: now }).eq("id", d.id);
  if (error) throw new Error("Couldn't retire the service.");
  await event(d.id, "retired", userId, { reason: reason.slice(0, 500) });
  return { ok: true };
}

const AI_SCHEMA = {
  type: "object", additionalProperties: false, required: ["summary", "included", "excluded", "category"],
  properties: {
    summary: { type: "string" },
    included: { type: "array", items: { type: "string" } },
    excluded: { type: "array", items: { type: "string" } },
    category: { type: "string", enum: SERVICE_CATEGORIES.map((c) => c.value) },
  },
};

/** AI first draft of what a service is. Never writes prices; nothing is saved until Sales saves it. */
export async function draftCustomServiceWithAi(userId: string, d: { name: string; brief: string }) {
  const roles = await rolesOf(userId);
  if (!canCreateCustomService(roles)) throw new Error("Your role can't add custom services.");
  return aiDraftService(d);
}

/** The AI call itself, after the caller's role was checked. */
export async function aiDraftService(d: { name: string; brief: string }) {
  const name = d.name.trim().slice(0, 120);
  const brief = d.brief.trim().slice(0, 4000);
  if (name.length < 2 && brief.length < 10) throw new Error("Give the service a name or a sentence about it first.");
  try {
    const res = await generateResponse({
      model: MODEL,
      reasoning: { effort: "low" },
      instructions: "You write service descriptions for Harmonious (harmonious.co), a fund administration and back-office firm for venture funds, SPVs, companies and foundations. Write a client-facing description of one service for a quote and Statement of Work: summary = 2 to 4 plain sentences on what the client gets; included = 3 to 8 short deliverables; excluded = 2 to 6 short items that are explicitly not part of it. Never write prices, fees, dollar amounts, percentages, timelines you weren't given, legal or tax advice promises, or the names of outside software vendors. Where a fact is unknown, write [confirm: ...]. Use American spelling and no dashes as punctuation.",
      input: JSON.stringify({ serviceName: name, notesFromSales: brief }),
      text: { format: { type: "json_schema", name: "custom_service", strict: true, schema: AI_SCHEMA as unknown as Record<string, unknown> } },
    });
    if (res?.status === "failed" || res?.status === "incomplete") throw new Error("The AI helper couldn't finish. Try again or write it yourself.");
    let text = "";
    for (const item of res?.output ?? []) {
      if (item?.type !== "message") continue;
      for (const c of item.content ?? []) if (c?.type === "output_text") text += c.text ?? "";
    }
    const out = JSON.parse(text || "{}");
    const c = cleanCustomService({ name: name || "Custom service", summary: String(out.summary ?? ""), included: out.included ?? [], excluded: out.excluded ?? [], category: out.category });
    return { summary: c.summary, included: c.included, excluded: c.excluded, category: c.category };
  } catch (e) {
    if (e instanceof PaymentRequiredError) throw new Error("AI writing is paused because AI credits have run out.");
    if (e instanceof RateLimitError) throw new Error("The AI helper is busy. Try again in a minute.");
    if (e instanceof GatewayError) { console.error("[custom-service-ai]", e.code, e.httpStatus); throw new Error(`The AI helper isn't available right now [${e.httpStatus ?? e.code}].`); }
    if (e instanceof SyntaxError) throw new Error("The AI helper couldn't finish. Try again or write it yourself.");
    throw e;
  }
}
