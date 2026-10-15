import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { CONTRACT_STRUCTURES, clientAgreementNotice } from "@/lib/commercial-agreement-model";

/** Full commercial agreement status for Operations (Client 360 / Fund 360). */
export const getCommercialAgreementStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid().optional(), offeringId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const { contractGate } = await import("@/lib/contract-access.server");
    const { contractCaps } = await contractGate(context, "view_contracts");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let clientId = data.clientId ?? null;
    if (!clientId && data.offeringId) {
      const { data: o } = await (supabaseAdmin as any).from("offerings").select("client_id").eq("id", data.offeringId).maybeSingle();
      clientId = o?.client_id ?? null;
    }
    if (!clientId) return { status: null, canEdit: false };
    const { agreementStatusForClient } = await import("@/lib/commercial-agreements.server");
    return { status: await agreementStatusForClient(clientId, data.offeringId ?? null), canEdit: contractCaps.includes("correct_terms") };
  });

export const updateContractStructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid(), structure: z.enum(CONTRACT_STRUCTURES), reason: z.string().trim().max(500).optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const { contractGate } = await import("@/lib/contract-access.server");
    await contractGate(context, "correct_terms");
    const { setContractStructure } = await import("@/lib/commercial-agreements.server");
    return setContractStructure(data.clientId, data.structure, context.userId, data.reason ?? null);
  });

/**
 * Non-disruptive notice for a client / fund manager. Visibility comes from the
 * caller's own access to the fund; returns only a generic notice, never notes.
 */
export const getFundAgreementNotice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: o } = await context.supabase.from("offerings").select("id, client_id").eq("id", data.offeringId).maybeSingle();
    const clientId = (o as any)?.client_id as string | undefined;
    if (!clientId) return { notice: null };
    const { agreementStatusForClient } = await import("@/lib/commercial-agreements.server");
    const s = await agreementStatusForClient(clientId, data.offeringId);
    return { notice: s ? clientAgreementNotice(s) : null };
  });

/** Client team members eligible to sign the MSA, plus the current designee. */
export const getMsaSignerOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { contractGate } = await import("@/lib/contract-access.server");
    const { contractCaps } = await contractGate(context, "view_contracts");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [{ data: c }, { data: members }] = await Promise.all([
      db.from("clients").select("msa_signer_user_id").eq("id", data.clientId).maybeSingle(),
      db.from("client_users").select("user_id, client_role").eq("client_id", data.clientId).is("revoked_at", null),
    ]);
    const ids = [...new Set(((members ?? []) as any[]).map((m) => m.user_id))];
    const { data: profiles } = ids.length ? await db.from("profiles").select("user_id, legal_name, email").in("user_id", ids) : { data: [] };
    const pm = new Map(((profiles ?? []) as any[]).map((p) => [p.user_id, p]));
    return {
      signerUserId: (c?.msa_signer_user_id ?? null) as string | null,
      canEdit: contractCaps.includes("correct_terms"),
      options: ids.map((id) => ({ userId: id, name: pm.get(id)?.legal_name || pm.get(id)?.email || "Team member", email: pm.get(id)?.email ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

export const setMsaSigner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid(), userId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ context, data }) => {
    const { contractGate } = await import("@/lib/contract-access.server");
    await contractGate(context, "correct_terms");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (data.userId) {
      const { data: m } = await db.from("client_users").select("id").eq("client_id", data.clientId).eq("user_id", data.userId).is("revoked_at", null).maybeSingle();
      if (!m) throw new Error("That person is not on this client's team.");
    }
    const { data: prev } = await db.from("clients").select("msa_signer_user_id").eq("id", data.clientId).maybeSingle();
    const { error } = await db.from("clients").update({ msa_signer_user_id: data.userId }).eq("id", data.clientId);
    if (error) throw new Error(error.message);
    await db.from("contract_audit_events").insert({
      actor_id: context.userId, actor_role: "staff", client_id: data.clientId, area: "agreements",
      action: "msa_signer_assigned", target: data.clientId,
      previous_value: { signer: prev?.msa_signer_user_id ?? null }, new_value: { signer: data.userId }, source: "web",
    });
    return { ok: true };
  });
