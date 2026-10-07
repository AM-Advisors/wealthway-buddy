/** Server-only Fund Pricing Snapshot writes/reads (service role). */
import {
  decideSnapshot, resolveBaseline, type CatalogItem, type ClientPrice,
} from "@/lib/commercial-pricing";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const today = () => new Date().toISOString().slice(0, 10);

export async function loadBaseline(clientId: string | null) {
  const db = await admin();
  const { data: version } = await db.from("pricing_versions").select("id, label").eq("status", "published")
    .order("effective_date", { ascending: false }).limit(1).maybeSingle();
  if (!version) return { versionId: null as string | null, lines: [] };
  const { data: items } = await db.from("pricing_items")
    .select("service_key, label, amount_cents, pricing_model, pass_through").eq("version_id", version.id).eq("available_for_new_quotes", true).order("sort_order");
  const seen = new Set<string>();
  const catalog: CatalogItem[] = ((items ?? []) as any[]).filter((i) => !seen.has(i.service_key) && seen.add(i.service_key))
    .map((i) => ({ serviceKey: i.service_key, label: i.label, amountCents: Number(i.amount_cents ?? 0), pricingModel: i.pricing_model ?? null, passThrough: Boolean(i.pass_through) }));
  let clientPrices: ClientPrice[] = [];
  if (clientId) {
    const { data: cp } = await db.from("client_pricing")
      .select("service_key, contracted_cents, effective_date, expires_on, superseded_at, offering_id").eq("client_id", clientId);
    clientPrices = ((cp ?? []) as any[]).filter((p) => p.contracted_cents != null).map((p) => ({
      serviceKey: p.service_key, contractedCents: Number(p.contracted_cents), effectiveDate: p.effective_date ?? null,
      expiresOn: p.expires_on ?? null, superseded: Boolean(p.superseded_at), offeringId: p.offering_id ?? null,
    }));
  }
  return { versionId: version.id as string, lines: resolveBaseline(catalog, clientPrices, today()) };
}

/**
 * Records the Fund's commercial snapshot. Creating/requesting the Fund is the
 * approval event; below-baseline prices open a Pricing Approval request.
 * Never throws into the caller's Fund creation path - see safeCreateSnapshot.
 */
export async function createFundPricingSnapshot(args: {
  offeringId: string; clientId: string | null; actorId: string; source: string;
  requested?: Record<string, number>; reason?: string | null;
  /** Package-level services chosen for this Fund (Phase 3.10B); frozen with the snapshot. */
  serviceConfig?: unknown;
}) {
  const db = await admin();
  const base = await loadBaseline(args.clientId);
  const d = decideSnapshot(base.lines, args.requested);
  const { data: current } = await db.from("fund_pricing_snapshots").select("id").eq("offering_id", args.offeringId).is("superseded_at", null).maybeSingle();
  if (current) {
    const { error } = await db.from("fund_pricing_snapshots").update({ superseded_at: new Date().toISOString() }).eq("id", current.id);
    if (error) throw new Error(error.message);
  }
  const { data: snap, error } = await db.from("fund_pricing_snapshots").insert({
    offering_id: args.offeringId, client_id: args.clientId, status: d.status, pricing_version_id: base.versionId,
    source: args.source, service_config: args.serviceConfig ?? null, baseline_total_cents: d.baselineTotal, final_total_cents: d.finalTotal, created_by: args.actorId,
  }).select("id").single();
  if (error) throw new Error(error.message);
  if (d.lines.length) {
    const { error: le } = await db.from("fund_pricing_snapshot_lines").insert(d.lines.map((l) => ({
      snapshot_id: snap.id, service_key: l.serviceKey, label: l.label, pricing_model: l.pricingModel, pass_through: l.passThrough,
      catalog_cents: l.catalogCents, client_cents: l.clientCents, baseline_cents: l.baselineCents, final_cents: l.finalCents, baseline_source: l.baselineSource,
    })));
    if (le) throw new Error(le.message);
  }
  if (d.status === "pricing_review") {
    const { data: req, error: re } = await db.from("pricing_approval_requests").insert({
      offering_id: args.offeringId, client_id: args.clientId, snapshot_id: snap.id, requested_by: args.actorId, reason: args.reason ?? null,
      lines: d.lines.filter((l) => d.belowBaseline.includes(l.serviceKey)).map((l) => ({ serviceKey: l.serviceKey, label: l.label, baselineCents: l.baselineCents, finalCents: l.finalCents })),
    }).select("id").single();
    if (re) throw new Error(re.message);
    await db.from("fund_pricing_snapshots").update({ approval_request_id: req.id }).eq("id", snap.id);
  }
  return { snapshotId: snap.id as string, status: d.status };
}

/** Fund creation must never fail because of commercial bookkeeping. */
export async function safeCreateSnapshot(args: Parameters<typeof createFundPricingSnapshot>[0]) {
  try { return await createFundPricingSnapshot(args); }
  catch (e) { console.error("[commercial] snapshot not recorded; shows as Legacy Pricing Review", e instanceof Error ? e.message : e); return null; }
}

export async function currentSnapshot(offeringId: string) {
  const db = await admin();
  const { data: snap } = await db.from("fund_pricing_snapshots").select("*").eq("offering_id", offeringId).is("superseded_at", null).maybeSingle();
  if (!snap) return null;
  const { data: lines } = await db.from("fund_pricing_snapshot_lines").select("*").eq("snapshot_id", snap.id).order("created_at");
  return { ...snap, lines: lines ?? [] };
}
