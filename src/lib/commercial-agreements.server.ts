/** Server-only reads of Harmonious commercial agreement facts. Read-only projection. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  commercialAgreementStatus, isContractStructure, msaDocStatus, sowDocStatus,
  type CommercialAgreementStatus, type ContractStructure,
} from "@/lib/commercial-agreement-model";

const db = () => supabaseAdmin as any;

export type AgreementFacts = CommercialAgreementStatus & {
  clientId: string;
  msa: { status: string; executedAt: string | null; version: string | null } | null;
  sow: { id: string; title: string; version: number | null; status: string; sentStatus: string | null; signedBy: string | null; signedOn: string | null; effectiveDate: string | null; executedAt: string | null; offeringId: string | null } | null;
};

/** Agreement status for many clients at once. Optionally prefer the SOW linked to a fund. */
export async function agreementStatusForClients(clientIds: string[], offeringByClient: Map<string, string> = new Map()): Promise<Map<string, AgreementFacts>> {
  const out = new Map<string, AgreementFacts>();
  if (!clientIds.length) return out;
  const [{ data: clients }, { data: msas }, { data: sows }] = await Promise.all([
    db().from("clients").select("id, contract_structure, msa_signed_on, msa_version").in("id", clientIds),
    db().from("client_msa_agreements").select("client_id, status, executed_at, client_approved_at, created_at").in("client_id", clientIds).order("created_at", { ascending: false }),
    db().from("client_sows").select("id, client_id, title, sow_version, status, client_status, signed_by, signed_on, effective_date, executed_at, client_signed_at, offering_id, created_at").in("client_id", clientIds).order("created_at", { ascending: false }),
  ]);
  for (const c of (clients ?? []) as any[]) {
    const structure: ContractStructure = isContractStructure(c.contract_structure) ? c.contract_structure : "not_determined";
    const msa = ((msas ?? []) as any[]).find((m) => m.client_id === c.id) ?? null;
    const clientSows = ((sows ?? []) as any[]).filter((s) => s.client_id === c.id && s.status !== "superseded");
    const fundId = offeringByClient.get(c.id);
    const sow = (fundId && clientSows.find((s) => s.offering_id === fundId)) || clientSows.find((s) => s.status === "active") || clientSows[0] || null;
    const msaStatus = msaDocStatus(msa, c.msa_signed_on ?? null);
    const status = commercialAgreementStatus(structure, msaStatus, sowDocStatus(sow));
    out.set(c.id, {
      ...status,
      clientId: c.id,
      msa: msa || c.msa_signed_on ? { status: msaStatus, executedAt: msa?.executed_at ?? c.msa_signed_on ?? null, version: c.msa_version ?? null } : null,
      sow: sow ? { id: sow.id, title: sow.title, version: sow.sow_version ?? null, status: sow.status, sentStatus: sow.client_status ?? null, signedBy: sow.signed_by ?? null, signedOn: sow.signed_on ?? null, effectiveDate: sow.effective_date ?? null, executedAt: sow.executed_at ?? null, offeringId: sow.offering_id ?? null } : null,
    });
  }
  return out;
}

export async function agreementStatusForClient(clientId: string, offeringId?: string | null) {
  const map = await agreementStatusForClients([clientId], offeringId ? new Map([[clientId, offeringId]]) : new Map());
  return map.get(clientId) ?? null;
}

export async function setContractStructure(clientId: string, to: ContractStructure, actorUserId: string, reason: string | null) {
  const { data: c } = await db().from("clients").select("id, contract_structure").eq("id", clientId).maybeSingle();
  if (!c) throw new Error("Client not found.");
  if (c.contract_structure === to) return { changed: false };
  const { error } = await db().from("clients").update({ contract_structure: to }).eq("id", clientId);
  if (error) throw new Error(error.message);
  await db().from("contract_structure_events").insert({ client_id: clientId, from_structure: c.contract_structure, to_structure: to, reason, actor_user_id: actorUserId });
  return { changed: true };
}
