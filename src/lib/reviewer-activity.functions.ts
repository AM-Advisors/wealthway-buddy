import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function reviewerRoles(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "fund_manager"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: reviewer access required.");
  return (data as any[]).map((r) => r.role as string);
}

const listSchema = z.object({
  offeringId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  outcome: z.string().trim().max(40).optional(),
  days: z.number().int().min(1).max(365).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).max(5000).optional(),
});

/**
 * Reviewer activity feed: who approved, delayed or declined what, and when.
 * Admins see everything; fund managers see their assigned funds plus their own actions.
 */
export const listReviewerActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await reviewerRoles(supabase, userId);
    const isAdmin = roles.includes("admin");
    const limit = data.limit ?? 50;
    const offset = data.offset ?? 0;

    // Funds the caller can work in, for the filter list.
    let fundQuery = supabase.from("offerings").select("id, name").order("name");
    if (!isAdmin) {
      const { data: assignments, error: assignError } = await supabase
        .from("fund_managers")
        .select("offering_id")
        .eq("user_id", userId);
      if (assignError) throw new Error(assignError.message);
      const ids = [...new Set((assignments ?? []).map((a: any) => a.offering_id as string))];
      fundQuery = ids.length ? fundQuery.in("id", ids) : fundQuery.in("id", [""]);
    }
    const { data: funds } = await fundQuery;

    let query = supabase
      .from("reviewer_activity")
      .select(
        "id, actor_id, offering_id, application_id, action, area, outcome, summary, note, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (data.offeringId) query = query.eq("offering_id", data.offeringId);
    if (data.actorId) query = query.eq("actor_id", data.actorId);
    if (data.outcome) query = query.eq("outcome", data.outcome);
    if (data.days) {
      const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
      query = query.gte("created_at", since);
    }

    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);

    const events = (rows ?? []) as any[];
    const actorIds = [...new Set(events.map((e) => e.actor_id as string))];
    const applicationIds = [
      ...new Set(events.map((e) => e.application_id as string).filter(Boolean)),
    ];

    const [{ data: actorProfiles }, { data: apps }] = await Promise.all([
      actorIds.length
        ? supabase.from("profiles").select("user_id, legal_name, email").in("user_id", actorIds)
        : Promise.resolve({ data: [] as any[] }),
      applicationIds.length
        ? supabase.from("investor_applications").select("id, user_id").in("id", applicationIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const investorIds = [...new Set((apps ?? []).map((a: any) => a.user_id as string))];
    const { data: investorProfiles } = investorIds.length
      ? await supabase.from("profiles").select("user_id, legal_name, email").in("user_id", investorIds)
      : { data: [] as any[] };

    const nameOf = new Map<string, string>();
    for (const p of [...(actorProfiles ?? []), ...(investorProfiles ?? [])] as any[]) {
      nameOf.set(p.user_id as string, (p.legal_name as string) || (p.email as string) || "Reviewer");
    }
    const investorByApp = new Map<string, string>();
    for (const a of (apps ?? []) as any[]) {
      investorByApp.set(a.id as string, nameOf.get(a.user_id as string) ?? "Investor");
    }
    const fundName = new Map<string, string>();
    for (const f of (funds ?? []) as any[]) fundName.set(f.id as string, f.name as string);

    return {
      isAdmin,
      total: count ?? events.length,
      funds: ((funds ?? []) as any[]).map((f) => ({ id: f.id as string, name: f.name as string })),
      reviewers: actorIds.map((id) => ({ id, name: nameOf.get(id) ?? "Reviewer" })),
      events: events.map((e) => ({
        id: e.id as string,
        createdAt: e.created_at as string,
        actorName: nameOf.get(e.actor_id as string) ?? "Reviewer",
        actorId: e.actor_id as string,
        fundName: e.offering_id ? (fundName.get(e.offering_id as string) ?? null) : null,
        applicationId: (e.application_id as string) ?? null,
        investorName: e.application_id
          ? (investorByApp.get(e.application_id as string) ?? null)
          : null,
        action: e.action as string,
        area: (e.area as string) ?? null,
        outcome: (e.outcome as string) ?? null,
        summary: e.summary as string,
        note: (e.note as string) ?? null,
      })),
    };
  });
