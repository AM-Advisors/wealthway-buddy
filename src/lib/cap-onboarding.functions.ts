import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Cap table setup.
 *
 *  Before a founder records any shares we ask them to confirm the company
 *  itself: legal name, how and where it was formed, how many shares the company
 *  is authorised to issue, and who signs certificates. Harmonious records what
 *  the company tells us — we do not verify or advise on it. */

export const CAP_ENTITY_TYPES = [
  "Corporation",
  "LLC",
  "LP",
  "Trust",
  "Other",
] as const;

const READONLY = "client_readonly";

type Who = { clientId: string | null; role: string | null; canEdit: boolean };

async function access(context: any, wanted?: string | null): Promise<Who> {
  const { data } = await context.supabase
    .from("client_users")
    .select("client_id, client_role")
    .eq("user_id", context.userId);
  const rows = ((data ?? []) as any[]).map((r) => ({
    clientId: String(r.client_id),
    role: String(r.client_role ?? ""),
  }));
  const ids = [...new Set(rows.map((r) => r.clientId))];
  const clientId = wanted && ids.includes(wanted) ? wanted : (ids[0] ?? null);
  const role = rows.find((r) => r.clientId === clientId)?.role ?? null;
  return { clientId, role, canEdit: Boolean(role) && role !== READONLY };
}

const detailsSchema = z.object({
  company_legal_name: z.string().trim().max(200).optional().nullable(),
  entity_type: z.string().trim().max(60).optional().nullable(),
  state_formed: z.string().trim().max(80).optional().nullable(),
  date_formed: z.string().trim().max(20).optional().nullable(),
  authorized_shares: z.number().nonnegative().optional().nullable(),
  par_value_cents: z.number().int().nonnegative().optional().nullable(),
  fiscal_year_end: z.string().trim().max(40).optional().nullable(),
  signatory_name: z.string().trim().max(160).optional().nullable(),
  signatory_title: z.string().trim().max(160).optional().nullable(),
  signatory_email: z.string().trim().max(255).optional().nullable(),
  records_source: z.string().trim().max(400).optional().nullable(),
  acknowledged: z.boolean().optional(),
});

function toRow(d: z.infer<typeof detailsSchema>) {
  return {
    company_legal_name: d.company_legal_name || null,
    entity_type: d.entity_type || null,
    state_formed: d.state_formed || null,
    date_formed: d.date_formed || null,
    authorized_shares: d.authorized_shares ?? null,
    par_value_cents: d.par_value_cents ?? null,
    fiscal_year_end: d.fiscal_year_end || null,
    signatory_name: d.signatory_name || null,
    signatory_title: d.signatory_title || null,
    signatory_email: d.signatory_email || null,
    records_source: d.records_source || null,
    acknowledged: Boolean(d.acknowledged),
  };
}

/** The gate: throws unless this company has finished its cap table setup. */
export async function assertCapOnboarding(context: any, clientId: string) {
  const { data } = await context.supabase
    .from("cap_onboarding")
    .select("completed_at")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!(data as any)?.completed_at) {
    throw new Error("Complete your cap table setup before recording shares.");
  }
}

export const getCapOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const who = await access(context, data.clientId ?? null);
    if (!who.clientId) {
      return { clientId: null, canEdit: false, complete: false, record: null, clientName: null };
    }
    const [{ data: record }, { data: client }] = await Promise.all([
      context.supabase
        .from("cap_onboarding")
        .select("*")
        .eq("client_id", who.clientId)
        .maybeSingle(),
      context.supabase.from("clients").select("name").eq("id", who.clientId).maybeSingle(),
    ]);
    return {
      clientId: who.clientId,
      canEdit: who.canEdit,
      complete: Boolean((record as any)?.completed_at),
      record: record ?? null,
      clientName: (client as any)?.name ?? null,
    };
  });

/** Save progress without finishing. */
export const saveCapOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid(), details: detailsSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await access(context, data.clientId);
    if (!who.clientId || who.clientId !== data.clientId || !who.canEdit) {
      throw new Error("You do not have permission to change this cap table setup.");
    }
    const { error } = await context.supabase
      .from("cap_onboarding")
      .upsert(
        { client_id: who.clientId, created_by: context.userId, ...toRow(data.details) },
        { onConflict: "client_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Finish setup: this is what unlocks recording shares. */
export const completeCapOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid(), details: detailsSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await access(context, data.clientId);
    if (!who.clientId || who.clientId !== data.clientId || !who.canEdit) {
      throw new Error("You do not have permission to change this cap table setup.");
    }
    const row = toRow(data.details);
    const missing: string[] = [];
    if (!row.company_legal_name) missing.push("company legal name");
    if (!row.entity_type) missing.push("entity type");
    if (!row.state_formed) missing.push("where it was formed");
    if (!row.authorized_shares) missing.push("authorised shares");
    if (!row.signatory_name) missing.push("who signs certificates");
    if (!row.acknowledged) missing.push("confirmation that these details are correct");
    if (missing.length) throw new Error(`Still needed: ${missing.join(", ")}.`);

    const { error } = await context.supabase.from("cap_onboarding").upsert(
      {
        client_id: who.clientId,
        created_by: context.userId,
        ...row,
        completed_at: new Date().toISOString(),
        completed_by: context.userId,
      },
      { onConflict: "client_id" },
    );
    if (error) throw new Error(error.message);

    await context.supabase.from("contract_audit_events").insert({
      actor_id: context.userId,
      client_id: who.clientId,
      area: "cap_table",
      action: "cap_onboarding_completed",
      target: who.clientId,
      new_value: row as any,
      source: "web",
    });

    return { ok: true };
  });
