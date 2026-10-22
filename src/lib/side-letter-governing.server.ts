/**
 * Canonical facts a generated side letter must cite: the fund's active Operating Agreement and
 * Subscription Agreement versions and the active fund fee terms. Refuses when any governing
 * document is missing instead of guessing.
 */
import type { SideLetterGoverningDocs } from "@/lib/fund-doc-templates";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const pct = (n: unknown) => (n == null || n === "" ? null : `${Number(n)}%`);

export function missingGoverningDocs(docs: { document_category: string | null; doc_type: string | null; removed_at: string | null; active_version: number | null }[]) {
  const live = docs.filter((d) => !d.removed_at && d.active_version);
  const has = (k: string) => live.some((d) => d.document_category === k || d.doc_type === k);
  const missing: string[] = [];
  if (!has("operating_agreement")) missing.push("an active Operating Agreement");
  if (!has("subscription_agreement")) missing.push("an active Subscription Agreement");
  return missing;
}

export async function loadSideLetterGoverningDocs(db: any, fundId: string, onboardingId?: string | null): Promise<SideLetterGoverningDocs> {
  const [{ data: docs, error }, { data: fees }, { data: off }] = await Promise.all([
    db.from("offering_documents").select("id, title, document_category, doc_type, active_version, removed_at").eq("offering_id", fundId),
    db.from("fund_fee_terms").select("management_fee_pct, management_fee_basis, carry_pct, status").eq("offering_id", fundId).eq("status", "active"),
    db.from("offerings").select("min_investment_cents").eq("id", fundId).maybeSingle(),
  ]);
  if (error) throw new Error("The fund's governing documents couldn't be read, so the side letter wasn't generated.");
  const rows = (docs ?? []) as any[];
  const missing = missingGoverningDocs(rows);
  if (missing.length) throw new Error(`Before generating a side letter, this fund needs ${missing.join(" and ")}.`);
  const pick = (k: string) => rows.find((d) => !d.removed_at && d.active_version && (d.document_category === k || d.doc_type === k));
  const oa = pick("operating_agreement"), sa = pick("subscription_agreement");
  const { data: vers } = await db.from("offering_document_versions").select("offering_document_id, version, effective_date, approved_at, created_at").in("offering_document_id", [oa.id, sa.id]);
  const ref = (d: any) => {
    const v = ((vers ?? []) as any[]).find((x) => x.offering_document_id === d.id && x.version === d.active_version);
    const date = v?.effective_date ?? v?.approved_at ?? v?.created_at ?? null;
    return { title: d.title as string, version: Number(d.active_version), date: date ? String(date).slice(0, 10) : null };
  };
  const activeFees = (fees ?? []) as any[];
  const fee = activeFees.length === 1 ? activeFees[0] : null;
  let investorSubscription: SideLetterGoverningDocs["investorSubscription"] = null;
  if (onboardingId) {
    const { data: ob } = await db.from("investor_onboardings").select("offering_id, commitment_amount_cents, accepted_amount_cents, updated_at").eq("id", onboardingId).maybeSingle();
    if (!ob || ob.offering_id !== fundId) throw new Error("That investor isn't in this fund.");
    const cents = ob.accepted_amount_cents ?? ob.commitment_amount_cents;
    if (cents != null) investorSubscription = { amount: usd(cents), date: null };
  }
  return {
    operatingAgreement: ref(oa),
    subscriptionAgreement: ref(sa),
    baseline: {
      managementFee: fee && fee.management_fee_pct != null ? `${pct(fee.management_fee_pct)}${fee.management_fee_basis ? ` of ${String(fee.management_fee_basis).replace(/_/g, " ")}` : ""}` : null,
      carry: fee ? pct(fee.carry_pct) : null,
      minimum: off?.min_investment_cents != null ? usd(off.min_investment_cents) : null,
    },
    investorSubscription,
  };
}
