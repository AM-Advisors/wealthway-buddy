import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

/**
 * Client bookkeeping chooser and request. Reads only the caller's own organization's
 * entities, records a request for Harmonious to scope, and never prices, charges,
 * enrolls or schedules work.
 */
async function myClientIds(context: any): Promise<string[]> {
  const { clientAccessIds } = await import("@/lib/client-membership");
  return clientAccessIds(context.supabase, context.userId);
}

export const getBookkeepingChooser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientIds = await myClientIds(context);
    if (!clientIds.length) return { clientId: null, entities: [] };
    const clientId = clientIds[0] as string;
    // RLS returns only entities of organizations the caller is a direct member of.
    const { data: entities } = await context.supabase.from("client_entities")
      .select("id, legal_name, entity_type, offering_id, status").in("client_id", clientIds).order("legal_name");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadEntityCoverage } = await import("@/lib/bookkeeping-coverage.server");
    const out = [];
    for (const e of ((entities ?? []) as any[]).filter((x) => x.status !== "archived")) {
      const coverage = await loadEntityCoverage(supabaseAdmin, e);
      out.push({ id: e.id as string, legalName: e.legal_name as string, entityType: e.entity_type as string, offeringId: (e.offering_id as string | null) ?? null, coverage: coverage.rows, fundAccounting: coverage.fundAccounting });
    }
    return { clientId, entities: out };
  });

const requestSchema = z.object({
  entityId: z.string().uuid(),
  option: z.enum(["self_service", "review", "managed"]),
  frequency: z.enum(["monthly", "quarterly", "annual"]).nullable(),
  supportLevel: z.enum(["self_serve", "core", "plus", "white_glove", "institutional"]),
  billing: z.enum(["monthly", "quarterly", "annual"]),
  addons: z.array(z.enum(["initial_setup", "historical_cleanup", "bill_pay_invoicing", "payroll", "tax_preparation", "cfo_advisory"])).max(6),
  accountingMethod: z.enum(["cash", "accrual"]),
  financialAccounts: z.number().int().nonnegative().max(10000),
  monthlyTransactions: z.number().int().nonnegative().max(1000000),
  startOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(2000).default(""),
});

export const requestBookkeeping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => requestSchema.parse(i))
  .handler(async ({ context, data }) => {
    const clientIds = await myClientIds(context);
    if (!clientIds.length) throw new Error("You aren't linked to an organization yet.");
    const { data: entity } = await context.supabase.from("client_entities")
      .select("id, client_id, legal_name, entity_type, offering_id").eq("id", data.entityId).maybeSingle();
    if (!entity || !clientIds.includes((entity as any).client_id)) throw new Error("Choose one of your organization's entities.");
    const opts = await import("@/lib/bookkeeping-options");
    const def = opts.BOOKKEEPING_OPTIONS[data.option];
    const availability = opts.optionAvailableFor(data.option, { entityType: (entity as any).entity_type, offeringId: (entity as any).offering_id });
    if (!availability.available) throw new Error(availability.reason ?? "That option isn't available for this entity.");
    const frequency = opts.resolveFrequency(data.option, data.frequency);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadEntityCoverage } = await import("@/lib/bookkeeping-coverage.server");
    const { BOOKKEEPING_KEY } = await import("@/lib/bookkeeping-model");
    const coverage = await loadEntityCoverage(supabaseAdmin, entity as any);
    const conflict = opts.coverageConflicts({ option: data.option, effectiveOn: data.startOn, termMonths: 12 }, coverage.rows);
    if (conflict.blocked) throw new Error(conflict.reason ?? "This entity is already covered for this period.");
    const support = opts.SUPPORT_LEVELS.find((l) => l.key === data.supportLevel)!;
    const answers: Record<string, string> = {
      bookkeeping_option: def.name,
      service_frequency: frequency ? opts.FREQUENCY_LABELS[frequency] : "None (client maintains the books)",
      support_level: `${support.name} · ${support.response}`,
      billing_frequency: opts.FREQUENCY_LABELS[data.billing],
      accounting_method: data.accountingMethod,
      bank_and_credit_accounts: String(data.financialAccounts),
      monthly_transactions: String(data.monthlyTransactions),
      requested_start: data.startOn,
      add_ons_quote_requested: data.addons.map((k) => opts.ADDONS.find((a) => a.key === k)?.name ?? k).join("; ") || "None",
      already_covered_exclude_from_quote: conflict.covered.map((s) => opts.CHARGED_LABELS[s]).join("; ") || "None",
      quote_only_this_scope: conflict.uncovered.map((s) => opts.CHARGED_LABELS[s]).join("; "),
      notes: data.notes || "None",
    };
    const { data: created, error } = await context.supabase.from("client_intake_requests").insert({
      client_id: (entity as any).client_id, entity_id: (entity as any).id, intent: "add_service",
      summary: `${def.name} for ${(entity as any).legal_name}`, answers, requested_service_keys: [BOOKKEEPING_KEY],
      status: "submitted", requested_by: context.userId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    await context.supabase.from("contract_audit_events").insert({
      actor_id: context.userId, client_id: (entity as any).client_id, area: "engagements", source: "portal",
      action: "intake_request_submitted", target: (created as any).id, new_value: { intent: "add_service", bookkeeping_option: data.option } as any,
    });
    return { id: (created as any).id as string, excluded: conflict.covered, uncovered: conflict.uncovered };
  });
