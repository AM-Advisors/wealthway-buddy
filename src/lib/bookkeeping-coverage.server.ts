/**
 * Server-only reader of existing coverage for one legal entity: administration agreement
 * features, active bookkeeping engagement services and open bookkeeping requests.
 * Returns labels, scope and dates only; never prices, notes or override reasons.
 * Callers must authorize the entity first.
 */
import { BOOKKEEPING_KEY } from "@/lib/bookkeeping-model";
import { adminBookkeepingScope, BOOKKEEPING_OPTIONS, fundAccountingCoverage, type CoverageRow } from "@/lib/bookkeeping-options";

type Db = any;
const OPEN_REQUEST = ["submitted", "in_review", "scoped"];

export async function loadEntityCoverage(db: Db, entity: { id: string; offering_id: string | null }) {
  const rows: CoverageRow[] = [];
  let fundFeatureKeys: string[] = [];
  if (entity.offering_id) {
    const { data: engagements } = await db.from("service_engagements")
      .select("id, service_product, service_level, effective_date")
      .eq("fund_id", entity.offering_id).not("service_status", "in", "(CANCELLED,EXPIRED)");
    for (const e of (engagements ?? []) as any[]) {
      const [{ data: defs }, { data: ov }] = await Promise.all([
        db.from("service_level_entitlements").select("feature_key").eq("service_product", e.service_product).eq("service_level", e.service_level),
        db.from("service_engagement_entitlements").select("feature_key, mode").eq("engagement_id", e.id),
      ]);
      const removed = new Set(((ov ?? []) as any[]).filter((o) => o.mode === "REMOVE").map((o) => o.feature_key));
      const keys = [
        ...((defs ?? []) as any[]).map((d) => d.feature_key as string).filter((k) => !removed.has(k)),
        ...((ov ?? []) as any[]).filter((o) => o.mode === "ADD").map((o) => o.feature_key as string),
      ];
      fundFeatureKeys = [...new Set([...fundFeatureKeys, ...keys])];
      const scope = adminBookkeepingScope(keys);
      if (scope.length) rows.push({ source: "administration", label: "Your fund administration agreement", scope, start: e.effective_date ?? null, end: null });
    }
  }
  const [{ data: links }, { data: direct }] = await Promise.all([
    db.from("engagement_entities").select("engagement_id").eq("entity_id", entity.id),
    db.from("client_engagements").select("id").eq("entity_id", entity.id),
  ]);
  const engagementIds = [...new Set([...((links ?? []) as any[]).map((l) => l.engagement_id), ...((direct ?? []) as any[]).map((d) => d.id)])];
  if (engagementIds.length) {
    const { data: services } = await db.from("engagement_services")
      .select("service_name, effective_date, end_date, status").in("engagement_id", engagementIds)
      .eq("service_key", BOOKKEEPING_KEY).eq("status", "active");
    for (const s of (services ?? []) as any[]) rows.push({ source: "bookkeeping", label: `Your ${s.service_name} engagement`, scope: [...BOOKKEEPING_OPTIONS.managed.charged, "tools"], start: s.effective_date ?? null, end: s.end_date ?? null });
  }
  const { data: requests } = await db.from("client_intake_requests")
    .select("id, created_at, status").eq("entity_id", entity.id).in("status", OPEN_REQUEST).contains("requested_service_keys", [BOOKKEEPING_KEY]);
  for (const r of (requests ?? []) as any[]) rows.push({ source: "request", label: `Your bookkeeping request from ${String(r.created_at).slice(0, 10)}`, scope: [...BOOKKEEPING_OPTIONS.managed.charged, "tools"], start: null, end: null });
  return { rows, fundAccounting: entity.offering_id ? fundAccountingCoverage(fundFeatureKeys) : null };
}
