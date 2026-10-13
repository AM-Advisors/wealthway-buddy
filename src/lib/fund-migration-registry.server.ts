/** Fund Migration registry - server. Staff only. Reads canonical records; writes only append-only review decisions. */
import inventory from "@/lib/fund-migration-inventory.json";
import {
  allowedDecisions, buildRow, latestByKey, metrics, normalizeFundName, sortQueue,
  type Decision, type DecisionKind, type FundFacts, type InventoryEntry,
} from "@/lib/fund-migration-registry";

const ENTRIES = inventory as InventoryEntry[];
const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const staff = async (userId: string) => (await import("@/lib/investor-onboarding.server")).assertStaff(userId);

async function facts(): Promise<{ byName: Map<string, FundFacts>; harmoniousDuplicates: { name: string; count: number }[] }> {
  const a = await db();
  const [{ data: offs }, { data: onbs }, { data: mgrs }, { data: docs }, { data: tpls }] = await Promise.all([
    a.from("offerings").select("id, name, legal_entity_name, consolidated_into").limit(2000),
    a.from("investor_onboardings").select("offering_id").is("removed_at", null).limit(20000),
    a.from("fund_managers").select("offering_id").limit(5000),
    a.from("offering_documents").select("offering_id, doc_type, document_category").limit(20000),
    a.from("signing_templates").select("offering_id").not("offering_id", "is", null).limit(5000),
  ]);
  const count = (rows: any[] | null, id: string, pred: (r: any) => boolean = () => true) => (rows ?? []).filter((r) => r.offering_id === id && pred(r)).length;
  const isFormation = (r: any) => /formation|operating|lpa|partnership|certificate|governing/i.test(`${r.doc_type ?? ""} ${r.document_category ?? ""}`);
  const byName = new Map<string, FundFacts>();
  const groups = new Map<string, string[]>();
  for (const o of (offs ?? []) as any[]) {
    if (o.consolidated_into) continue;
    const k = normalizeFundName(o.name);
    groups.set(k, [...(groups.get(k) ?? []), o.name]);
    byName.set(o.name, {
      offeringId: o.id, legalName: o.legal_entity_name ?? null,
      investorCount: count(onbs, o.id), managerCount: count(mgrs, o.id),
      formationDocs: count(docs, o.id, isFormation), signingTemplates: count(tpls, o.id),
    });
  }
  const harmoniousDuplicates = [...groups.values()].filter((g) => g.length > 1).map((g) => ({ name: g[0]!, count: g.length }));
  return { byName, harmoniousDuplicates };
}

export async function registry(userId: string) {
  await staff(userId);
  const a = await db();
  const [{ data: decs, error }, f] = await Promise.all([
    a.from("fund_migration_decisions").select("*").order("created_at", { ascending: true }).limit(10000),
    facts(),
  ]);
  if (error) throw new Error(error.message);
  const latest = latestByKey((decs ?? []) as Decision[]);
  const rows = sortQueue(ENTRIES.map((e) => buildRow(e, latest.get(e.key) ?? null, e.matchedName ? f.byName.get(e.matchedName) ?? null : null)));
  return { rows, metrics: metrics(rows, f.harmoniousDuplicates.length), harmoniousDuplicates: f.harmoniousDuplicates, decisionCount: (decs ?? []).length };
}

export async function history(userId: string, key: string) {
  await staff(userId);
  const { data } = await (await db()).from("fund_migration_decisions").select("*").eq("registry_key", key).order("created_at", { ascending: false });
  return (data ?? []) as Decision[];
}

export async function decide(userId: string, input: { key: string; decision: DecisionKind; reason: string; parentKey?: string | null | undefined }) {
  await staff(userId);
  const entry = ENTRIES.find((e) => e.key === input.key);
  if (!entry) throw new Error("That registry record was not found.");
  const current = await registry(userId);
  const row = current.rows.find((r) => r.key === input.key)!;
  if (!allowedDecisions(row.status).includes(input.decision)) throw new Error("That decision is not available for this record's current status.");
  let offeringId: string | null = null;
  if (input.decision === "approve_match") {
    if (!row.offeringId) throw new Error("The matched Harmonious fund could not be found.");
    offeringId = row.offeringId;
  }
  if (input.decision === "set_parent") {
    if (!input.parentKey || input.parentKey === input.key || !ENTRIES.some((e) => e.key === input.parentKey)) throw new Error("Choose a different registry record as the parent.");
  }
  const { error } = await (await db()).from("fund_migration_decisions").insert({
    registry_key: input.key, decision: input.decision, offering_id: offeringId,
    parent_key: input.decision === "set_parent" ? input.parentKey : null, reason: input.reason.trim(), actor_user_id: userId,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}
