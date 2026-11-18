/** Server-only readers shared by the Form D / Blue Sky tracker and the fund Regulatory tab. */
import { fundFilingStatus, type FilingRecord, type FundFilingOverview } from "@/lib/regulatory-filings-model";
import { investmentAmountCents } from "@/lib/investment-amounts";

const SOLD = ["received", "funded", "settled"];

/** Investors counted as sold: money received/funded or closed, live records only. */
export async function soldInvestors(db: any, offeringIds: string[]) {
  if (!offeringIds.length) return [] as any[];
  const { data } = await db.from("investor_onboardings")
    .select("id, offering_id, funding_status, closed_at, accepted_amount_cents, commitment_amount_cents, requested_amount_cents, removed_at, merged_into_onboarding_id, persons(region), investment_profiles(legal_name, profile_type)")
    .in("offering_id", offeringIds).is("removed_at", null);
  return ((data ?? []) as any[]).filter((o) => !o.merged_into_onboarding_id && (SOLD.includes(String(o.funding_status)) || o.closed_at));
}

export async function filingRecords(db: any, offeringIds: string[]) {
  if (!offeringIds.length) return { close: [] as any[], recorded: [] as any[] };
  const [{ data: close }, { data: recorded }] = await Promise.all([
    db.from("fund_close_filings").select("id, offering_id, close_request_id, filing_type, jurisdiction, status, filed_on, is_amendment").in("offering_id", offeringIds),
    db.from("fund_regulatory_filings").select("id, offering_id, filing_type, state, filing_date").in("offering_id", offeringIds).in("filing_type", ["form_d", "blue_sky"]).is("removed_at", null),
  ]);
  return { close: (close ?? []) as any[], recorded: (recorded ?? []) as any[] };
}

export function toRecords(close: any[], recorded: any[]) {
  return [
    ...close.map((f) => ({ kind: f.filing_type, jurisdiction: f.jurisdiction, status: f.status, filedOn: f.filed_on, isAmendment: f.is_amendment })),
    ...recorded.map((f) => ({ kind: f.filing_type, jurisdiction: f.filing_type === "form_d" ? "SEC" : f.state ?? "", status: "filed", filedOn: f.filing_date ?? null })),
  ] as any[];
}


/** Status for one fund, read with the caller's already-authorized admin client. */
export async function fundStatusFor(db: any, fundId: string): Promise<FundFilingOverview | null> {
  const { data: o } = await db.from("offerings").select("reg_type, form_d_responsibility, blue_sky_responsibility, first_sale_on").eq("id", fundId).maybeSingle();
  if (!o) return null;
  const [sold, recs] = await Promise.all([soldInvestors(db, [fundId]), filingRecords(db, [fundId])]);
  const closed = sold.map((s: any) => s.closed_at).filter(Boolean).map((d: string) => d.slice(0, 10)).sort();
  return {
    firstSaleOn: o.first_sale_on ?? null, suggestedFirstSaleOn: closed[0] ?? null, regType: o.reg_type ?? null,
    formDResponsibility: o.form_d_responsibility ?? null, blueSkyResponsibility: o.blue_sky_responsibility ?? null,
    status: fundFilingStatus({
      regType: o.reg_type, formD: o.form_d_responsibility ?? null, blueSky: o.blue_sky_responsibility ?? null, firstSaleOn: o.first_sale_on ?? null,
      investors: sold.map((s: any) => ({ region: s.persons?.region ?? null, amountCents: investmentAmountCents(s) ?? 0 })),
      filings: toRecords(recs.close, recs.recorded) as FilingRecord[], today: new Date().toISOString().slice(0, 10),
    }),
  };
}
