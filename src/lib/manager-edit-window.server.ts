import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { managerEditWindowOpen } from "@/lib/manager-edit-window";

const db = () => supabaseAdmin as any;
async function checked(q: any): Promise<any[]> {
  const { data, error } = await q;
  if (error) throw new Error("Unable to check signing and funding history. Please try again.");
  return data ?? [];
}

/** Caller must authorize the fund/onboarding first. Any investor signature counts, not just full execution. */
export async function investorEditWindow(row: any): Promise<boolean> {
  const [files, docs, signers, apps] = await Promise.all([
    checked(db().from("fund_file_signatures").select("id").eq("onboarding_id", row.id).eq("signer_role", "investor").eq("status", "signed").limit(1)),
    row.application_id ? checked(db().from("document_signatures").select("signed_at, provider_completed_at, provider_status").eq("application_id", row.application_id)) : Promise.resolve([]),
    row.application_id ? checked(db().from("document_signature_signers").select("status, signed_at").eq("application_id", row.application_id).eq("role_key", "investor")) : Promise.resolve([]),
    row.application_id ? checked(db().from("investor_applications").select("funding_status").eq("id", row.application_id)) : Promise.resolve([]),
  ]);
  const signed = files.length > 0 || docs.some((s) => s.signed_at || s.provider_completed_at || s.provider_status === "completed") || signers.some((s) => s.signed_at || ["signed", "completed"].includes(s.status));
  return managerEditWindowOpen({ signed, fundingStatus: row.funding_status, fundedCents: row.funded_amount_cents, reportedSent: !!row.investor_reports_sent_at, stage: row.stage }) &&
    apps.every((a) => managerEditWindowOpen({ signed: false, fundingStatus: a.funding_status }));
}

export async function fundEditWindow(offeringId: string): Promise<boolean> {
  const rows = await checked(db().from("investor_onboardings").select("id, application_id, funding_status, funded_amount_cents, investor_reports_sent_at, stage").eq("offering_id", offeringId));
  return (await Promise.all(rows.map(investorEditWindow))).every(Boolean);
}

/** A global Person/Profile edit must not affect another fund's relationship. */
export async function exclusiveRecord(row: any, column: "person_id" | "investment_profile_id"): Promise<boolean> {
  if (!row[column]) return true;
  const siblings = await checked(db().from("investor_onboardings").select("id").eq(column, row[column]));
  return siblings.every((r) => r.id === row.id);
}