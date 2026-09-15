import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STAFF_ROLES } from "@/lib/contracts.functions";

/** Staff view of every client's cap table: shareholders, share records,
 *  certificates and transfers. Harmonious keeps the record and can issue or
 *  cancel a certificate on the company's written instruction — the company's
 *  own signatory is always named on the certificate. */

const ISSUING_ROLES = ["admin", "super_admin", "operations", "legal", "fund_administration"];

type Staff = { roles: string[]; canIssue: boolean };

async function staff(context: any): Promise<Staff> {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  if (!roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r))) {
    throw new Error("Forbidden: this area is for the Harmonious team.");
  }
  return { roles, canIssue: roles.some((r) => ISSUING_ROLES.includes(r)) };
}

async function audit(
  context: any,
  entry: { clientId: string; action: string; target?: string | null; next?: any },
) {
  try {
    await context.supabase.from("contract_audit_events").insert({
      client_id: entry.clientId,
      actor_id: context.userId,
      actor_role: "staff",
      area: "cap table",
      action: entry.action,
      target: entry.target ?? null,
      new_value: entry.next ?? null,
      source: "web",
    });
  } catch {
    /* an audit write must never block the action itself */
  }
}

/* ------------------------------------------------------------------- read */

export const getStaffCapTables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const me = await staff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: clients }, { data: holdingCounts }, { data: setups }] = await Promise.all([
      supabaseAdmin.from("clients").select("id, name, status").order("name"),
      supabaseAdmin.from("cap_holdings").select("client_id, quantity, status"),
      supabaseAdmin.from("cap_onboarding").select("client_id, company_legal_name, completed_at"),
    ]);

    const byClient = new Map<string, { holdings: number; shares: number }>();
    for (const h of (holdingCounts ?? []) as any[]) {
      const key = String(h.client_id);
      const row = byClient.get(key) ?? { holdings: 0, shares: 0 };
      row.holdings += 1;
      if (h.status === "outstanding") row.shares += Number(h.quantity ?? 0);
      byClient.set(key, row);
    }
    const setupByClient = new Map(((setups ?? []) as any[]).map((s) => [String(s.client_id), s]));

    const list = ((clients ?? []) as any[])
      .map((c) => {
        const id = String(c.id);
        const counts = byClient.get(id) ?? { holdings: 0, shares: 0 };
        const setup = setupByClient.get(id);
        return {
          clientId: id,
          clientName: String(c.name),
          clientStatus: String(c.status ?? ""),
          companyName: (setup as any)?.company_legal_name ?? null,
          setupComplete: Boolean((setup as any)?.completed_at),
          holdings: counts.holdings,
          shares: counts.shares,
        };
      })
      .filter((c) => c.holdings > 0 || c.setupComplete);

    const selectedId =
      (data.clientId && list.some((c) => c.clientId === data.clientId) ? data.clientId : null) ??
      list[0]?.clientId ??
      null;

    if (!selectedId) {
      return {
        canIssue: me.canIssue,
        clients: list,
        selectedId: null,
        stakeholders: [],
        holdings: [],
        certificates: [],
        transfers: [],
      };
    }

    const [{ data: stakeholders }, { data: holdings }, { data: certificates }, { data: transfers }] =
      await Promise.all([
        supabaseAdmin
          .from("cap_stakeholders")
          .select("id, name, email, holder_type")
          .eq("client_id", selectedId)
          .order("name"),
        supabaseAdmin
          .from("cap_holdings")
          .select(
            "id, stakeholder_id, security_type, share_class, quantity, price_per_share_cents, issued_on, certificate_no, status, source, created_at",
          )
          .eq("client_id", selectedId)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("cap_certificates")
          .select(
            "id, holding_id, stakeholder_id, certificate_no, status, signer_name, signer_title, signed_at, cancelled_at, cancelled_reason, replaced_by, file_name, created_at",
          )
          .eq("client_id", selectedId)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("cap_transfers")
          .select(
            "id, holding_id, from_stakeholder_id, to_stakeholder_id, to_name, to_email, quantity, reason, status, decision_note, decided_at, created_at",
          )
          .eq("client_id", selectedId)
          .order("created_at", { ascending: false }),
      ]);

    return {
      canIssue: me.canIssue,
      clients: list,
      selectedId,
      stakeholders: (stakeholders ?? []) as any[],
      holdings: (holdings ?? []) as any[],
      certificates: (certificates ?? []) as any[],
      transfers: (transfers ?? []) as any[],
    };
  });

/* ----------------------------------------------------------- certificates */

/** Creates the draft certificate for a share record that has none. */
export const staffCreateCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid(), holdingId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const me = await staff(context);
    if (!me.canIssue) throw new Error("You do not have permission to issue certificates.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: holding } = await supabaseAdmin
      .from("cap_holdings")
      .select("id")
      .eq("id", data.holdingId)
      .eq("client_id", data.clientId)
      .maybeSingle();
    if (!holding) throw new Error("That share record no longer exists.");

    const { data: live } = await supabaseAdmin
      .from("cap_certificates")
      .select("id")
      .eq("holding_id", data.holdingId)
      .in("status", ["draft", "issued"])
      .maybeSingle();
    if (live) throw new Error("This share record already has a live certificate.");

    const { createDraftCertificate } = await import("@/lib/cap-certificates.server");
    const created = await createDraftCertificate(supabaseAdmin, {
      holdingId: data.holdingId,
      createdBy: context.userId,
    });
    await audit(context, {
      clientId: data.clientId,
      action: "certificate_created_by_staff",
      target: created.certificate_no,
    });
    return created;
  });

/** Issues a draft certificate, naming the company signatory who authorised it. */
export const staffIssueCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        id: z.string().uuid(),
        signerName: z.string().trim().min(2).max(200),
        signerTitle: z.string().trim().max(200).optional().nullable(),
        instruction: z.string().trim().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const me = await staff(context);
    if (!me.canIssue) throw new Error("You do not have permission to issue certificates.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cert } = await supabaseAdmin
      .from("cap_certificates")
      .select("id, status, certificate_no")
      .eq("id", data.id)
      .eq("client_id", data.clientId)
      .maybeSingle();
    if (!cert) throw new Error("That certificate no longer exists.");
    if ((cert as any).status !== "draft") throw new Error("That certificate is already issued.");

    const { error } = await supabaseAdmin
      .from("cap_certificates")
      .update({
        status: "issued",
        signer_name: data.signerName,
        signer_title: data.signerTitle || null,
        signed_at: new Date().toISOString(),
        signed_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await audit(context, {
      clientId: data.clientId,
      action: "certificate_issued_by_staff",
      target: String((cert as any).certificate_no),
      next: {
        signer: data.signerName,
        title: data.signerTitle ?? null,
        instruction: data.instruction,
      },
    });
    return { ok: true };
  });

/** Cancels a live certificate, optionally replacing it with a fresh draft. */
export const staffCancelCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        id: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
        reissue: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const me = await staff(context);
    if (!me.canIssue) throw new Error("You do not have permission to cancel certificates.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cert } = await supabaseAdmin
      .from("cap_certificates")
      .select("id, status, holding_id, certificate_no")
      .eq("id", data.id)
      .eq("client_id", data.clientId)
      .maybeSingle();
    if (!cert) throw new Error("That certificate no longer exists.");
    if (!["draft", "issued"].includes(String((cert as any).status))) {
      throw new Error("That certificate is no longer live.");
    }

    await supabaseAdmin
      .from("cap_certificates")
      .update({
        status: data.reissue ? "replaced" : "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_reason: data.reason,
      })
      .eq("id", data.id);

    let replacement: { id: string; certificate_no: string } | null = null;
    if (data.reissue) {
      const { createDraftCertificate } = await import("@/lib/cap-certificates.server");
      await supabaseAdmin
        .from("cap_holdings")
        .update({ certificate_no: null })
        .eq("id", (cert as any).holding_id);
      replacement = await createDraftCertificate(supabaseAdmin, {
        holdingId: String((cert as any).holding_id),
        createdBy: context.userId,
      });
      await supabaseAdmin
        .from("cap_certificates")
        .update({ replaced_by: replacement.id })
        .eq("id", data.id);
    }

    await audit(context, {
      clientId: data.clientId,
      action: data.reissue ? "certificate_replaced_by_staff" : "certificate_cancelled_by_staff",
      target: String((cert as any).certificate_no),
      next: { reason: data.reason, replacement: replacement?.certificate_no ?? null },
    });
    return { ok: true, replacement };
  });
