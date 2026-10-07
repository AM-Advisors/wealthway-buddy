/** Server-only quoting engine: rate-card quotes → approval → SOW/MSA drafts → signed. Never moves money. */
import { canDraftQuote, priceQuote, quoteApprovalProblem, type QuoteLineInput } from "@/lib/sales-model";
import { names, salesActor } from "@/lib/sales-hub.server";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
type Actor = Awaited<ReturnType<typeof salesActor>>;
const canSee = (a: Actor, ownerId: string) => a.visible === null || a.visible.includes(ownerId);

async function event(quoteId: string, ev: string, actorId: string | null, note?: string | null) {
  await (await admin()).from("sales_quote_events").insert({ quote_id: quoteId, event: ev, actor_id: actorId, note: note ?? null });
}

export async function quoteCatalog(userId: string, clientId: string | null) {
  await salesActor(userId);
  const { loadBaseline } = await import("@/lib/commercial-pricing.server");
  const { versionId, lines } = await loadBaseline(clientId);
  const db = await admin();
  const { data: clients } = await db.from("clients").select("id, legal_name").order("legal_name");
  const adminLevels = await adminCatalog();
  return { versionId, adminLevels, lines: [...adminLevels, ...lines].map((l: any) => ({ serviceKey: l.serviceKey, label: l.label, baselineCents: l.baselineCents, source: l.baselineSource, pricingModel: l.pricingModel })), clients: (clients ?? []) as any[] };
}

/** Administration levels as quote lines, keyed by product + level, from current pricing versions. */
async function adminCatalog() {
  const { SERVICE_LADDERS, adminQuoteKey, isLadderProduct } = await import("@/lib/service-ladders");
  const db = await admin();
  const { data } = await db.from("service_pricing_versions").select("service_product, service_level, annual_price, starting_price").eq("is_current", true);
  const { spvTxnQuoteKey } = await import("@/lib/spv-transaction-pricing");
  const { data: bands } = await db.from("spv_transaction_pricing").select("id, label, fee_usd").eq("is_current", true).order("sort_order");
  const txn = ((bands ?? []) as any[]).filter((b) => b.fee_usd != null).map((b) => ({ serviceKey: spvTxnQuoteKey(b.id), label: `SPV Administration — raise ${b.label}`, baselineCents: Math.round(Number(b.fee_usd) * 100), baselineSource: "spv_transaction_pricing", pricingModel: "one_time" }));
  return [...txn, ...((data ?? []) as any[]).filter((p) => isLadderProduct(p.service_product)).flatMap((p) => {
    const lv = SERVICE_LADDERS[p.service_product as "SPV_ADMINISTRATION"].levels.find((l) => l.level === p.service_level);
    if (!lv) return [];
    const cents = Math.round(Number(p.annual_price ?? p.starting_price ?? 0) * 100);
    return [{ serviceKey: adminQuoteKey(p.service_product, p.service_level), label: `${lv.name} (annual)`, baselineCents: cents, baselineSource: "service_pricing", pricingModel: "annual", product: p.service_product, level: p.service_level }];
  })];
}

/** Called after a client signs an SOW: mark its sent quote signed and hand off. */
export async function syncQuotesForSow(sowId: string) {
  const { data } = await (await admin()).from("sales_quotes").select("*").eq("sow_id", sowId).in("status", ["sent", "signed"]);
  await syncFromAgreements((data ?? []) as any[]);
}

/** Pull SOW signature/execution back onto the quote so status is never stale. */
async function syncFromAgreements(quotes: any[]) {
  const sowIds = quotes.filter((q) => q.sow_id && q.status === "sent").map((q) => q.sow_id);
  if (!sowIds.length) return quotes;
  const db = await admin();
  const { data: sows } = await db.from("client_sows").select("id, executed_at, client_signed_at").in("id", sowIds);
  const signed = new Map(((sows ?? []) as any[]).filter((s) => s.executed_at || s.client_signed_at).map((s) => [s.id, s.executed_at ?? s.client_signed_at]));
  for (const q of quotes) {
    const at = signed.get(q.sow_id);
    if (!at) continue;
    await db.from("sales_quotes").update({ status: "signed", signed_at: at, updated_at: new Date().toISOString() }).eq("id", q.id).eq("status", "sent");
    await event(q.id, "signed", null, "Client signed the SOW");
    if (q.deal_id) {
      await db.from("crm_deals").update({ sales_stage: "contract_won", stage: "won", stage_changed_at: at, amount_cents: q.total_cents }).eq("id", q.deal_id);
      await db.from("sales_stage_events").insert({ deal_id: q.deal_id, from_stage: "contract_sent", to_stage: "contract_won", note: "SOW signed", actor_id: q.owner_user_id });
    }
    q.status = "signed"; q.signed_at = at;
  }
  const { handoffSignedQuote } = await import("@/lib/sales-handoff.server");
  for (const q of quotes) if (q.status === "signed" && !q.onboarded_at) await handoffSignedQuote(q.id);
  return quotes;
}

export async function listQuotes(userId: string) {
  const a = await salesActor(userId);
  const db = await admin();
  let q = db.from("sales_quotes").select("*").order("created_at", { ascending: false }).limit(500);
  if (a.visible) q = q.in("owner_user_id", a.visible);
  const rows = await syncFromAgreements(((await q).data ?? []) as any[]);
  const nm = await names(rows.map((r) => r.owner_user_id));
  const cids = [...new Set(rows.map((r) => r.client_id).filter(Boolean))];
  const clients = cids.length ? ((await db.from("clients").select("id, legal_name").in("id", cids)).data ?? []) as any[] : [];
  const cn = new Map(clients.map((c) => [c.id, c.legal_name]));
  return { canDraft: canDraftQuote(a.roles), quotes: rows.map((r) => ({ ...r, ownerName: nm.get(r.owner_user_id) ?? "", clientName: cn.get(r.client_id) ?? null })) };
}

export async function getQuote(userId: string, id: string) {
  const a = await salesActor(userId);
  const db = await admin();
  const { data: q } = await db.from("sales_quotes").select("*").eq("id", id).maybeSingle();
  if (!q || !canSee(a, q.owner_user_id)) throw new Error("Quote not found.");
  await syncFromAgreements([q]);
  const [{ data: lines }, { data: events }, versions] = await Promise.all([
    db.from("sales_quote_lines").select("*").eq("quote_id", id).order("sort_order"),
    db.from("sales_quote_events").select("*").eq("quote_id", id).order("created_at"),
    db.from("sales_quotes").select("id, version, status, total_cents, created_at").or(`id.eq.${q.supersedes_id ?? id},supersedes_id.eq.${id}`),
  ]);
  const nm = await names([q.owner_user_id, q.created_by, q.approved_by, ...((events ?? []) as any[]).map((e) => e.actor_id)]);
  const client = q.client_id ? (await db.from("clients").select("id, legal_name").eq("id", q.client_id).maybeSingle()).data : null;
  const contact = q.contact_id ? (await db.from("crm_contacts").select("id, full_name, email, organization").eq("id", q.contact_id).maybeSingle()).data : null;
  const approval = quoteApprovalProblem({ actorId: userId, actorRoles: a.roles, createdBy: q.created_by, needsExec: q.needs_exec_approval });
  return {
    quote: q, lines: (lines ?? []) as any[], client, contact, versions: (versions.data ?? []) as any[],
    events: ((events ?? []) as any[]).map((e) => ({ ...e, actorName: e.actor_id ? nm.get(e.actor_id) ?? "Team member" : "System" })),
    ownerName: nm.get(q.owner_user_id) ?? "", approvedByName: q.approved_by ? nm.get(q.approved_by) ?? "" : null,
    canApprove: q.status === "pending_approval" && approval === null, approvalBlocker: approval,
    canEdit: ["draft", "rejected"].includes(q.status) && (q.owner_user_id === userId || a.scope !== "own"),
  };
}

export async function saveQuote(userId: string, d: { id?: string | null | undefined; title: string; clientId?: string | null | undefined; contactId?: string | null | undefined; dealId?: string | null | undefined; validUntil?: string | null | undefined; notes?: string | null | undefined; lines: QuoteLineInput[] }) {
  const a = await salesActor(userId);
  if (!canDraftQuote(a.roles)) throw new Error("Your role can't draft quotes.");
  if (!d.lines.length) throw new Error("Add at least one service.");
  const { loadBaseline } = await import("@/lib/commercial-pricing.server");
  const base = await loadBaseline(d.clientId ?? null);
  const card = new Map([...base.lines, ...(await adminCatalog())].map((l: any) => [l.serviceKey, l]));
  const unknown = d.lines.find((l) => !card.has(l.serviceKey));
  if (unknown) throw new Error(`"${unknown.label || unknown.serviceKey}" isn't on the current rate card.`);
  // Baseline and label always come from the live rate card, never from the browser.
  const priced = priceQuote(d.lines.map((l) => { const c: any = card.get(l.serviceKey); return { serviceKey: l.serviceKey, label: c.label, quantity: Math.max(0, Number(l.quantity) || 0), unitCents: Math.max(0, Math.round(l.unitCents)), baselineUnitCents: c.baselineCents }; }));
  const db = await admin();
  const now = new Date().toISOString();
  let id = d.id ?? null;
  const row = { title: d.title.trim() || "Quote", client_id: d.clientId || null, contact_id: d.contactId || null, deal_id: d.dealId || null,
    valid_until: d.validUntil || null, notes: d.notes || null, total_cents: priced.totalCents, baseline_cents: priced.baselineCents,
    needs_exec_approval: priced.needsExecApproval, pricing_version_id: base.versionId, updated_at: now };
  if (id) {
    const { data: q } = await db.from("sales_quotes").select("*").eq("id", id).maybeSingle();
    if (!q || !canSee(a, q.owner_user_id) || !["draft", "rejected"].includes(q.status)) throw new Error("Only draft quotes can be edited. Create a new version instead.");
    await db.from("sales_quotes").update({ ...row, status: "draft" }).eq("id", id);
    await db.from("sales_quote_lines").delete().eq("quote_id", id);
    await event(id, "edited", userId);
  } else {
    const { data: q, error } = await db.from("sales_quotes").insert({ ...row, owner_user_id: userId, created_by: userId }).select("id").single();
    if (error) throw new Error("Couldn't create the quote.");
    id = q.id as string;
    await event(id, "created", userId);
  }
  await db.from("sales_quote_lines").insert(priced.lines.map((l, i) => ({ quote_id: id, service_key: l.serviceKey, label: l.label, quantity: l.quantity, unit_cents: l.unitCents, baseline_unit_cents: l.baselineUnitCents, line_cents: l.lineCents, sort_order: i })));
  return { id };
}

export async function submitQuote(userId: string, id: string) {
  const a = await salesActor(userId);
  const db = await admin();
  const { data: q } = await db.from("sales_quotes").select("*").eq("id", id).maybeSingle();
  if (!q || !canSee(a, q.owner_user_id) || !["draft", "rejected"].includes(q.status)) throw new Error("This quote can't be submitted.");
  if (!q.client_id) throw new Error("Choose the client before submitting for approval.");
  await db.from("sales_quotes").update({ status: "pending_approval", updated_at: new Date().toISOString() }).eq("id", id);
  await event(id, "submitted", userId, q.needs_exec_approval ? "Below baseline: needs CEO or CRO" : "Needs Sales Manager approval");
  return { ok: true };
}

export async function decideQuote(userId: string, d: { id: string; approve: boolean; note?: string | null  | undefined}) {
  const a = await salesActor(userId);
  const db = await admin();
  const { data: q } = await db.from("sales_quotes").select("*").eq("id", d.id).maybeSingle();
  if (!q || q.status !== "pending_approval") throw new Error("This quote isn't awaiting approval.");
  const problem = quoteApprovalProblem({ actorId: userId, actorRoles: a.roles, createdBy: q.created_by === userId && d.approve && quoteApprovalProblem({ actorId: userId, actorRoles: a.roles, createdBy: "", needsExec: q.needs_exec_approval }) === null && (await (await import("@/lib/self-approval.server")).selfApprove(userId, "sales_quote", [q.id])) ? "" : q.created_by, needsExec: q.needs_exec_approval });
  if (problem) throw new Error(problem);
  if (!d.approve && !d.note?.trim()) throw new Error("Say what needs to change.");
  const now = new Date().toISOString();
  const { data: done } = await db.from("sales_quotes").update(d.approve ? { status: "approved", approved_by: userId, approved_at: now, decision_note: d.note ?? null, updated_at: now } : { status: "rejected", decision_note: d.note, updated_at: now })
    .eq("id", q.id).eq("status", "pending_approval").select("id");
  if (!done?.length) throw new Error("Someone else already decided this quote.");
  await event(q.id, d.approve ? "approved" : "changes_requested", userId, d.note ?? null);
  return { ok: true };
}

/** Approved quote → SOW draft (+ MSA draft when the client has none), handed to the existing agreement review/sign flow. */
export async function createAgreements(userId: string, id: string) {
  const a = await salesActor(userId);
  const db = await admin();
  const { data: q } = await db.from("sales_quotes").select("*").eq("id", id).maybeSingle();
  if (!q || !canSee(a, q.owner_user_id) || q.status !== "approved") throw new Error("Only approved quotes can become agreements.");
  return draftAgreements(userId, q);
}

/** Creates the SOW/MSA drafts for an approved quote (idempotent). Caller has already checked visibility/status. */
async function draftAgreements(userId: string, q: any) {
  const db = await admin();
  if (q.sow_id) return { sowId: q.sow_id as string };
  const { data: lines } = await db.from("sales_quote_lines").select("*").eq("quote_id", q.id).order("sort_order");
  let msaId: string | null = null;
  const { data: msas } = await db.from("client_msa_agreements").select("id, executed_at, status").eq("client_id", q.client_id).order("created_at", { ascending: false });
  const existing = ((msas ?? []) as any[])[0];
  const { data: msaVersion } = await db.from("msa_versions").select("id").eq("status", "published").order("effective_date", { ascending: false }).limit(1).maybeSingle();
  if (existing) msaId = existing.id;
  else if (msaVersion) {
    const { data: m } = await db.from("client_msa_agreements").insert({ client_id: q.client_id, msa_version_id: msaVersion.id, status: "in_review" }).select("id").single();
    msaId = m?.id ?? null;
  }
  const { data: sow, error } = await db.from("client_sows").insert({
    client_id: q.client_id, title: q.title, sow_type: "services", status: "draft", stage: "draft", created_by: userId,
    msa_version_id: msaVersion?.id ?? null, notes: `Created from Sales quote Q-${q.quote_number} v${q.version}`,
    generated_lines: ((lines ?? []) as any[]).map((l) => ({ service_key: l.service_key, label: l.label, quantity: Number(l.quantity), unit_cents: Number(l.unit_cents), amount_cents: Number(l.line_cents) })),
  }).select("id").single();
  if (error) { console.error("SOW draft failed", error); throw new Error("Couldn't create the SOW draft."); }
  await db.from("sales_quotes").update({ sow_id: sow.id, msa_id: msaId, updated_at: new Date().toISOString() }).eq("id", q.id);
  await event(q.id, "agreements_drafted", userId, msaId && !existing ? "SOW and MSA drafted" : "SOW drafted");
  return { sowId: sow.id as string };
}

/** Marks the quote sent once Operations has sent the SOW for signature through the agreements flow. */
export async function markSent(userId: string, id: string) {
  const a = await salesActor(userId);
  const db = await admin();
  const { data: q } = await db.from("sales_quotes").select("*").eq("id", id).maybeSingle();
  if (!q || !canSee(a, q.owner_user_id) || q.status !== "approved") throw new Error("Only approved quotes can be sent.");
  // No SOW yet: draft one from this quote so the agreement always matches what was quoted.
  if (!q.sow_id) await draftAgreements(userId, q);
  const now = new Date().toISOString();
  await db.from("sales_quotes").update({ status: "sent", sent_at: now, updated_at: now }).eq("id", id);
  await event(id, "sent", userId);
  if (q.deal_id) {
    await db.from("crm_deals").update({ sales_stage: "contract_sent", stage: "committed", stage_changed_at: now, amount_cents: q.total_cents }).eq("id", q.deal_id);
    await db.from("sales_stage_events").insert({ deal_id: q.deal_id, to_stage: "contract_sent", note: `Quote Q-${q.quote_number} sent`, actor_id: userId });
  }
  return { ok: true };
}

export async function newVersion(userId: string, id: string) {
  const a = await salesActor(userId);
  if (!canDraftQuote(a.roles)) throw new Error("Your role can't draft quotes.");
  const db = await admin();
  const { data: q } = await db.from("sales_quotes").select("*").eq("id", id).maybeSingle();
  if (!q || !canSee(a, q.owner_user_id) || ["signed", "superseded"].includes(q.status)) throw new Error("This quote can't be revised.");
  const { data: lines } = await db.from("sales_quote_lines").select("*").eq("quote_id", id).order("sort_order");
  const { id: newId } = await saveQuote(userId, { title: q.title, clientId: q.client_id, contactId: q.contact_id, dealId: q.deal_id, validUntil: q.valid_until, notes: q.notes,
    lines: ((lines ?? []) as any[]).map((l) => ({ serviceKey: l.service_key, label: l.label, quantity: Number(l.quantity), unitCents: Number(l.unit_cents), baselineUnitCents: Number(l.baseline_unit_cents) })) });
  await db.from("sales_quotes").update({ version: q.version + 1, supersedes_id: q.id, owner_user_id: q.owner_user_id }).eq("id", newId);
  await db.from("sales_quotes").update({ status: "superseded", updated_at: new Date().toISOString() }).eq("id", q.id);
  await event(q.id, "superseded", userId, `Replaced by version ${q.version + 1}`);
  return { id: newId };
}

export async function markLost(userId: string, d: { id: string; reason: string }) {
  const a = await salesActor(userId);
  if (!d.reason.trim()) throw new Error("Add the reason this was lost.");
  const db = await admin();
  const { data: q } = await db.from("sales_quotes").select("*").eq("id", d.id).maybeSingle();
  if (!q || !canSee(a, q.owner_user_id) || ["signed", "superseded", "lost"].includes(q.status)) throw new Error("This quote can't be marked lost.");
  await db.from("sales_quotes").update({ status: "lost", decision_note: d.reason, updated_at: new Date().toISOString() }).eq("id", q.id);
  await event(q.id, "lost", userId, d.reason);
  if (q.deal_id) {
    await db.from("crm_deals").update({ sales_stage: "contract_lost", stage: "lost", lost_reason: d.reason, stage_changed_at: new Date().toISOString() }).eq("id", q.deal_id);
    await db.from("sales_stage_events").insert({ deal_id: q.deal_id, to_stage: "contract_lost", loss_reason: d.reason, actor_id: userId });
  }
  return { ok: true };
}

/** SOWs a quote can be drafted from (client-scoped). */
export async function sowsForQuote(userId: string, clientId: string) {
  await salesActor(userId);
  const db = await admin();
  const { data } = await db.from("client_sows").select("id, title, status, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(50);
  return (data ?? []) as any[];
}

/** Draft a quote from an existing SOW's services, re-priced against the live rate card. */
export async function quoteFromSow(userId: string, sowId: string) {
  const db = await admin();
  const { data: sow } = await db.from("client_sows").select("id, client_id, title, generated_lines").eq("id", sowId).maybeSingle();
  if (!sow) throw new Error("SOW not found.");
  const { loadBaseline } = await import("@/lib/commercial-pricing.server");
  const card = new Map((await loadBaseline(sow.client_id)).lines.map((l: any) => [l.serviceKey, l]));
  const src = Array.isArray(sow.generated_lines) ? (sow.generated_lines as any[]) : [];
  const lines = src.map((l) => {
    const key = l.service_key ?? l.serviceKey ?? l.key; const c: any = card.get(key);
    if (!c) return null;
    const qty = Number(l.quantity ?? 1) || 1;
    const unit = Number(l.unit_cents ?? l.unitCents ?? (l.amount_cents != null ? Number(l.amount_cents) / qty : c.baselineCents));
    return { serviceKey: key, label: c.label, quantity: qty, unitCents: Math.round(unit), baselineUnitCents: c.baselineCents };
  }).filter(Boolean) as QuoteLineInput[];
  if (!lines.length) throw new Error("This SOW has no services that match the current rate card.");
  const r = await saveQuote(userId, { title: `${sow.title ?? "SOW"} quote`, clientId: sow.client_id, notes: `Drafted from SOW "${sow.title ?? sow.id}"`, lines });
  await event(r.id, "drafted_from_sow", userId, sow.title ?? null);
  return r;
}
