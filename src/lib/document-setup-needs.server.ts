import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { documentSetupNeeds, type SetupNeed } from "@/lib/document-setup-needs";

const db = () => supabaseAdmin as any;

/** Callers authorize first. Reads the latest version of each fund document and the details on file. */
export async function fundDocumentSetupNeeds(offeringId: string): Promise<SetupNeed[]> {
  const [{ data: docs }, { data: vers }, { data: o }, { data: setup }] = await Promise.all([
    db().from("offering_documents").select("id").eq("offering_id", offeringId).is("removed_at", null),
    db().from("offering_document_versions").select("offering_document_id, version, generation_issues").eq("offering_id", offeringId).limit(1000),
    db().from("offerings").select("contact_phone, arbitration_city, arbitration_state, principal_address, signatory_title, fund_signatory_person_id").eq("id", offeringId).maybeSingle(),
    db().from("fund_setups").select("fund_term_months").eq("offering_id", offeringId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const live = new Set(((docs ?? []) as any[]).map((d) => d.id));
  const latest = new Map<string, any>();
  for (const v of (vers ?? []) as any[]) {
    if (!live.has(v.offering_document_id)) continue;
    const cur = latest.get(v.offering_document_id);
    if (!cur || v.version > cur.version) latest.set(v.offering_document_id, v);
  }
  const issues = [...latest.values()].flatMap((v) => (v.generation_issues ?? []) as string[]);
  if (!issues.length) return [];
  let signerPhone: string | null = null;
  if (!o?.contact_phone && o?.fund_signatory_person_id) {
    const { data: p } = await db().from("persons").select("phone").eq("id", o.fund_signatory_person_id).maybeSingle();
    signerPhone = p?.phone ?? null;
  }
  return documentSetupNeeds(issues, {
    fundTerm: setup?.fund_term_months ?? null,
    contactPhone: o?.contact_phone || signerPhone,
    arbitrationCity: o?.arbitration_city, arbitrationState: o?.arbitration_state,
    principalAddress: o?.principal_address, signatoryTitle: o?.signatory_title,
  });
}
