/**
 * Granular contract capabilities, checked on the server for every contract action.
 * Staff entry comes from requireOperations (active staff role, never email);
 * the specific contract capability comes from role baseline + explicit grants.
 */
import { contractCapabilitiesFor, type ContractCapability } from "@/lib/contract-intelligence";

export async function contractGate(context: any, need: ContractCapability | ContractCapability[]) {
  const { requireOperations } = await import("@/lib/ops-access.functions");
  const { roles, capabilities } = await requireOperations(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("contract_capability_grants")
    .select("capability")
    .eq("user_id", context.userId)
    .is("revoked_at", null);
  const contractCaps = contractCapabilitiesFor(roles, ((data ?? []) as any[]).map((r) => String(r.capability)));
  const needed = Array.isArray(need) ? need : [need];
  const missing = needed.filter((c) => !contractCaps.includes(c));
  if (missing.length) throw new Error(`Forbidden: this needs the "${missing.join(", ")}" contract permission.`);
  return { roles, capabilities, contractCaps };
}
