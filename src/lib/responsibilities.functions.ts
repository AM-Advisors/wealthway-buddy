import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF = [
  "admin",
  "super_admin",
  "operations",
  "legal",
  "compliance",
  "fund_administration",
  "tax",
  "finance",
  "client_success",
  "executive",
];

async function rolesOf(context: any) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}

/** What the client owes Harmonious for one fund, from the statement of work. */
export const getResponsibilities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await rolesOf(context);
    const [{ data: templates }, { data: items }, { data: fund }] = await Promise.all([
      context.supabase
        .from("responsibility_templates")
        .select("*")
        .eq("active", true)
        .order("sort_order"),
      context.supabase
        .from("responsibility_items")
        .select("*")
        .eq("offering_id", data.offeringId),
      context.supabase
        .from("offerings")
        .select("id, name, client_id")
        .eq("id", data.offeringId)
        .maybeSingle(),
    ]);
    if (!fund) throw new Error("That fund isn't available.");

    const rows = (templates ?? []).map((t: any) => {
      const item = (items ?? []).find((i: any) => i.template_key === t.key) ?? null;
      return {
        key: t.key as string,
        label: t.label as string,
        detail: t.detail as string | null,
        owner: t.owner as string,
        phase: t.phase as string,
        leadTimeNote: t.lead_time_note as string | null,
        sourceReference: t.source_reference as string | null,
        itemId: item?.id ?? null,
        status: (item?.status as string) ?? "outstanding",
        dueOn: item?.due_on ?? null,
        note: item?.note ?? null,
        completedAt: item?.completed_at ?? null,
      };
    });

    return {
      fund,
      isStaff: roles.some((r) => STAFF.includes(r)),
      items: rows,
      outstanding: rows.filter((r) => r.status === "outstanding").length,
    };
  });

export const setResponsibilityStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        offeringId: z.string().uuid(),
        templateKey: z.string().min(2).max(80),
        status: z.enum(["outstanding", "in_progress", "provided", "not_applicable"]),
        note: z.string().max(1000).optional().or(z.literal("")),
        dueOn: z.string().optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: fund } = await context.supabase
      .from("offerings")
      .select("id, client_id")
      .eq("id", data.offeringId)
      .maybeSingle();
    if (!fund) throw new Error("That fund isn't available.");

    const { data: template } = await context.supabase
      .from("responsibility_templates")
      .select("*")
      .eq("key", data.templateKey)
      .maybeSingle();
    if (!template) throw new Error("That item isn't available.");

    const { data: existing } = await context.supabase
      .from("responsibility_items")
      .select("id")
      .eq("offering_id", data.offeringId)
      .eq("template_key", data.templateKey)
      .maybeSingle();

    const patch = {
      status: data.status,
      note: data.note || null,
      due_on: data.dueOn || null,
      completed_at: data.status === "provided" ? new Date().toISOString() : null,
      completed_by: data.status === "provided" ? context.userId : null,
    };

    if (existing) {
      const { error } = await context.supabase
        .from("responsibility_items")
        .update(patch)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("responsibility_items").insert({
        client_id: fund.client_id,
        offering_id: data.offeringId,
        template_key: data.templateKey,
        label: template.label,
        detail: template.detail,
        owner: template.owner,
        phase: template.phase,
        created_by: context.userId,
        ...patch,
      });
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });
