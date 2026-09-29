import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { staffProfile } from "@/lib/harmonious-staff";
import { can, capabilitiesFor } from "@/lib/ops-capabilities";
import { structureForFundType } from "@/lib/fund-setup-canonical";

async function staff(context: any) {
  const { data: roles, error: roleError } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (roleError) throw new Error("Unable to verify staff access.");
  const profile = staffProfile((roles ?? []).map((r: any) => String(r.role)));
  if (!profile.isHarmoniousStaff) throw new Error("Individual Harmonious staff access required.");
  // Classification history is deliberately not readable by ordinary users.
  // After verifying the signed-in staff role, read only this actor's latest row.
  const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const { data: classification, error: classificationError } = await db.from("access_account_classifications")
    .select("classification").eq("user_id", context.userId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
  if (classificationError || classification?.classification !== "individual") throw new Error("Individual Harmonious staff access required.");
  return { profile, roles: (roles ?? []).map((r: any) => String(r.role)) };
}

/** Minimal fund index: no investor, bank, tax, identity, or compliance data. */
export const listStaffFunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { roles } = await staff(context);
    const canPrepare = can(capabilitiesFor(roles), "funds", "prepare");
    const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const canSeeOperations = can(capabilitiesFor(roles), "funds", "see");
    const [{ data: funds, error }, { data: clients, error: clientError }, { data: setups, error: setupError }] = await Promise.all([
      db.from("offerings").select("id,name,summary,fund_type,client_id,consolidated_into,created_at").order("name").limit(5000),
      db.from("clients").select("id,name").limit(5000),
      canSeeOperations ? db.from("fund_setups").select("offering_id,stage,launch_state").limit(5000) : Promise.resolve({ data: [], error: null }),
    ]);
    if (error || clientError || setupError) throw new Error("Unable to load funds.");
    const names = new Map((clients ?? []).map((c) => [c.id, c.name]));
    const setupByFund = new Map((setups ?? []).map((s) => [s.offering_id, s]));
    return { canPrepare, rows: (funds ?? []).map((f) => ({
      id: f.id, name: f.name, summary: f.summary, fundType: f.fund_type, clientId: f.client_id,
      clientName: f.client_id ? names.get(f.client_id) ?? null : null,
      retired: !!f.consolidated_into, setupStage: setupByFund.get(f.id)?.stage ?? null,
      launchState: setupByFund.get(f.id)?.launch_state ?? null,
      createdAt: f.created_at,
    })) };
  });

export const listStaffClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await staff(context);
    const { requireOperations } = await import("@/lib/ops-access.functions");
    await requireOperations(context, "funds", "prepare");
    const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const { data, error } = await db.from("clients").select("id,name").order("name").limit(5000);
    if (error) throw new Error("Unable to load clients.");
    return data ?? [];
  });

const newFund = z.object({ name: z.string().trim().min(2).max(160), clientId: z.string().uuid(), fundType: z.enum(["SPV", "Venture Capital", "Private Equity"]), regType: z.enum(["506b", "506c", "regcf", "rega", "regaplus"]) });
export const createStaffFund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(newFund.parse)
  .handler(async ({ context, data }) => {
    await staff(context);
    const { requireOperations } = await import("@/lib/ops-access.functions");
    await requireOperations(context, "funds", "prepare");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: client, error: clientError } = await supabaseAdmin.from("clients").select("id").eq("id", data.clientId).maybeSingle();
    if (clientError || !client) throw new Error("Select an existing Client.");
    const { assertFundIdentityFree } = await import("@/lib/fund-integrity.server");
    await assertFundIdentityFree({ name: data.name }, context.userId);
    const slug = `${data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 55) || "fund"}-${crypto.randomUUID().slice(0, 8)}`;
    const { seedFundFeeColumns } = await import("@/lib/fee-rates.server");
    const fees = await seedFundFeeColumns(context.supabase, data.clientId);
    // A draft shell is never public or open for investment. The user explicitly
    // selects the preliminary regulatory route; this does not approve a filing.
    const { data: inserted, error } = await supabaseAdmin.from("offerings").insert({
      name: data.name, slug, client_id: data.clientId, fund_type: data.fundType,
      reg_type: data.regType, is_open: false, public_page_enabled: false, ...fees,
    }).select("id").single();
    if (error || !inserted) {
      const { duplicateFundIdFromError } = await import("@/lib/fund-integrity");
      const existingId = duplicateFundIdFromError(error?.message ?? "");
      if (existingId) throw new Error(`EXISTING_FUND:${existingId}:Open the existing Fund instead.`);
      throw new Error(error?.message ?? "Unable to create fund.");
    }
    const { safeCreateSnapshot } = await import("@/lib/commercial-pricing.server");
    const { data: serviceConfig } = await supabaseAdmin.from("client_service_configurations").select("config").eq("client_id", data.clientId).is("superseded_at", null).maybeSingle();
    await safeCreateSnapshot({ offeringId: inserted.id, clientId: data.clientId, actorId: context.userId, source: "fund_setup", serviceConfig: serviceConfig?.config ?? null });
    const { bootstrapFundSetup } = await import("@/lib/fund-setup.server");
    await bootstrapFundSetup(context.userId, {
      offeringId: inserted.id, clientId: data.clientId, structure: structureForFundType(data.fundType), displayName: data.name,
    });
    const { error: auditError } = await supabaseAdmin.from("offering_audit_events").insert({
      offering_id: inserted.id, actor_id: context.userId, event_type: "offering_created",
      changes: [{ field: "name", from: null, to: data.name }], summary: "Created draft fund for setup",
    });
    if (auditError) throw new Error(auditError.message);
    return { id: inserted.id };
  });

export const getStaffFundSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().uuid() }).parse)
  .handler(async ({ context, data }) => {
    const { roles } = await staff(context);
    const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const { data: fund, error } = await db.from("offerings").select("id,name,fund_type,client_id,consolidated_into").eq("id", data.offeringId).maybeSingle();
    if (error || !fund) throw new Error("Fund not found.");
    const [{ data: client }, { data: setup }] = await Promise.all([
      fund.client_id ? db.from("clients").select("name").eq("id", fund.client_id).maybeSingle() : Promise.resolve({ data: null }),
      db.from("fund_setups").select("id,stage,launch_state").eq("offering_id", fund.id).maybeSingle(),
    ]);
    const canSeeOperations = can(capabilitiesFor(roles), "funds", "see");
    const [{ data: formation }, { data: tasks }, { data: conditions }, { count: approvalCount }] = setup && canSeeOperations ? await Promise.all([
      db.from("fund_entity_formation").select("step,formation_document_id,certificate_document_id,ein_letter_document_id").eq("setup_id", setup.id).maybeSingle(),
      db.from("fund_setup_tasks").select("id,task_key,label,status,blocking").eq("setup_id", setup.id).order("sort_order"),
      db.from("fund_launch_conditions").select("id,condition_key,label,required,satisfied").eq("setup_id", setup.id).order("sort_order"),
      db.from("fund_launch_approvals").select("id", { count: "exact", head: true }).eq("setup_id", setup.id),
    ]) : [{ data: null }, { data: [] }, { data: [] }, { count: 0 }];
    let approvals: { id: string; decision: string; reason: string | null; decidedAt: string; decidedBy: string; unmet: number }[] = [];
    let isPreparer = false;
    if (setup && canSeeOperations) {
      const [{ data: rows }, { launchPreparers }] = await Promise.all([
        db.from("fund_launch_approvals").select("id,decision,reason,decided_by,decided_at,unmet_conditions").eq("setup_id", setup.id).order("decided_at", { ascending: false }),
        import("@/lib/fund-setup.server"),
      ]);
      const ids = [...new Set((rows ?? []).map((r) => r.decided_by))];
      const { data: people } = ids.length ? await db.from("profiles").select("user_id,legal_name,email").in("user_id", ids) : { data: [] as any[] };
      const nameOf = (id: string) => { const p = (people ?? []).find((x: any) => x.user_id === id); return p?.legal_name || p?.email || "Harmonious staff"; };
      approvals = (rows ?? []).map((r) => ({ id: r.id, decision: r.decision, reason: r.reason, decidedAt: r.decided_at, decidedBy: nameOf(r.decided_by), unmet: Array.isArray(r.unmet_conditions) ? r.unmet_conditions.length : 0 }));
      isPreparer = (await launchPreparers(setup.id)).has(context.userId);
    }
    return {
      name: fund.name, fundType: fund.fund_type, clientName: client?.name ?? null,
      retired: Boolean(fund.consolidated_into), formationStep: formation?.step ?? null,
      launchState: canSeeOperations ? setup?.launch_state ?? null : null, setupStage: canSeeOperations ? setup?.stage ?? null : null,
      hasSetup: Boolean(setup), setupId: (setup?.id ?? null) as string | null, approvalCount: approvalCount ?? 0, approvals, isPreparer,
      evidence: { formation: Boolean(formation?.formation_document_id), certificate: Boolean(formation?.certificate_document_id), einLetter: Boolean(formation?.ein_letter_document_id) },
      tasks: (tasks ?? []).filter((t) => t.blocking).map((t) => ({ id: t.id, key: t.task_key as string, label: t.label, status: t.status as string })),
      conditions: (conditions ?? []).filter((c) => c.required).map((c) => ({ id: c.id, key: c.condition_key as string, label: c.label, satisfied: c.satisfied })),
      canSeeOperations, canUseCanonical: roles.includes("admin"),
      canUseOperations: can(capabilitiesFor(roles), "funds", "prepare"),
    };
  });

const details = z.object({ offeringId: z.string().uuid(), summary: z.string().max(1000) });
export const saveStaffFundSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(details.parse)
  .handler(async ({ context, data }) => {
    await staff(context);
    const { requireOperations } = await import("@/lib/ops-access.functions");
    await requireOperations(context, "funds", "prepare");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: fund, error: readError } = await supabaseAdmin.from("offerings").select("summary,consolidated_into").eq("id", data.offeringId).maybeSingle();
    if (readError || !fund || fund.consolidated_into) throw new Error("This fund cannot be edited.");
    if ((fund.summary ?? "") === data.summary) return { ok: true };
    const { error } = await supabaseAdmin.from("offerings").update({ summary: data.summary }).eq("id", data.offeringId).is("consolidated_into", null);
    if (error) throw new Error(error.message);
    const { error: auditError } = await supabaseAdmin.from("offering_audit_events").insert({
      offering_id: data.offeringId, event_type: "offering_updated", actor_id: context.userId,
      changes: [{ field: "summary", from: fund.summary ?? null, to: data.summary }], summary: "Updated fund summary",
    });
    if (auditError) throw new Error(auditError.message);
    return { ok: true };
  });