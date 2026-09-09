import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TIMELINE_KINDS = [
  { key: "launch", label: "Fund launch" },
  { key: "open", label: "Offering opens" },
  { key: "wire_deadline", label: "Wire deadline" },
  { key: "closing", label: "Closing" },
  { key: "final_closing", label: "Final closing" },
  { key: "capital_call", label: "Capital call" },
  { key: "reporting", label: "Reporting date" },
  { key: "milestone", label: "Other milestone" },
] as const;

export type TimelineKind = (typeof TIMELINE_KINDS)[number]["key"];

export const TIMELINE_STATUSES = [
  { key: "scheduled", label: "Scheduled" },
  { key: "confirmed", label: "Confirmed" },
  { key: "done", label: "Complete" },
  { key: "moved", label: "Moved" },
] as const;

const kinds = TIMELINE_KINDS.map((k) => k.key) as [TimelineKind, ...TimelineKind[]];
const statuses = TIMELINE_STATUSES.map((s) => s.key) as [string, ...string[]];

const eventSchema = z.object({
  id: z.string().uuid().nullable().default(null),
  offering_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).default(""),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  event_time: z.string().trim().max(40).default(""),
  kind: z.enum(kinds).default("milestone"),
  status: z.enum(statuses).default("scheduled"),
  is_published: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(9999).default(0),
});

const SELECT_COLUMNS =
  "id, offering_id, title, description, event_date, event_time, kind, status, is_published, sort_order, updated_at";

async function isAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

async function editableFunds(supabase: any, userId: string) {
  if (await isAdmin(supabase, userId)) {
    const { data } = await supabase
      .from("offerings")
      .select("id, name, reg_type")
      .order("created_at", { ascending: true });
    return (data ?? []) as any[];
  }
  const { data: assigned } = await supabase
    .from("fund_managers")
    .select("offering_id")
    .eq("user_id", userId);
  const ids = ((assigned ?? []) as any[]).map((r) => r.offering_id as string);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("offerings")
    .select("id, name, reg_type")
    .in("id", ids)
    .order("created_at", { ascending: true });
  return (data ?? []) as any[];
}

/** Manager/admin view: their funds plus every key date on the selected fund. */
export const getTimelineForEdit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ offering_id: z.string().uuid().nullable().optional() })
      .optional()
      .parse(data ?? {}),
  )
  .handler(async ({ context, data }) => {
    const funds = await editableFunds(context.supabase, context.userId);
    const selectedId =
      (data?.offering_id && funds.find((f) => f.id === data.offering_id)?.id) ??
      funds[0]?.id ??
      null;
    if (!selectedId) return { funds, selected: null, events: [] as any[] };

    const { data: rows } = await context.supabase
      .from("offering_timeline_events")
      .select(SELECT_COLUMNS)
      .eq("offering_id", selectedId)
      .order("event_date", { ascending: true })
      .order("sort_order", { ascending: true });

    return {
      funds,
      selected: funds.find((f) => f.id === selectedId) ?? null,
      events: (rows ?? []) as any[],
    };
  });

/** Create or update one key date. */
export const saveTimelineEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => eventSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { id, ...fields } = data;
    if (id) {
      const { error } = await context.supabase
        .from("offering_timeline_events")
        .update(fields)
        .eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: row, error } = await context.supabase
      .from("offering_timeline_events")
      .insert({ ...fields, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as any).id as string };
  });

/** Remove a key date. */
export const deleteTimelineEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("offering_timeline_events")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** What the diligence room shows: the fund's visible key dates in order. */
export const getFundTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: rows } = await context.supabase
      .from("offering_timeline_events")
      .select(SELECT_COLUMNS)
      .eq("offering_id", data.offering_id)
      .order("event_date", { ascending: true })
      .order("sort_order", { ascending: true });

    return { events: (rows ?? []) as any[] };
  });
