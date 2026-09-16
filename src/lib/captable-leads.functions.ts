import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Requests from founders who want to move their cap table to Harmonious.
 *
 *  These arrive from the public website form. Harmonious records the request
 *  and its own team decides who to invite into the portal — creating the
 *  account is still a Harmonious action, never a self-serve one. */

export const LEAD_PROVIDERS = [
  { value: "carta", label: "Carta" },
  { value: "pulley", label: "Pulley" },
  { value: "angellist", label: "AngelList" },
  { value: "spreadsheet", label: "Spreadsheet" },
  { value: "none", label: "No cap table yet" },
  { value: "other", label: "Something else" },
] as const;

export const LEAD_STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "converted", label: "Converted" },
  { value: "declined", label: "Declined" },
] as const;

export function providerLabel(value: string | null | undefined) {
  return LEAD_PROVIDERS.find((p) => p.value === value)?.label ?? "Not stated";
}

export interface CapTableLead {
  id: string;
  fullName: string;
  email: string;
  companyName: string;
  sourceProvider: string;
  shareholderCount: number | null;
  note: string | null;
  status: string;
  assignedTo: string | null;
  assignedToName: string | null;
  internalNote: string | null;
  createdAt: string;
  updatedAt: string;
}

const STAFF_ROLES = [
  "admin",
  "super_admin",
  "client_success",
  "executive",
  "legal",
  "compliance",
  "finance",
  "operations",
];
const MANAGE_ROLES = ["admin", "super_admin", "client_success", "executive", "legal", "compliance", "finance"];

async function whoIs(context: any) {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  return {
    userId: context.userId as string,
    roles,
    isStaff: roles.some((r) => STAFF_ROLES.includes(r)),
    canManage: roles.some((r) => MANAGE_ROLES.includes(r)),
  };
}

async function audit(
  context: any,
  who: { userId: string; roles: string[] },
  entry: { action: string; target: string; previous?: unknown; next?: unknown },
) {
  await context.supabase.from("contract_audit_events").insert({
    actor_id: who.userId,
    actor_role: who.roles.join(", ") || null,
    area: "cap_table_requests",
    action: entry.action,
    target: entry.target,
    previous_value: (entry.previous ?? null) as any,
    new_value: (entry.next ?? null) as any,
    source: "web",
  });
}

function shape(row: any, names: Map<string, string>): CapTableLead {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    companyName: row.company_name,
    sourceProvider: row.source_provider,
    shareholderCount: row.shareholder_count ?? null,
    note: row.note ?? null,
    status: row.status,
    assignedTo: row.assigned_to ?? null,
    assignedToName: row.assigned_to ? (names.get(row.assigned_to) ?? null) : null,
    internalNote: row.internal_note ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every cap table migration request, newest first. */
export const getCapTableLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const who = await whoIs(context);
    if (!who.isStaff) throw new Error("Forbidden: this area is for the Harmonious team.");

    const { data, error } = await context.supabase
      .from("cap_table_leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as any[];
    const ids = Array.from(new Set(rows.map((r) => r.assigned_to).filter(Boolean)));
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("user_id, legal_name, email")
        .in("user_id", ids);
      for (const p of (profiles ?? []) as any[]) {
        names.set(p.user_id, p.legal_name || p.email || "Harmonious team");
      }
    }

    return { canManage: who.canManage, leads: rows.map((r) => shape(r, names)) };
  });

/** Move a request along: status, owner and the internal note. */
export const updateCapTableLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "contacted", "converted", "declined"]).optional(),
        internalNote: z.string().trim().max(2000).nullable().optional(),
        assignToMe: z.boolean().optional(),
        unassign: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await whoIs(context);
    if (!who.canManage) {
      throw new Error(
        "Forbidden: working a cap table request needs client success, legal, compliance, finance, executive or admin authority.",
      );
    }

    const { data: existing, error: readError } = await context.supabase
      .from("cap_table_leads")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("That request no longer exists.");

    const patch: Record<string, unknown> = { updated_by: who.userId };
    if (data.status) patch["status"] = data.status;
    if (data.internalNote !== undefined) patch["internal_note"] = data.internalNote || null;
    if (data.assignToMe) patch["assigned_to"] = who.userId;
    if (data.unassign) patch["assigned_to"] = null;

    const { error } = await context.supabase
      .from("cap_table_leads")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await audit(context, who, {
      action: "cap_table_request_updated",
      target: data.id,
      previous: {
        status: (existing as any).status,
        assigned_to: (existing as any).assigned_to,
      },
      next: patch,
    });

    return { ok: true };
  });

/** Plan names shown on the public product page, straight from the catalogue. */
export const getPublicCapPlans = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("service_catalog")
    .select("key, name, description, sort_order")
    .eq("category", "cap_table")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  return ((data ?? []) as any[]).map((row) => ({
    key: String(row.key),
    name: String(row.name).replace(/^Cap table management — /, ""),
    description: String(row.description ?? ""),
  }));
});
