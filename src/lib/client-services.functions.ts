import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { whoIsStaff } from "@/lib/service-catalog.functions";

/** The universal request router: what would you like to do? */
export const REQUEST_INTENTS = [
  {
    value: "launch_fund",
    label: "Launch a Fund",
    blurb: "Set up a VC, private equity, hedge, real estate or other pooled investment fund.",
    suggests: ["fund_administration", "investor_onboarding", "kyc_aml", "registered_agent"],
    questions: [],
  },
  {
    value: "launch_spv",
    label: "Launch an SPV",
    blurb: "Set up a single-purpose investment vehicle for a specific investment or transaction.",
    suggests: ["spv", "investor_onboarding", "kyc_aml"],
    questions: [],
  },
  {
    value: "move_fund_spv",
    label: "Move an Existing Fund/SPV to Harmonious",
    blurb: "Bring a fund or SPV that another administrator looks after today.",
    suggests: ["migration", "fund_administration"],
    questions: [
      { key: "entity_name", label: "Which fund or SPV?" },
      { key: "current_provider", label: "Who administers it today?" },
      { key: "target_date", label: "When would you like the move finished?" },
    ],
  },
  {
    value: "add_company",
    label: "Add a Company",
    blurb: "Add an operating company to your relationship.",
    suggests: ["registered_agent", "cap_table"],
    questions: [
      { key: "entity_name", label: "What is the company's legal name?" },
      { key: "jurisdiction", label: "Where is it formed?" },
    ],
  },
  {
    value: "add_gp_mgmt",
    label: "Add a GP / Management Company",
    blurb: "Add the general partner or management company behind your funds.",
    suggests: ["registered_agent"],
    questions: [
      { key: "entity_name", label: "What is the entity's legal name?" },
      { key: "entity_role", label: "Is it a GP, a management company, or both?" },
      { key: "jurisdiction", label: "Where is it formed?" },
    ],
  },
  {
    value: "cap_table",
    label: "Set Up / Import Cap Table",
    blurb: "Start a cap table with us or import one from a spreadsheet or another provider.",
    suggests: ["cap_table"],
    questions: [
      { key: "entity_name", label: "Which company?" },
      { key: "current_provider", label: "Where is the cap table kept today?" },
    ],
  },
  {
    value: "launch_fund_spv",
    label: "Launch a fund or SPV",
    blurb: "Stand up a new fund, SPV or series and get it ready to take investors.",
    suggests: ["fund_administration", "investor_onboarding", "kyc_aml", "registered_agent"],
    questions: [
      { key: "entity_name", label: "What will the fund or SPV be called?" },
      { key: "strategy", label: "What will it invest in?" },
      { key: "target_size", label: "Roughly how much are you raising?" },
      { key: "target_close", label: "When would you like to be ready to accept investors?" },
    ],
  },
  {
    value: "add_service",
    label: "Add a Harmonious service",
    blurb: "Add something to an entity you already have with us.",
    suggests: [],
    questions: [
      { key: "service_wanted", label: "Which service do you need?" },
      { key: "why_now", label: "What has prompted this?" },
      { key: "when", label: "When do you need it live?" },
    ],
  },
  {
    value: "add_entity",
    label: "Add Another Entity",
    blurb: "Any other entity — a holding company, blocker, trust or other vehicle.",
    suggests: ["registered_agent"],
    questions: [
      { key: "entity_name", label: "What is the entity's legal name?" },
      { key: "entity_type", label: "What kind of entity is it?" },
      { key: "jurisdiction", label: "Where is it formed?" },
    ],
  },
  {
    value: "move_to_harmonious",
    label: "Move to Harmonious",
    blurb: "Move your whole relationship, several entities or records across to us.",
    suggests: ["migration", "cap_table"],
    questions: [
      { key: "current_provider", label: "Who looks after it today?" },
      { key: "what_moves", label: "What needs to move across?" },
      { key: "target_date", label: "When would you like the move finished?" },
    ],
  },
  {
    value: "complete_filing",
    label: "Complete a filing",
    blurb: "A regulatory or state filing that needs preparing and submitting.",
    suggests: ["regulatory_filing"],
    questions: [
      { key: "filing_type", label: "Which filing is it?" },
      { key: "deadline", label: "What is the deadline?" },
      { key: "entity", label: "Which entity does it relate to?" },
    ],
  },
  {
    value: "transaction_support",
    label: "Get transaction support",
    blurb: "A closing, transfer, secondary or payment that needs handling.",
    suggests: ["paymaster", "transaction_support"],
    questions: [
      { key: "transaction_type", label: "What kind of transaction is it?" },
      { key: "amount", label: "Roughly what size is it?" },
      { key: "timing", label: "When does it need to happen?" },
    ],
  },
  {
    value: "something_else",
    label: "Something else",
    blurb: "Tell us what you need and we'll work out the right service.",
    suggests: [],
    questions: [{ key: "detail", label: "What do you need?" }],
  },
] as const;

export const intentLabel = (v: string) =>
  REQUEST_INTENTS.find((i) => i.value === v)?.label ?? v;

async function myClientIds(context: any) {
  const { data } = await context.supabase
    .from("client_users")
    .select("client_id")
    .eq("user_id", context.userId);
  return ((data ?? []) as any[]).map((r) => String(r.client_id));
}

/** "Your Harmonious services": engagements grouped by the entity they cover. */
export const getMyServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientIds = await myClientIds(context);
    if (clientIds.length === 0) {
      return { clientId: null, clientName: null, entities: [], clientWide: [], requests: [] };
    }
    const clientId = clientIds[0] as string;

    const [clientRes, entitiesRes, engagementsRes, servicesRes, linkRes, requestsRes] =
      await Promise.all([
        context.supabase
          .from("clients")
          .select("id, name, legal_name")
          .eq("id", clientId)
          .maybeSingle(),
        context.supabase
          .from("client_entities")
          .select("id, legal_name, entity_type, status")
          .eq("client_id", clientId)
          .order("legal_name"),
        context.supabase
          .from("client_engagements")
          .select("id, entity_id, title, delivery_status, effective_date, billing_frequency")
          .eq("client_id", clientId),
        context.supabase
          .from("engagement_services")
          .select(
            "id, engagement_id, service_name, service_key, category, agreed_price_cents, billing_frequency, pricing_model, status, effective_date",
          )
          .eq("client_id", clientId),
        context.supabase.from("engagement_entities").select("engagement_id, entity_id"),
        context.supabase
          .from("client_intake_requests")
          .select("id, intent, summary, status, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

    const engagements = (engagementsRes.data ?? []) as any[];
    const services = (servicesRes.data ?? []) as any[];
    const links = (linkRes.data ?? []) as any[];

    const engagementView = (g: any) => {
      const own = services.filter((s) => s.engagement_id === g.id && s.status === "active");
      return {
        id: g.id as string,
        title: g.title as string,
        deliveryStatus: g.delivery_status as string,
        effectiveDate: (g.effective_date as string) ?? null,
        activeServiceCount: own.length,
        annualCents: own
          .filter((s) => s.billing_frequency === "annual" || s.pricing_model === "annual")
          .reduce((n, s) => n + Number(s.agreed_price_cents ?? 0), 0),
        oneTimeCents: own
          .filter((s) => s.billing_frequency === "one_time" && s.pricing_model !== "annual")
          .reduce((n, s) => n + Number(s.agreed_price_cents ?? 0), 0),
        services: own.map((s) => ({
          id: s.id as string,
          name: s.service_name as string,
          category: (s.category as string) ?? null,
        })),
      };
    };

    const entityIdsFor = (engagementId: string) => {
      const linked = links
        .filter((l) => l.engagement_id === engagementId)
        .map((l) => String(l.entity_id));
      const direct = engagements.find((g) => g.id === engagementId)?.entity_id;
      if (direct) linked.push(String(direct));
      return Array.from(new Set(linked));
    };

    return {
      clientId,
      clientName: clientRes.data
        ? (((clientRes.data as any).legal_name ?? (clientRes.data as any).name) as string)
        : null,
      entities: ((entitiesRes.data ?? []) as any[]).map((e) => ({
        id: e.id as string,
        legalName: e.legal_name as string,
        entityType: e.entity_type as string,
        status: e.status as string,
        engagements: engagements
          .filter((g) => entityIdsFor(g.id).includes(String(e.id)))
          .map(engagementView),
      })),
      clientWide: engagements
        .filter((g) => entityIdsFor(g.id).length === 0)
        .map(engagementView),
      requests: ((requestsRes.data ?? []) as any[]).map((r) => ({
        id: r.id as string,
        intent: r.intent as string,
        summary: (r.summary as string) ?? null,
        status: r.status as string,
        createdAt: r.created_at as string,
      })),
    };
  });

/** The client tells us what they want to do; we route it to the right team. */
export const submitIntakeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        intent: z.enum([
          "launch_fund",
          "launch_spv",
          "move_fund_spv",
          "add_company",
          "add_gp_mgmt",
          "cap_table",
          "launch_fund_spv",
          "add_service",
          "add_entity",
          "move_to_harmonious",
          "complete_filing",
          "transaction_support",
          "something_else",
        ]),
        entityId: z.string().uuid().optional().nullable(),
        engagementId: z.string().uuid().optional().nullable(),
        summary: z.string().min(3),
        answers: z.record(z.string(), z.string()).default({}),
        requestedServiceKeys: z.array(z.string()).default([]),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const clientIds = await myClientIds(context);
    if (clientIds.length === 0) throw new Error("You aren't linked to an organisation yet.");
    const clientId = clientIds[0] as string;

    const { data: created, error } = await context.supabase
      .from("client_intake_requests")
      .insert({
        client_id: clientId,
        entity_id: data.entityId || null,
        engagement_id: data.engagementId || null,
        intent: data.intent,
        summary: data.summary.trim(),
        answers: data.answers,
        requested_service_keys: data.requestedServiceKeys,
        status: "submitted",
        requested_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("contract_audit_events").insert({
      actor_id: context.userId,
      client_id: clientId,
      area: "engagements",
      source: "portal",
      action: "intake_request_submitted",
      target: (created as any).id,
      new_value: { intent: data.intent } as any,
    });

    return { id: (created as any).id as string };
  });

/** The staff queue of everything clients have asked for through the router. */
export const listIntakeRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const who = await whoIsStaff(context);
    if (!who.isStaff) throw new Error("Forbidden: this queue is for the Harmonious team.");

    const { data, error } = await context.supabase
      .from("client_intake_requests")
      .select(
        "id, client_id, entity_id, intent, summary, answers, requested_service_keys, status, staff_note, created_at, clients(name, legal_name), client_entities(legal_name)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    return {
      access: { isStaff: who.isStaff, canManage: who.canManage },
      requests: ((data ?? []) as any[]).map((r) => ({
        id: r.id as string,
        clientId: r.client_id as string,
        clientName: (r.clients?.legal_name ?? r.clients?.name ?? "Client") as string,
        entityName: (r.client_entities?.legal_name as string) ?? null,
        intent: r.intent as string,
        summary: (r.summary as string) ?? null,
        answers: (r.answers ?? {}) as Record<string, string>,
        requestedServiceKeys: (r.requested_service_keys ?? []) as string[],
        status: r.status as string,
        staffNote: (r.staff_note as string) ?? null,
        createdAt: r.created_at as string,
      })),
    };
  });

/** Staff move a router request along. */
export const updateIntakeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["submitted", "in_review", "scoped", "converted", "declined"]),
        staffNote: z.string().optional().nullable(),
        resultingEngagementId: z.string().uuid().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const who = await whoIsStaff(context);
    if (!who.isStaff) throw new Error("Forbidden: this queue is for the Harmonious team.");

    const { data: updated, error } = await context.supabase
      .from("client_intake_requests")
      .update({
        status: data.status,
        staff_note: data.staffNote?.trim() || null,
        resulting_engagement_id: data.resultingEngagementId || null,
        assigned_to: context.userId,
      })
      .eq("id", data.id)
      .select("client_id")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("contract_audit_events").insert({
      actor_id: context.userId,
      client_id: (updated as any).client_id,
      area: "engagements",
      source: "portal",
      action: `intake_request_${data.status}`,
      target: data.id,
      new_value: { note: data.staffNote ?? null } as any,
    });

    return { ok: true };
  });
