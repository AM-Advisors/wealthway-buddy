/**
 * One-time import of HubSpot Operations tickets (shared portal connection).
 * "Funds" pipeline tickets become real Fund records (exact same-name match → link;
 * known client → new draft fund in setup; anything uncertain → staff review).
 * "Additional Services & Queries" tickets become Operations service requests.
 * Never merges funds, never overwrites an existing fund, never opens a fund to investors.
 */
import { findFundMatches, type FundRef } from "@/lib/fund-integrity";
import { structureForFundType } from "@/lib/fund-setup-canonical";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const GW = "https://connector-gateway.lovable.dev/hubspot";
const V = "2026-09";
const path = {
  pipelines: () => `/crm/pipelines/${V}/tickets`,
  tickets: (after?: string) => `/crm/objects/${V}/tickets?limit=100&properties=subject,content,hs_pipeline,hs_pipeline_stage,createdate,hs_lastmodifieddate,hubspot_owner_id,hs_ticket_priority&associations=companies${after ? `&after=${after}` : ""}`,
  company: (id: string) => `/crm/objects/${V}/companies/${id}?properties=name`,
  owners: (after?: string) => `/crm/owners/${V}?limit=100${after ? `&after=${after}` : ""}`,
};
const FUNDS_PIPELINE = "0";

async function hs(p: string) {
  const lov = process.env["LOVABLE_API_KEY"], key = process.env["HUBSPOT_API_KEY"];
  if (!lov || !key) throw new Error("HubSpot isn't connected.");
  const res = await fetch(`${GW}${p}`, { headers: { Authorization: `Bearer ${lov}`, "X-Connection-Api-Key": key } });
  if (!res.ok) { const b = await res.text(); console.error(`HubSpot [${res.status}]: ${b}`); throw new Error(`HubSpot request failed [${res.status}]: ${b.slice(0, 300)}`); }
  return res.json() as Promise<any>;
}

const MANAGERS = ["super_admin", "admin", "operations", "executive"];
async function roles(userId: string) {
  const db = await admin();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}
async function requireViewer(context: any) {
  const { requireStaff } = await import("@/lib/fund-integrity.server");
  await requireStaff(context);
}
async function requireManager(userId: string) {
  if (!(await roles(userId)).some((r) => MANAGERS.includes(r))) throw new Error("Only Super Admins and Operations leads can import or resolve HubSpot tickets.");
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// Ticket subjects like "Client: Jane Doe" or "Fund name (Company)".
const fundNameFrom = (subject: string) => subject.replace(/^client:\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 180);

async function createDraftFund(db: any, actorId: string, clientId: string, name: string, ticketId: string) {
  const { assertFundIdentityFree } = await import("@/lib/fund-integrity.server");
  await assertFundIdentityFree({ name }, actorId);
  const fundType = /\bspv\b/i.test(name) ? "SPV" : "Venture Capital";
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 55) || "fund"}-${crypto.randomUUID().slice(0, 8)}`;
  const { seedFundFeeColumns } = await import("@/lib/fee-rates.server");
  const fees = await seedFundFeeColumns(db, clientId);
  // 506(b) and fund type are placeholders Operations confirms during setup — not filing decisions.
  const { data: off, error } = await db.from("offerings").insert({
    name, slug, client_id: clientId, fund_type: fundType, reg_type: "506b", is_open: false, public_page_enabled: false, ...fees,
  }).select("id").single();
  if (error || !off) throw new Error(error?.message ?? "Unable to create draft fund.");
  const offeringId = String(off.id);
  const { safeCreateSnapshot } = await import("@/lib/commercial-pricing.server");
  await safeCreateSnapshot({ offeringId, clientId, actorId, source: "fund_setup" } as any);
  const { bootstrapFundSetup } = await import("@/lib/fund-setup.server");
  await bootstrapFundSetup(actorId, { offeringId, clientId, structure: structureForFundType(fundType), displayName: name } as any);
  await db.from("offering_audit_events").insert({
    offering_id: offeringId, actor_id: actorId, event_type: "offering_created",
    changes: [{ field: "name", from: null, to: name }], summary: `Draft fund created from HubSpot ticket ${ticketId}`,
  });
  return offeringId;
}

export async function importOpsTickets(userId: string) {
  await requireManager(userId);
  const db = await admin();
  const { data: done } = await db.from("hubspot_ops_tickets").select("hubspot_id");
  const seen = new Set(((done ?? []) as any[]).map((r) => r.hubspot_id));

  const pipes = (await hs(path.pipelines())).results as any[];
  const stage = new Map<string, { pipeline: string; pipelineId: string; label: string; order: number; closed: boolean }>();
  for (const p of pipes) for (const s of p.stages ?? []) stage.set(`${p.id}:${s.id}`, { pipeline: p.label, pipelineId: String(p.id), label: String(s.label).trim(), order: Number(s.displayOrder), closed: s.metadata?.isClosed === "true" });

  const owners = new Map<string, string>();
  try { let after: string | undefined; for (let i = 0; i < 10; i++) { const j = await hs(path.owners(after)); for (const o of j.results ?? []) owners.set(String(o.id), [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email); after = j.paging?.next?.after; if (!after) break; } } catch (e) { console.warn("owners", e); }

  const [{ data: clients }, { data: funds }] = await Promise.all([
    db.from("clients").select("id, name, legal_name, dba_name").limit(5000),
    db.from("offerings").select("id,name,legal_entity_name").is("consolidated_into", null).limit(5000),
  ]);
  const clientByName = new Map<string, string>();
  for (const c of (clients ?? []) as any[]) for (const n of [c.name, c.legal_name, c.dba_name]) if (n) clientByName.set(norm(n), c.id);
  const fundRefs: FundRef[] = ((funds ?? []) as any[]).map((f) => ({ id: f.id, name: f.name, legalName: f.legal_entity_name }));
  const companyName = new Map<string, string>();

  const r = { tickets: 0, skipped: 0, linked: 0, created: 0, needsReview: 0, serviceRequests: 0 };
  let after: string | undefined;
  for (let page = 0; page < 50; page++) {
    const j = await hs(path.tickets(after));
    for (const t of j.results ?? []) {
      r.tickets++;
      if (seen.has(String(t.id))) { r.skipped++; continue; }
      const p = t.properties ?? {};
      const st = stage.get(`${p.hs_pipeline}:${p.hs_pipeline_stage}`);
      const compIds = [...new Set(((t.associations?.companies?.results ?? []) as any[]).map((a) => String(a.id)))].slice(0, 5);
      const names: string[] = [];
      for (const id of compIds) {
        if (!companyName.has(id)) { try { companyName.set(id, String((await hs(path.company(id))).properties?.name ?? "")); } catch { companyName.set(id, ""); } }
        const n = companyName.get(id); if (n) names.push(n);
      }
      const clientId = names.map((n) => clientByName.get(norm(n))).find(Boolean) ?? null;
      const subject = String(p.subject ?? "Untitled ticket").trim();
      const isFund = String(p.hs_pipeline) === FUNDS_PIPELINE;
      const row: any = {
        hubspot_id: String(t.id), pipeline_id: String(p.hs_pipeline ?? ""), pipeline_label: st?.pipeline ?? "Unknown pipeline",
        stage_id: p.hs_pipeline_stage ?? null, stage_label: st?.label ?? null, stage_order: st?.order ?? null, stage_closed: st?.closed ?? false,
        subject, content: p.content ?? null, priority: p.hs_ticket_priority ?? null, owner_name: p.hubspot_owner_id ? owners.get(String(p.hubspot_owner_id)) ?? null : null,
        company_names: names, hubspot_created_at: p.createdate ?? null, hubspot_updated_at: p.hs_lastmodifieddate ?? null,
        kind: isFund ? "fund" : "service_request", client_id: clientId, imported_by: userId,
      };
      if (!isFund) { row.status = "service_request"; r.serviceRequests++; }
      else {
        const name = fundNameFrom(subject);
        const matches = findFundMatches({ name }, fundRefs, null);
        const exact = matches.find((m) => m.kind === "same_name" || m.kind === "same_legal_name");
        if (exact) { row.status = "linked"; row.offering_id = exact.id; r.linked++; }
        else if (matches.some((m) => m.kind === "similar")) { row.status = "needs_review"; row.review_reason = `Similar to an existing fund ("${matches[0]!.name}")`; r.needsReview++; }
        else if (!clientId) { row.status = "needs_review"; row.review_reason = names.length ? `No client named ${names.join(", ")}` : "No company on the HubSpot ticket"; r.needsReview++; }
        else {
          try { row.offering_id = await createDraftFund(db, userId, clientId, name, String(t.id)); row.status = "created"; r.created++; fundRefs.push({ id: row.offering_id, name, legalName: null }); }
          catch (e) { row.status = "needs_review"; row.review_reason = String((e as Error).message).replace(/^EXISTING_FUND:[^:]+:|^SIMILAR_FUND:/, "").slice(0, 300); r.needsReview++; }
        }
      }
      const { error } = await db.from("hubspot_ops_tickets").insert(row);
      if (error) console.error("ticket insert", t.id, error.message);
    }
    after = j.paging?.next?.after;
    if (!after) break;
  }
  return r;
}

export async function listOpsTickets(context: any) {
  await requireViewer(context);
  const userId = context.userId as string;
  const db = await admin();
  const { data } = await db.from("hubspot_ops_tickets").select("*").order("stage_order", { ascending: true, nullsFirst: false }).order("hubspot_updated_at", { ascending: false }).limit(3000);
  const rows = (data ?? []) as any[];
  const ids = [...new Set(rows.flatMap((r) => [r.client_id, r.offering_id]).filter(Boolean))];
  const [{ data: cs }, { data: fs }] = await Promise.all([
    db.from("clients").select("id, name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    db.from("offerings").select("id, name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const cn = new Map(((cs ?? []) as any[]).map((c) => [c.id, c.name]));
  const fn = new Map(((fs ?? []) as any[]).map((f) => [f.id, f.name]));
  const canManage = (await roles(userId)).some((r) => MANAGERS.includes(r));
  const { data: allClients } = canManage ? await db.from("clients").select("id, name").order("name").limit(2000) : { data: [] };
  return {
    canManage, clients: (allClients ?? []) as { id: string; name: string }[],
    tickets: rows.map((r) => ({ ...r, client_name: r.client_id ? cn.get(r.client_id) ?? null : null, fund_name: r.offering_id ? fn.get(r.offering_id) ?? null : null })),
  };
}

export async function resolveOpsTicket(userId: string, d: { id: string; action: "create" | "link" | "dismiss"; clientId?: string | undefined; offeringId?: string | undefined; name?: string | undefined }) {
  await requireManager(userId);
  const db = await admin();
  const { data: t } = await db.from("hubspot_ops_tickets").select("*").eq("id", d.id).maybeSingle();
  if (!t || t.kind !== "fund" || t.status !== "needs_review") throw new Error("This ticket is not waiting for review.");
  const patch: any = { resolved_by: userId, resolved_at: new Date().toISOString(), review_reason: null };
  if (d.action === "dismiss") patch.status = "dismissed";
  else if (d.action === "link") {
    if (!d.offeringId) throw new Error("Pick a fund.");
    const { data: f } = await db.from("offerings").select("id, client_id").eq("id", d.offeringId).maybeSingle();
    if (!f) throw new Error("Fund not found.");
    Object.assign(patch, { status: "linked", offering_id: f.id, client_id: f.client_id ?? t.client_id });
  } else {
    const clientId = d.clientId ?? t.client_id;
    if (!clientId) throw new Error("Pick the client this fund belongs to.");
    const offeringId = await createDraftFund(db, userId, clientId, (d.name?.trim() || fundNameFrom(t.subject)).slice(0, 180), t.hubspot_id);
    Object.assign(patch, { status: "created", offering_id: offeringId, client_id: clientId });
  }
  const { error } = await db.from("hubspot_ops_tickets").update(patch).eq("id", d.id).eq("status", "needs_review");
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function searchFundsForLink(userId: string, q: string) {
  await requireManager(userId);
  const db = await admin();
  const { data } = await db.from("offerings").select("id, name").is("consolidated_into", null).ilike("name", `%${q.replace(/[%_]/g, "")}%`).limit(15);
  return (data ?? []) as { id: string; name: string }[];
}
