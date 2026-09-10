import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** The Harmonious roles an administrator can hand out from the console. */
export const STAFF_ROLES = [
  { value: "admin", label: "Administrator", note: "Full access, including team access." },
  { value: "executive", label: "Executive (CEO / CRO)", note: "Contract authority." },
  { value: "client_success", label: "Client success", note: "Contract authority." },
  { value: "legal", label: "Legal", note: "Contract authority." },
  { value: "compliance", label: "Compliance", note: "Contract authority and holds." },
  { value: "finance", label: "Finance", note: "Contract authority, invoices and payments." },
  { value: "operations", label: "Operations", note: "Reviews fund formation records." },
  { value: "fund_administration", label: "Fund administration", note: "Fund records and reporting." },
  { value: "tax", label: "Tax", note: "Tax records and filings." },
] as const;

const ROLE_VALUES = STAFF_ROLES.map((r) => r.value) as unknown as [string, ...string[]];

async function requireAdmin(context: any) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  if (!roles.includes("admin") && !roles.includes("super_admin")) {
    throw new Error("Only an administrator can manage Harmonious team access.");
  }
  return { userId: context.userId as string };
}

/** Everyone on the Harmonious side, with the access each person currently holds. */
export const listStaffAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_staff_accounts");
    if (error) throw new Error(error.message);

    const { data: invites } = await context.supabase
      .from("staff_invitations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    return {
      staff: (data ?? []) as any[],
      invitations: (invites ?? []) as any[],
      me: context.userId as string,
    };
  });

/** Grant or remove one Harmonious role for one person. */
export const setStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(ROLE_VALUES),
        grant: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_staff_role", {
      _user_id: data.userId,
      _role: data.role,
      _grant: data.grant,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Invite someone who does not have an account yet; access applies on first sign-in. */
export const inviteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(200),
        role: z.enum(ROLE_VALUES),
        name: z.string().trim().max(160).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireAdmin(context);
    const email = data.email.toLowerCase();

    const { data: existing } = await context.supabase
      .from("staff_invitations")
      .select("id")
      .eq("email", email)
      .eq("role", data.role)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) throw new Error("That person already has a pending invitation for this role.");

    const { error } = await context.supabase.from("staff_invitations").insert({
      email,
      role: data.role,
      invited_name: data.name || null,
      invited_by: who.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Withdraw an invitation that has not been used yet. */
export const cancelStaffInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase
      .from("staff_invitations")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
