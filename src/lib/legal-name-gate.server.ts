import { legalNameRequired, type LegalNameGatedAction } from "@/lib/fund-duplicate-resolution";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

/** Contextual gate: Draft Funds may lack a Legal Name; entity-dependent actions may not. */
export async function assertLegalName(input: { offeringId?: string | null; setupId?: string | null }, action: LegalNameGatedAction) {
  const db = await admin();
  let offeringId = input.offeringId ?? null;
  if (!offeringId && input.setupId) {
    const { data } = await db.from("fund_setups").select("offering_id").eq("id", input.setupId).maybeSingle();
    offeringId = data?.offering_id ?? null;
  }
  if (!offeringId) return;
  const { data } = await db.from("offerings").select("legal_entity_name").eq("id", offeringId).maybeSingle();
  const err = legalNameRequired(action, data?.legal_entity_name);
  if (err) throw new Error(err);
}
