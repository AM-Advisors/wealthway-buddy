import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
