import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FUND_REQUEST_KINDS, milestones, requestLifecycle } from "@/lib/self-service-model";

/**
 * Fund-manager self-service requests. A request is a fund_requests row with
 * status "submitted" — it never creates an offering, fund, SOW, entity or any
 * regulatory configuration. Harmonious turns it into a fund setup.
 */

/** Clients this person may request a fund for: own (non read-only) membership, or clients of funds they manage. */
async function requestableClients(context: any): Promise<{ id: string; name: string }[]> {
  const s = context.supabase;
  const [{ data: members }, { data: managed }] = await Promise.all([
    s.from("client_users").select("client_id, client_role").eq("user_id", context.userId),
    s.from("fund_managers").select("offering_id").eq("user_id", context.userId),
  ]);
  const ids = new Set<string>(
    ((members ?? []) as any[]).filter((m) => m.client_role !== "client_readonly").map((m) => String(m.client_id)),
  );
  const offeringIds = ((managed ?? []) as any[]).map((m) => m.offering_id);
  if (offeringIds.length) {
    const { data: offerings } = await s.from("offerings").select("client_id").in("id", offeringIds);
    for (const o of (offerings ?? []) as any[]) if (o.client_id) ids.add(String(o.client_id));
  }
  if (!ids.size) return [];
  const { data: clients } = await s.from("clients").select("id, name").in("id", [...ids]);
  return ((clients ?? []) as any[]).map((c) => ({ id: String(c.id), name: String(c.name ?? "Your firm") }));
}

export const getFundRequestOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ clients: await requestableClients(context) }));

export const submitFundSetupRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid().nullish(),
        kind: z.enum(FUND_REQUEST_KINDS.map((k) => k.value) as [string, ...string[]]),
        fundName: z.string().trim().min(2).max(160),
        strategy: z.string().trim().max(2000).nullish(),
        targetSizeCents: z.number().int().nonnegative().nullish(),
        expectedInvestors: z.number().int().nonnegative().max(100000).nullish(),
        expectedLaunchDate: z.string().trim().max(20).nullish(),
        jurisdiction: z.string().trim().max(80).nullish(),
        entityPreference: z.string().trim().max(80).nullish(),
        formationNeeded: z.enum(["existing", "formation", "unsure"]).default("unsure"),
        setupNotes: z.string().trim().max(2000).nullish(),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const clients = await requestableClients(context);
    const client = data.clientId ? clients.find((c) => c.id === data.clientId) : clients.length === 1 ? clients[0] : undefined;
    if (!client) throw new Error("Forbidden: you can only request a fund for your own firm.");
    const kind = FUND_REQUEST_KINDS.find((k) => k.value === data.kind)!;
    const notes = [
      data.strategy ? `Strategy / purpose: ${data.strategy}` : null,
      `Entity: ${data.formationNeeded === "existing" ? "existing entity" : data.formationNeeded === "formation" ? "formation needed" : "not sure"}`,
      data.setupNotes ? `Setup notes: ${data.setupNotes}` : null,
      "Offering structure to be reviewed with Harmonious.",
    ]
      .filter(Boolean)
      .join("\n");
    const { data: row, error } = await context.supabase
      .from("fund_requests")
      .insert({
        client_id: client.id,
        fund_name: data.fundName,
        fund_type: kind.fundType,
        entity_type: data.entityPreference ?? null,
        jurisdiction: data.jurisdiction ?? null,
        target_raise_cents: data.targetSizeCents ?? null,
        expected_investors: data.expectedInvestors ?? null,
        expected_launch_date: data.expectedLaunchDate || null,
        contact_email: null,
        services: [],
        notes,
        status: "submitted",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { requestId: row.id as string };
  });

async function loadRequests(context: any, requestId?: string) {
  const s = context.supabase;
  let q = s
    .from("fund_requests")
    .select("id, client_id, fund_name, fund_type, status, offering_id, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (requestId) q = q.eq("id", requestId);
  const { data: requests } = await q;
  const list = (requests ?? []) as any[];
  if (!list.length) return [];
  const { data: setups } = await s
    .from("fund_setups")
    .select("id, fund_request_id, stage, launch_state, launched_at")
    .in("fund_request_id", list.map((r) => r.id));
  const setupList = (setups ?? []) as any[];
  const { data: tasks } = setupList.length
    ? await s.from("fund_setup_tasks").select("setup_id, section, status").in("setup_id", setupList.map((x) => x.id))
    : { data: [] };
  return list.map((r) => {
    const setup = setupList.find((x) => x.fund_request_id === r.id) ?? null;
    const own = ((tasks ?? []) as any[]).filter((t) => setup && t.setup_id === setup.id);
    return {
      id: r.id as string,
      fundName: r.fund_name as string,
      fundType: r.fund_type as string | null,
      offeringId: (r.offering_id as string | null) ?? null,
      createdAt: r.created_at as string,
      lifecycle: requestLifecycle(r, setup, own),
      milestones: setup ? milestones(own) : null,
    };
  });
}

export const getMyFundRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ requests: await loadRequests(context) }));

export const getFundSetupTracker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const [request] = await loadRequests(context, data.requestId);
    if (!request) throw new Error("This fund request is not available.");
    return request;
  });
