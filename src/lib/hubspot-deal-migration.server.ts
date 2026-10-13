/**
 * Server-only HubSpot deal migration. Reads HubSpot (portal Service Key, read
 * requests only — GET plus POST search/batch-read, which change nothing) and writes
 * only Harmonious tables. Runs in small resumable batches; every run, batch
 * and error is recorded in hubspot_deal_migration_runs.
 */
import {
  ENGAGEMENT_PROPS, ENGAGEMENT_TYPES, type EngagementType, defaultStageFor, editedInHarmonious,
  parseAmount, parseDate, reconcileLine, reconciled, snippet,
} from "@/lib/hubspot-deal-migration";

const GATEWAY = "https://connector-gateway.lovable.dev/hubspot";
const V = "2026-03";
const BATCH = 20;
const P = {
  pipelines: `/crm/pipelines/${V}/deals`,
  properties: `/crm/properties/${V}/deals`,
  owners: (archived: boolean, after?: string) => `/crm/owners/${V}?limit=500&archived=${archived}${after ? `&after=${after}` : ""}`,
  list: (archived: boolean, after?: string, props = "hs_object_id") =>
    `/crm/objects/${V}/deals?limit=${BATCH}&archived=${archived}&properties=${props}&associations=contacts,companies,${ENGAGEMENT_TYPES.join(",")}${after ? `&after=${after}` : ""}`,
  one: (id: string) => `/crm/objects/${V}/deals/${id}?associations=contacts,companies,${ENGAGEMENT_TYPES.join(",")}`,
  assoc: (id: string, to: string, after?: string) => `/crm/objects/${V}/deals/${id}/associations/${to}?limit=500${after ? `&after=${after}` : ""}`,
  batchRead: (type: string) => `/crm/objects/${V}/${type}/batch/read`,
  search: `/crm/objects/${V}/deals/search`,
};

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

async function hs(path: string, init?: { method: "POST"; body: unknown }) {
  const lov = process.env["LOVABLE_API_KEY"], key = process.env["HUBSPOT_API_KEY"];
  if (!lov || !key) throw new Error("The HubSpot portal connection isn't available.");
  const res = await fetch(GATEWAY + path, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${lov}`, "X-Connection-Api-Key": key, "Content-Type": "application/json" },
    body: init ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok && res.status !== 207) {
    const t = await res.text();
    console.error(`HubSpot ${path} failed [${res.status}]: ${t}`);
    throw new Error(`HubSpot request failed [${res.status}]: ${t.slice(0, 300)}`);
  }
  return res.json() as Promise<any>;
}

export async function requireMigrator(userId: string) {
  const db = await admin();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId).in("role", ["super_admin", "sales_management"]);
  if (!(data ?? []).length) throw new Error("Only a Super Admin or Sales management can run the HubSpot deal migration.");
  return db;
}

/* ---------------- reference data ---------------- */

async function refreshStageMap(db: any) {
  const j = await hs(P.pipelines);
  const { data: existing } = await db.from("hubspot_stage_map").select("hs_pipeline_id, hs_stage_id, harmonious_stage");
  const keep = new Map((existing ?? []).map((r: any) => [`${r.hs_pipeline_id}|${r.hs_stage_id}`, r.harmonious_stage]));
  const rows: any[] = [];
  for (const p of j.results ?? []) for (const s of p.stages ?? []) {
    const isClosed = String(s.metadata?.isClosed) === "true";
    const prob = s.metadata?.probability != null ? Number(s.metadata.probability) : null;
    rows.push({
      hs_pipeline_id: p.id, hs_stage_id: s.id, pipeline_label: p.label, stage_label: s.label, display_order: s.displayOrder ?? null,
      is_closed: isClosed, probability: prob,
      harmonious_stage: keep.get(`${p.id}|${s.id}`) ?? defaultStageFor({ pipelineId: p.id, stageId: s.id, isClosed, probability: prob, label: s.label }),
      updated_at: new Date().toISOString(),
    });
  }
  if (rows.length) await db.from("hubspot_stage_map").upsert(rows, { onConflict: "hs_pipeline_id,hs_stage_id" });
  return new Map(rows.map((r) => [`${r.hs_pipeline_id}|${r.hs_stage_id}`, r]));
}

async function ownerDirectory(db: any) {
  const owners = new Map<string, { email: string | null; name: string }>();
  for (const archived of [false, true]) {
    let after: string | undefined;
    do {
      const j = await hs(P.owners(archived, after));
      for (const o of j.results ?? []) owners.set(String(o.id), { email: o.email ?? null, name: [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email || `Owner ${o.id}` });
      after = j.paging?.next?.after;
    } while (after);
  }
  const emails = [...new Set([...owners.values()].map((o) => o.email?.toLowerCase()).filter(Boolean))] as string[];
  const { data: profs } = emails.length ? await db.from("profiles").select("user_id, email").in("email", emails) : { data: [] };
  const userByEmail = new Map((profs ?? []).map((p: any) => [String(p.email).toLowerCase(), p.user_id as string]));
  return { owners, userByEmail };
}

async function allDealPropertyNames() {
  const j = await hs(P.properties);
  return (j.results ?? []).map((p: any) => String(p.name));
}

/* ---------------- runs ---------------- */

export async function startRun(userId: string, kind: "initial" | "incremental") {
  const db = await requireMigrator(userId);
  const { data: open } = await db.from("hubspot_deal_migration_runs").select("id").eq("status", "running").limit(1);
  if (open?.length) throw new Error("A migration run is already in progress. Continue or finish it first.");
  let since: string | null = null;
  if (kind === "incremental") {
    const { data: last } = await db.from("hubspot_deal_migration_runs").select("started_at").eq("status", "completed").order("started_at", { ascending: false }).limit(1);
    if (!last?.length) throw new Error("Run the initial import first.");
    since = new Date(new Date(last[0].started_at).getTime() - 10 * 60 * 1000).toISOString(); // 10-minute overlap
  }
  const { data, error } = await db.from("hubspot_deal_migration_runs").insert({ kind, started_by: userId, since, phase: kind === "initial" ? "active" : "changed" }).select("*").single();
  if (error) throw error;
  return data;
}

type Counts = Record<string, number>;
const bump = (c: Counts, k: string, n = 1) => { c[k] = (c[k] ?? 0) + n; };

/** Process one batch of a running run. Call repeatedly until status is not "running". */
export async function runBatch(userId: string, runId: string) {
  const db = await requireMigrator(userId);
  const { data: run } = await db.from("hubspot_deal_migration_runs").select("*").eq("id", runId).maybeSingle();
  if (!run) throw new Error("Run not found.");
  if (run.status !== "running") return run;
  const counts: Counts = { ...(run.counts ?? {}) };
  const errors: any[] = [...(run.errors ?? [])];
  try {
    const stageMap = await refreshStageMap(db);
    const dir = await ownerDirectory(db);
    const propNames = await allDealPropertyNames();
    let deals: any[] = [];
    let next: string | undefined;
    if (run.phase === "changed") {
      const j = await hs(P.search, { method: "POST", body: {
        filterGroups: [{ filters: [{ propertyName: "hs_lastmodifieddate", operator: "GTE", value: run.since }] }],
        sorts: [{ propertyName: "hs_lastmodifieddate", direction: "ASCENDING" }], properties: ["hs_object_id"], limit: BATCH, after: run.cursor ?? undefined,
      } });
      for (const d of j.results ?? []) deals.push(await hs(P.one(String(d.id))));
      next = j.paging?.next?.after;
    } else {
      const j = await hs(P.list(run.phase === "archived", run.cursor ?? undefined));
      deals = j.results ?? [];
      next = j.paging?.next?.after;
    }
    // Full properties for these deals (preserves every field, mapped or not).
    const full = new Map<string, any>();
    if (deals.length) {
      const j = await hs(P.batchRead("deals"), { method: "POST", body: { inputs: deals.map((d) => ({ id: String(d.id) })), properties: propNames, archived: run.phase === "archived" } });
      for (const r of j.results ?? []) full.set(String(r.id), r);
      for (const e of j.errors ?? []) errors.push({ at: new Date().toISOString(), kind: "read", ids: e.context?.ids, message: e.message });
    }
    await processDeals(db, userId, run, deals, full, stageMap, dir, counts, errors);
    const patch: any = { counts, errors: errors.slice(-500), batches: (run.batches ?? 0) + 1, cursor: next ?? null };
    if (!next) {
      if (run.phase === "active") { patch.phase = "archived"; patch.cursor = null; }
      else { patch.status = "completed"; patch.finished_at = new Date().toISOString(); }
    }
    const { data: updated } = await db.from("hubspot_deal_migration_runs").update(patch).eq("id", runId).select("*").single();
    return updated;
  } catch (e) {
    errors.push({ at: new Date().toISOString(), kind: "batch", message: e instanceof Error ? e.message : String(e) });
    const { data: updated } = await db.from("hubspot_deal_migration_runs").update({ counts, errors: errors.slice(-500) }).eq("id", runId).select("*").single();
    return { ...updated, lastBatchFailed: true };
  }
}

export async function stopRun(userId: string, runId: string) {
  const db = await requireMigrator(userId);
  await db.from("hubspot_deal_migration_runs").update({ status: "failed", finished_at: new Date().toISOString() }).eq("id", runId).eq("status", "running");
  return { ok: true };
}

async function fullAssoc(deal: any, type: string): Promise<{ id: string; types: string[] }[]> {
  const a = deal.associations?.[type];
  let rows: any[] = a?.results ?? [];
  if (a?.paging?.next?.after) {
    rows = [];
    let after: string | undefined;
    do {
      const j = await hs(P.assoc(String(deal.id), type, after));
      rows.push(...(j.results ?? []).map((r: any) => ({ id: r.toObjectId ?? r.id, type: (r.associationTypes ?? []).map((t: any) => t.label ?? t.typeId).join(",") || "default" })));
      after = j.paging?.next?.after;
    } while (after);
  }
  const by = new Map<string, Set<string>>();
  for (const r of rows) { const id = String(r.id); if (!by.has(id)) by.set(id, new Set()); by.get(id)!.add(String(r.type ?? "default")); }
  return [...by.entries()].map(([id, t]) => ({ id, types: [...t] }));
}

async function batchRead(type: string, ids: string[], props: string[]) {
  const out = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 100) {
    const j = await hs(P.batchRead(type), { method: "POST", body: { inputs: ids.slice(i, i + 100).map((id) => ({ id })), properties: props } });
    for (const r of j.results ?? []) out.set(String(r.id), r);
  }
  return out;
}

async function processDeals(db: any, userId: string, run: any, deals: any[], full: Map<string, any>, stageMap: Map<string, any>, dir: Awaited<ReturnType<typeof ownerDirectory>>, counts: Counts, errors: any[]) {
  if (!deals.length) return;
  const assocs = new Map<string, Record<string, { id: string; types: string[] }[]>>();
  for (const d of deals) {
    const a: Record<string, { id: string; types: string[] }[]> = {};
    for (const t of ["contacts", "companies", ...ENGAGEMENT_TYPES]) a[t] = await fullAssoc(d, t);
    assocs.set(String(d.id), a);
  }
  const all = (t: string) => [...new Set([...assocs.values()].flatMap((a) => (a[t] ?? []).map((x) => x.id)))];

  // Contacts: map to existing Harmonious contacts; create any that are missing.
  const contactIds = all("contacts");
  const contactMap = new Map<string, string>();
  for (let i = 0; i < contactIds.length; i += 200) {
    const { data } = await db.from("crm_contacts").select("id, external_id").eq("external_source", "hubspot").in("external_id", contactIds.slice(i, i + 200));
    for (const r of data ?? []) contactMap.set(String(r.external_id), r.id);
  }
  const missing = contactIds.filter((id) => !contactMap.has(id));
  if (missing.length) {
    const got = await batchRead("contacts", missing, ["email", "firstname", "lastname", "phone", "company", "jobtitle", "hs_email_optout"]);
    for (const id of missing) {
      const p = got.get(id)?.properties;
      if (!p) { errors.push({ at: new Date().toISOString(), kind: "contact_missing", hubspotContactId: id, message: "Linked contact no longer exists in HubSpot" }); continue; }
      const name = [p.firstname, p.lastname].filter(Boolean).join(" ").trim() || p.email || `HubSpot contact ${id}`;
      const optOut = String(p.hs_email_optout) === "true";
      const { data: ins, error } = await db.from("crm_contacts").insert({
        scope: "harmonious", owner_user_id: userId, created_by: userId, full_name: name.slice(0, 200), email: p.email || null, phone: p.phone || null,
        organization: p.company || null, title: p.jobtitle || null, source: "HubSpot", tags: ["hubspot"], consent: optOut ? "unsubscribed" : "unknown",
        external_source: "hubspot", external_id: id,
      }).select("id").single();
      if (error) { errors.push({ at: new Date().toISOString(), kind: "contact_create", hubspotContactId: id, message: error.message }); continue; }
      contactMap.set(id, ins.id); bump(counts, "contacts_created");
    }
  }
  const companies = await batchRead("companies", all("companies"), ["name", "domain"]);
  const engagements = new Map<EngagementType, Map<string, any>>();
  for (const t of ENGAGEMENT_TYPES) engagements.set(t, await batchRead(t, all(t), ENGAGEMENT_PROPS[t].props));

  for (const d of deals) {
    const id = String(d.id);
    const rec = full.get(id) ?? d;
    const p = rec.properties ?? {};
    const a = assocs.get(id)!;
    try {
      const stage = stageMap.get(`${p.pipeline}|${p.dealstage}`);
      if (!stage) errors.push({ at: new Date().toISOString(), kind: "stage_unmapped", hubspotDealId: id, message: `Stage ${p.dealstage} in pipeline ${p.pipeline} not found; kept as Lead with original stage preserved` });
      const amt = parseAmount(p.amount);
      if (amt.issue) errors.push({ at: new Date().toISOString(), kind: "amount", hubspotDealId: id, message: amt.issue });
      const owner = p.hubspot_owner_id ? dir.owners.get(String(p.hubspot_owner_id)) : undefined;
      const ownerUser = owner?.email ? dir.userByEmail.get(owner.email.toLowerCase()) : undefined;
      if (p.hubspot_owner_id && !ownerUser) bump(counts, "owner_unmatched");
      const primary = a["contacts"]?.map((c) => contactMap.get(c.id)).find(Boolean) ?? null;
      const now = new Date().toISOString();
      const hsFields = {
        hs_pipeline_id: p.pipeline ?? null, hs_pipeline_label: stage?.pipeline_label ?? null, hs_stage_id: p.dealstage ?? null, hs_stage_label: stage?.stage_label ?? null,
        hs_owner_id: p.hubspot_owner_id ?? null, hs_owner_email: owner?.email ?? null, hs_owner_name: owner?.name ?? null,
        hs_amount_raw: p.amount ?? null, hs_currency: p.deal_currency_code ?? null, hs_archived: run.phase === "archived" || !!rec.archived,
        source_created_at: parseDate(p.createdate ?? rec.createdAt), source_updated_at: parseDate(p.hs_lastmodifieddate ?? rec.updatedAt), source_closed_at: parseDate(p.closedate),
        source_properties: p, company_names: (a["companies"] ?? []).map((c) => companies.get(c.id)?.properties?.name).filter(Boolean),
        last_imported_at: now, updated_at: now,
      };
      const core = {
        title: String(p.dealname || `HubSpot deal ${id}`).slice(0, 200), stage: stage?.harmonious_stage ?? "lead",
        amount_cents: amt.cents, expected_close: p.closedate ? String(p.closedate).slice(0, 10) : null, contact_id: primary,
        stage_changed_at: parseDate(p.hs_date_entered_current_stage ?? p.hs_lastmodifieddate),
        ...(ownerUser ? { owner_user_id: ownerUser } : {}),
      };
      const { data: ex } = await db.from("crm_deals").select("id, updated_at, last_imported_at").eq("external_source", "hubspot").eq("external_id", id).maybeSingle();
      let dealId: string;
      if (ex) {
        if (editedInHarmonious(ex)) {
          await db.from("crm_deals").update(hsFields).eq("id", ex.id);
          errors.push({ at: now, kind: "conflict", hubspotDealId: id, message: "Changed in Harmonious since the last import; HubSpot values saved alongside, Harmonious values kept" });
          bump(counts, "deals_conflict");
        } else {
          await db.from("crm_deals").update({ ...core, ...hsFields }).eq("id", ex.id);
          bump(counts, "deals_updated");
        }
        dealId = ex.id;
      } else {
        const { data: ins, error } = await db.from("crm_deals").insert({
          ...core, ...hsFields, scope: "harmonious", owner_user_id: ownerUser ?? userId, created_by: userId,
          connected_via: "hubspot", external_source: "hubspot", external_id: id, created_at: hsFields.source_created_at ?? now,
          archived_at: hsFields.hs_archived ? (parseDate(rec.archivedAt) ?? now) : null,
        }).select("id").single();
        if (error) { errors.push({ at: now, kind: "deal_insert", hubspotDealId: id, message: error.message }); bump(counts, "deals_failed"); continue; }
        dealId = ins.id; bump(counts, "deals_created");
      }
      const assocRows = [
        ...(a["contacts"] ?? []).map((c) => ({ deal_id: dealId, object_type: "contact", external_id: c.id, association_types: c.types, crm_contact_id: contactMap.get(c.id) ?? null, display_name: null })),
        ...(a["companies"] ?? []).map((c) => ({ deal_id: dealId, object_type: "company", external_id: c.id, association_types: c.types, crm_contact_id: null, display_name: companies.get(c.id)?.properties?.name ?? null })),
      ];
      if (assocRows.length) await db.from("crm_deal_associations").upsert(assocRows, { onConflict: "deal_id,object_type,external_id" });
      bump(counts, "associations", assocRows.length);
      const hist: any[] = [];
      for (const t of ENGAGEMENT_TYPES) for (const e of a[t] ?? []) {
        const r = engagements.get(t)!.get(e.id);
        if (!r) { bump(counts, `history_missing_${t}`); continue; }
        const ep = r.properties ?? {};
        const cfg = ENGAGEMENT_PROPS[t];
        hist.push({ deal_id: dealId, external_source: "hubspot", external_id: e.id, kind: t.replace(/s$/, ""), occurred_at: parseDate(ep.hs_timestamp ?? ep.hs_meeting_start_time ?? r.createdAt),
          subject: cfg.subject ? (ep[cfg.subject] ?? null) : null, snippet: snippet(ep[cfg.body]), properties: ep });
      }
      if (hist.length) await db.from("crm_deal_history").upsert(hist, { onConflict: "external_source,external_id,deal_id" });
      bump(counts, "history", hist.length);
    } catch (e) {
      errors.push({ at: new Date().toISOString(), kind: "deal", hubspotDealId: id, message: e instanceof Error ? e.message : String(e) });
      bump(counts, "deals_failed");
    }
  }
}

/* ---------------- status & reconciliation ---------------- */

export async function migrationStatus(userId: string) {
  const db = await requireMigrator(userId);
  const [{ data: runs }, { data: stages }, { count }] = await Promise.all([
    db.from("hubspot_deal_migration_runs").select("*").order("started_at", { ascending: false }).limit(10),
    db.from("hubspot_stage_map").select("*").order("pipeline_label").order("display_order"),
    db.from("crm_deals").select("id", { count: "exact", head: true }).eq("external_source", "hubspot"),
  ]);
  return { runs: runs ?? [], stages: stages ?? [], importedDeals: count ?? 0 };
}

export async function setStageMapping(userId: string, d: { pipelineId: string; stageId: string; stage: string }) {
  const db = await requireMigrator(userId);
  await db.from("hubspot_stage_map").update({ harmonious_stage: d.stage, updated_at: new Date().toISOString() }).eq("hs_pipeline_id", d.pipelineId).eq("hs_stage_id", d.stageId);
  return { ok: true };
}

/** Compare HubSpot and Harmonious: counts, amounts, associations and history. */
export async function reconcile(userId: string) {
  const db = await requireMigrator(userId);
  const hsDeals = new Map<string, { amount: number; contacts: number; companies: number; history: number; archived: boolean }>();
  for (const archived of [false, true]) {
    let after: string | undefined;
    do {
      const j = await hs(P.list(archived, after, "amount").replace(`limit=${BATCH}`, "limit=100"));
      for (const d of j.results ?? []) {
        const a = d.associations ?? {};
        const n = (t: string) => a[t]?.paging?.next ? -1 : new Set((a[t]?.results ?? []).map((r: any) => String(r.id))).size;
        hsDeals.set(String(d.id), { amount: parseAmount(d.properties?.amount).cents ?? 0, contacts: n("contacts"), companies: n("companies"), history: ENGAGEMENT_TYPES.reduce((s, t) => s + Math.max(0, n(t)), 0), archived });
      }
      after = j.paging?.next?.after;
    } while (after);
  }
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("crm_deals").select("id, external_id, amount_cents, hs_archived").eq("external_source", "hubspot").range(from, from + 999);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const ids = rows.map((r) => r.id);
  const assoc: any[] = [], hist: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200);
    const [{ data: a }, { data: h }] = await Promise.all([
      db.from("crm_deal_associations").select("deal_id, object_type").in("deal_id", slice).limit(10000),
      db.from("crm_deal_history").select("deal_id").in("deal_id", slice).limit(50000),
    ]);
    assoc.push(...(a ?? [])); hist.push(...(h ?? []));
  }
  const vals = [...hsDeals.values()];
  const sum = (f: (v: any) => number, xs: any[]) => xs.reduce((s, x) => s + f(x), 0);
  const lines = [
    reconcileLine("Deals (active)", vals.filter((v) => !v.archived).length, rows.filter((r) => !r.hs_archived).length),
    reconcileLine("Deals (deleted in HubSpot, kept archived)", vals.filter((v) => v.archived).length, rows.filter((r) => r.hs_archived).length),
    reconcileLine("Total amount (cents)", sum((v) => v.amount, vals), sum((r) => r.amount_cents ?? 0, rows)),
    reconcileLine("Linked contacts", sum((v) => Math.max(0, v.contacts), vals), assoc.filter((a) => a.object_type === "contact").length),
    reconcileLine("Linked companies", sum((v) => Math.max(0, v.companies), vals), assoc.filter((a) => a.object_type === "company").length),
    reconcileLine("Activity history items", sum((v) => v.history, vals), hist.length),
  ];
  const missingInHarmonious = [...hsDeals.keys()].filter((k) => !rows.some((r) => r.external_id === k));
  const amountMismatches = rows.filter((r) => hsDeals.has(r.external_id) && (hsDeals.get(r.external_id)!.amount !== (r.amount_cents ?? 0))).map((r) => r.external_id);
  const truncated = vals.some((v) => v.contacts < 0 || v.companies < 0);
  const result = { at: new Date().toISOString(), lines, ok: reconciled(lines) && !missingInHarmonious.length, missingInHarmonious, amountMismatches, note: truncated ? "Some deals have more than 100 links of one type; counted as zero on the HubSpot side — check manually." : null };
  await db.from("import_runs").insert({ provider: "hubspot_deal_reconciliation", actor_id: userId, result });
  return result;
}
