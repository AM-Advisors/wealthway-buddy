import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PURPOSES = ["investor_wire", "capital_call", "expense", "distribution", "other"] as const;

async function roles(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "fund_manager"]);
  if (error) throw new Error(error.message);
  const list = (data ?? []).map((r: any) => r.role as string);
  if (list.length === 0) throw new Error("Forbidden: reviewer access required.");
  return { isAdmin: list.includes("admin") };
}

async function assignedFundIds(supabase: any, userId: string) {
  const { data, error } = await supabase.from("fund_managers").select("offering_id").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((a: any) => a.offering_id as string))] as string[];
}

/** Requests the signed-in reviewer may see: everything for admins, own funds for managers. */
export const listWireRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { isAdmin } = await roles(supabase, userId);

    let query = supabase
      .from("wire_requests")
      .select(
        "id, offering_id, application_id, requested_by, amount_cents, purpose, note, expected_date, status, reviewed_at, review_note, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (!isAdmin) {
      const ids = await assignedFundIds(supabase, userId);
      if (ids.length === 0) return { isAdmin, requests: [] as any[] };
      query = query.in("offering_id", ids);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const requests = (rows ?? []) as any[];

    const offeringIds = [...new Set(requests.map((r) => r.offering_id))];
    const applicationIds = [...new Set(requests.map((r) => r.application_id).filter(Boolean))];
    const people = [...new Set(requests.map((r) => r.requested_by))];

    const [{ data: funds }, { data: apps }, { data: profiles }] = await Promise.all([
      offeringIds.length
        ? supabase.from("offerings").select("id, name").in("id", offeringIds)
        : Promise.resolve({ data: [] }),
      applicationIds.length
        ? supabase.from("investor_applications").select("id, user_id").in("id", applicationIds)
        : Promise.resolve({ data: [] }),
      people.length
        ? supabase.from("profiles").select("user_id, legal_name, email").in("user_id", people)
        : Promise.resolve({ data: [] }),
    ]);

    const investorIds = [...new Set(((apps ?? []) as any[]).map((a) => a.user_id))];
    const { data: investorProfiles } = investorIds.length
      ? await supabase.from("profiles").select("user_id, legal_name, email").in("user_id", investorIds)
      : { data: [] as any[] };

    const fundName = new Map(((funds ?? []) as any[]).map((f) => [f.id, f.name as string]));
    const appOwner = new Map(((apps ?? []) as any[]).map((a) => [a.id, a.user_id as string]));
    const person = new Map(
      [...((profiles ?? []) as any[]), ...((investorProfiles ?? []) as any[])].map((p) => [
        p.user_id,
        (p.legal_name as string) || (p.email as string) || "Unknown",
      ]),
    );

    return {
      isAdmin,
      requests: requests.map((r) => ({
        ...r,
        fund_name: fundName.get(r.offering_id) ?? "Fund",
        requested_by_name: person.get(r.requested_by) ?? "Reviewer",
        investor_name: r.application_id ? (person.get(appOwner.get(r.application_id) ?? "") ?? null) : null,
      })),
    };
  });

/** Investors on one fund, so a manager can attach a request to a person. */
export const listWireRequestInvestors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await roles(supabase, userId);

    const { data: apps, error } = await supabase
      .from("investor_applications")
      .select("id, user_id, commitment_cents")
      .eq("offering_id", data.offering_id)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    const ids = [...new Set(((apps ?? []) as any[]).map((a) => a.user_id))];
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("user_id, legal_name, email").in("user_id", ids)
      : { data: [] as any[] };
    const name = new Map(
      ((profiles ?? []) as any[]).map((p) => [p.user_id, (p.legal_name as string) || (p.email as string) || "Investor"]),
    );

    return {
      investors: ((apps ?? []) as any[]).map((a) => ({
        application_id: a.id as string,
        name: name.get(a.user_id) ?? "Investor",
        commitment_cents: a.commitment_cents as number | null,
      })),
    };
  });

/** A fund manager asks for a wire to be approved. */
export const createWireRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        application_id: z.string().uuid().nullable().optional(),
        amount_cents: z.number().int().positive().max(10_000_000_000),
        purpose: z.enum(PURPOSES),
        expected_date: z.string().max(20).nullable().optional(),
        note: z.string().trim().max(1000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { isAdmin } = await roles(supabase, userId);
    if (!isAdmin) {
      const ids = await assignedFundIds(supabase, userId);
      if (!ids.includes(data.offering_id)) throw new Error("You are not assigned to that fund.");
    }

    const { error } = await supabase.from("wire_requests").insert({
      offering_id: data.offering_id,
      application_id: data.application_id ?? null,
      requested_by: userId,
      amount_cents: data.amount_cents,
      purpose: data.purpose,
      expected_date: data.expected_date || null,
      note: data.note?.trim() ? data.note.trim() : null,
    });
    if (error) throw new Error(error.message);

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("notification_events").insert({
        event_kind: "wire_request_submitted",
        offering_id: data.offering_id,
        ...(data.application_id ? { application_id: data.application_id } : {}),
        amount_cents: data.amount_cents,
        metadata: { purpose: data.purpose, portal_path: "/admin/wire" } as never,
      });
      const { kickManagerAlerts } = await import("@/lib/manager-alerts.server");
      kickManagerAlerts();
    } catch (e) {
      console.error("[wire-request] alert failed", e);
    }

    return { ok: true };
  });

/** Admin approves or declines a request. */
export const decideWireRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["approved", "declined"]),
        review_note: z.string().trim().max(1000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { isAdmin } = await roles(supabase, userId);
    if (!isAdmin) throw new Error("Only an admin can decide wire requests.");

    const { error } = await supabase
      .from("wire_requests")
      .update({
        status: data.status,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.review_note?.trim() ? data.review_note.trim() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
