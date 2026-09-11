import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF_ROLES = [
  "admin",
  "super_admin",
  "operations",
  "fund_administration",
  "finance",
  "legal",
  "compliance",
  "client_success",
  "executive",
];

const MANAGE_ROLES = ["admin", "super_admin", "operations", "fund_administration", "finance"];

async function staffRoles(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const list = ((data ?? []) as any[]).map((r) => String(r.role));
  if (!list.some((r) => STAFF_ROLES.includes(r))) {
    throw new Error("Forbidden: this page is for Harmonious staff.");
  }
  return list;
}

function requireManage(roles: string[]) {
  if (!roles.some((r) => MANAGE_ROLES.includes(r))) {
    throw new Error(
      "Forbidden: recording a client's bank details needs operations, fund administration, finance or admin authority.",
    );
  }
}

function last4(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.slice(-4);
}

async function audit(
  supabase: any,
  userId: string,
  clientId: string,
  action: string,
  previous: unknown,
  next: unknown,
) {
  await supabase.from("contract_audit_events").insert({
    area: "banking",
    action,
    target: "client bank account",
    client_id: clientId,
    actor_id: userId,
    previous_value: previous ?? null,
    new_value: next ?? null,
    source: "client bank accounts",
  });
}

/** Every client, the paying accounts on file for them, and how their invoices are settling. */
export const listClientBankAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const roles = await staffRoles(supabase, userId);

    const { data: clientRows, error } = await supabase
      .from("clients")
      .select("id, legal_name, status")
      .order("legal_name", { ascending: true });
    if (error) throw new Error(error.message);

    const clients = (clientRows ?? []) as any[];
    const ids = clients.map((c) => String(c.id));

    const [{ data: accounts }, { data: invoices }] = await Promise.all([
      ids.length
        ? supabase
            .from("client_bank_accounts")
            .select(
              "id, client_id, label, institution_name, account_holder, account_type, account_last4, routing_last4, reference_hint, is_primary, status, notes, updated_at",
            )
            .in("client_id", ids)
            .order("is_primary", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      ids.length
        ? supabase
            .from("invoices")
            .select("id, client_id, status, total_cents, client_payment_declared_at")
            .in("client_id", ids)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const byClient = new Map<string, any[]>();
    for (const account of (accounts ?? []) as any[]) {
      const key = String(account.client_id);
      byClient.set(key, [...(byClient.get(key) ?? []), account]);
    }

    const awaiting = new Map<string, number>();
    for (const invoice of (invoices ?? []) as any[]) {
      if (String(invoice.status) !== "issued") continue;
      if (!invoice.client_payment_declared_at) continue;
      const key = String(invoice.client_id);
      awaiting.set(key, (awaiting.get(key) ?? 0) + 1);
    }

    return {
      canManage: roles.some((r) => MANAGE_ROLES.includes(r)),
      clients: clients.map((client) => ({
        id: String(client.id),
        legalName: String(client.legal_name ?? "Client"),
        status: String(client.status ?? "active"),
        awaitingMatch: awaiting.get(String(client.id)) ?? 0,
        accounts: (byClient.get(String(client.id)) ?? []).map((a) => ({
          id: String(a.id),
          label: (a.label ?? null) as string | null,
          institutionName: String(a.institution_name ?? ""),
          accountHolder: String(a.account_holder ?? ""),
          accountType: String(a.account_type ?? "checking"),
          accountLast4: (a.account_last4 ?? null) as string | null,
          routingLast4: (a.routing_last4 ?? null) as string | null,
          referenceHint: (a.reference_hint ?? null) as string | null,
          isPrimary: Boolean(a.is_primary),
          status: String(a.status ?? "active"),
          notes: (a.notes ?? null) as string | null,
          updatedAt: (a.updated_at ?? null) as string | null,
        })),
      })),
    };
  });

const saveInput = z.object({
  id: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  label: z.string().max(120).optional(),
  institutionName: z.string().min(2).max(160),
  accountHolder: z.string().min(2).max(160),
  accountType: z.enum(["checking", "savings", "other"]).default("checking"),
  accountNumber: z.string().max(40).optional(),
  routingNumber: z.string().max(40).optional(),
  referenceHint: z.string().max(120).optional(),
  isPrimary: z.boolean().default(false),
  status: z.enum(["active", "inactive"]).default("active"),
  notes: z.string().max(2000).optional(),
});

/** Records or updates the account a client pays from. Only the last four digits are kept. */
export const saveClientBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await staffRoles(supabase, userId);
    requireManage(roles);

    const row = {
      client_id: data.clientId,
      label: data.label?.trim() || null,
      institution_name: data.institutionName.trim(),
      account_holder: data.accountHolder.trim(),
      account_type: data.accountType,
      account_last4: last4(data.accountNumber),
      routing_last4: last4(data.routingNumber),
      reference_hint: data.referenceHint?.trim() || null,
      is_primary: data.isPrimary,
      status: data.status,
      notes: data.notes?.trim() || null,
    };

    if (data.isPrimary) {
      const clearing = supabase
        .from("client_bank_accounts")
        .update({ is_primary: false })
        .eq("client_id", data.clientId);
      const { error: clearError } = data.id ? await clearing.neq("id", data.id) : await clearing;
      if (clearError) throw new Error(clearError.message);
    }

    if (data.id) {
      const { data: previous } = await supabase
        .from("client_bank_accounts")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      const { error } = await supabase
        .from("client_bank_accounts")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(supabase, userId, data.clientId, "client bank account updated", previous, row);
      return { id: data.id };
    }

    const { data: created, error } = await supabase
      .from("client_bank_accounts")
      .insert({ ...row, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(supabase, userId, data.clientId, "client bank account added", null, row);
    return { id: String(created.id) };
  });

/** Removes an account a client no longer pays from. */
export const removeClientBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await staffRoles(supabase, userId);
    requireManage(roles);

    const { data: previous } = await supabase
      .from("client_bank_accounts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!previous) return { removed: false };

    const { error } = await supabase.from("client_bank_accounts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(
      supabase,
      userId,
      String(previous.client_id),
      "client bank account removed",
      previous,
      null,
    );
    return { removed: true };
  });
