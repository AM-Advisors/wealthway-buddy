import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ledgerBookForOffering } from "@/lib/accounting.server";
import { openingDecisionError, openingPositionError, openingTieOut } from "@/lib/opening-positions-model";

const db = () => supabaseAdmin as any;
const fail = (m: string): never => { throw new Error(m); };

async function assertAdmin(userId: string) {
  const { data } = await db().from("user_roles").select("role").eq("user_id", userId);
  if (!((data ?? []) as any[]).some((r) => r.role === "admin")) fail("Forbidden: Harmonious fund accounting authority is required.");
}

export async function prepareOpeningPosition(userId: string, i: {
  offeringId: string; batchRef: string; sourceSystem: string; sourceReference: string; asOfDate: string;
  issuerName: string; assetName: string; assetClass: string; costBasisCents: number; openingFairValueCents: number;
  evidenceStatus: "present" | "missing_in_source" | "review_required"; openingJournalId: string;
}) {
  await assertAdmin(userId);
  const book: any = await ledgerBookForOffering(userId, i.offeringId);
  const { data: j } = await db().from("journal_entries").select("status, entry_date, book_id").eq("id", i.openingJournalId).maybeSingle();
  const err = openingPositionError(i, j ? { status: j.status, entryDate: String(j.entry_date), bookId: String(j.book_id) } : null, String(book.id));
  if (err) fail(err);
  const { data: existing } = await db().from("portfolio_opening_positions").select("id,status").eq("offering_id", i.offeringId).ilike("issuer_name", i.issuerName).ilike("asset_name", i.assetName).neq("status", "rejected").maybeSingle();
  if (existing) return { id: existing.id as string, status: existing.status as string, existing: true };
  const { data, error } = await db().from("portfolio_opening_positions").insert({
    offering_id: i.offeringId, book_id: book.id, batch_ref: i.batchRef, source_system: i.sourceSystem, source_reference: i.sourceReference,
    as_of_date: i.asOfDate, issuer_name: i.issuerName, asset_name: i.assetName, asset_class: i.assetClass,
    cost_basis_cents: i.costBasisCents, opening_fair_value_cents: i.openingFairValueCents, evidence_status: i.evidenceStatus,
    opening_journal_id: i.openingJournalId, prepared_by: userId,
  }).select("id,status").single();
  if (error) fail(error.message);
  return { id: data.id as string, status: data.status as string, existing: false };
}

/** Approval creates the subledger asset + an opening valuation recognised by the opening journal. No new journal. */
export async function decideOpeningPosition(userId: string, id: string, approve: boolean, reason: string) {
  await assertAdmin(userId);
  const { data: p } = await db().from("portfolio_opening_positions").select("*").eq("id", id).maybeSingle();
  if (!p) fail("Opening position not found.");
  const err = openingDecisionError(String(p.prepared_by), userId, String(p.status));
  if (err) fail(err);
  if (!approve) {
    await db().from("portfolio_opening_positions").update({ status: "rejected", decided_by: userId, decided_at: new Date().toISOString(), decision_reason: reason }).eq("id", id);
    return { status: "rejected" };
  }
  // Resume safely if a prior attempt created the asset but not the valuation.
  const { data: prior } = await db().from("portfolio_assets").select("id").eq("original_transaction_table", "portfolio_opening_positions").eq("original_transaction_id", p.id).maybeSingle();
  const { data: asset, error: ae } = prior ? { data: prior, error: null } : await db().from("portfolio_assets").insert({
    book_id: p.book_id, offering_id: p.offering_id, issuer_name: p.issuer_name, asset_name: p.asset_name, asset_class: p.asset_class,
    cost_basis_cents: p.cost_basis_cents, currency: "USD", status: "active",
    original_transaction_table: "portfolio_opening_positions", original_transaction_id: p.id,
    note: `Takeover opening position (${p.batch_ref}); acquisition date not in source`, created_by: p.prepared_by,
  }).select("id").single();
  if (ae) fail(ae.message);
  const now = new Date().toISOString();
  const { data: val, error: ve } = await db().from("portfolio_valuations").insert({
    asset_id: asset.id, book_id: p.book_id, offering_id: p.offering_id, version: 1, status: "effective",
    valuation_date: p.as_of_date, effective_date: p.as_of_date, value_cents: p.opening_fair_value_cents, cost_basis_cents: p.cost_basis_cents,
    methodology: "other", methodology_note: "Prior administrator carrying value at takeover", source_type: "other", source: p.source_reference, source_date: p.as_of_date,
    change_cents: p.opening_fair_value_cents - p.cost_basis_cents, prepared_by: p.prepared_by, prepared_by_role: "harmonious",
    reviewed_by: userId, reviewed_at: now, approved_by: userId, approved_at: now, effective_at: now,
    // Recognised by the posted opening journal: Q1 movement is measured from this value, never from cost.
    recognized_by_journal_id: p.opening_journal_id,
    evidence_status: p.evidence_status === "present" ? "present" : "missing",
    note: p.evidence_status === "missing_in_source" ? "Opening valuation evidence MISSING IN SOURCE - follow-up open; does not satisfy any later valuation" : null,
  }).select("id").single();
  if (ve) fail(ve.message);
  await db().from("portfolio_opening_positions").update({ status: "approved", decided_by: userId, decided_at: now, decision_reason: reason, asset_id: asset.id, opening_valuation_id: val.id }).eq("id", id);
  return { status: "approved", assetId: asset.id as string, valuationId: val.id as string };
}

export async function openingSubledgerCheck(offeringId: string, asOfDate: string) {
  const { data: pos } = await db().from("portfolio_opening_positions").select("cost_basis_cents,opening_fair_value_cents,book_id").eq("offering_id", offeringId).eq("status", "approved");
  const bookId = (pos ?? [])[0]?.book_id;
  const { data: coa } = await db().from("chart_of_accounts").select("id,code").eq("book_id", bookId).in("code", ["1100", "1110"]);
  const { data: je } = await db().from("journal_entries").select("id").eq("book_id", bookId).eq("status", "posted").lte("entry_date", asOfDate);
  const { data: jl } = await db().from("journal_lines").select("account_id,debit_cents,credit_cents").in("entry_id", ((je ?? []) as any[]).map((x) => x.id));
  const bal = (code: string) => { const id = ((coa ?? []) as any[]).find((a) => a.code === code)?.id; return ((jl ?? []) as any[]).filter((l) => l.account_id === id).reduce((s, l) => s + Number(l.debit_cents ?? 0) - Number(l.credit_cents ?? 0), 0); };
  return openingTieOut(((pos ?? []) as any[]).map((p) => ({ costBasisCents: Number(p.cost_basis_cents), openingFairValueCents: Number(p.opening_fair_value_cents) })), { investmentCostCents: bal("1100"), unrealizedCents: bal("1110") });
}
