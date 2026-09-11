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
  "fund_manager",
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
      "Forbidden: recording a receiving account needs operations, fund administration, finance or admin authority.",
    );
  }
}

/** Every fund, whether its receiving account is on file, and how the deposits are matching. */
export const listFundBankAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const roles = await staffRoles(supabase, userId);

    const { data: offerings, error } = await supabase
      .from("offerings")
      .select("id, name, status, client_id")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const funds = (offerings ?? []) as any[];
    const fundIds = funds.map((f) => f.id as string);
    const clientIds = Array.from(
      new Set(funds.map((f) => f.client_id).filter(Boolean) as string[]),
    );

    const [{ data: accounts }, { data: clients }, { data: transactions }] = await Promise.all([
      fundIds.length
        ? supabase
            .from("bank_accounts")
            .select(
              "id, offering_id, institution_name, account_name, account_mask, status, last_synced_at, item_id, updated_at",
            )
            .in("offering_id", fundIds)
        : Promise.resolve({ data: [] as any[] }),
      clientIds.length
        ? supabase.from("clients").select("id, legal_name").in("id", clientIds)
        : Promise.resolve({ data: [] as any[] }),
      fundIds.length
        ? supabase
            .from("bank_transactions")
            .select("offering_id, matched_application_id, matched_invoice_id, posted_on")
            .in("offering_id", fundIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const accountByFund = new Map(
      ((accounts ?? []) as any[]).map((a) => [a.offering_id as string, a]),
    );
    const clientById = new Map(((clients ?? []) as any[]).map((c) => [c.id as string, c]));

    const counts = new Map<string, { total: number; unmatched: number; latest: string | null }>();
    for (const t of (transactions ?? []) as any[]) {
      const key = t.offering_id as string;
      const row = counts.get(key) ?? { total: 0, unmatched: 0, latest: null };
      row.total += 1;
      if (!t.matched_application_id && !t.matched_invoice_id) row.unmatched += 1;
      if (t.posted_on && (!row.latest || t.posted_on > row.latest)) row.latest = t.posted_on;
      counts.set(key, row);
    }

    return {
      canManage: roles.some((r) => MANAGE_ROLES.includes(r)),
      funds: funds.map((f) => {
        const account = accountByFund.get(f.id as string) ?? null;
        const stats = counts.get(f.id as string) ?? { total: 0, unmatched: 0, latest: null };
        return {
          fundId: f.id as string,
          fundName: (f.name as string) ?? "Untitled fund",
          fundStatus: (f.status as string) ?? "draft",
          clientId: (f.client_id as string | null) ?? null,
          clientName: (clientById.get(f.client_id)?.legal_name as string) ?? null,
          account: account
            ? {
                institutionName: (account.institution_name as string | null) ?? null,
                accountName: (account.account_name as string | null) ?? null,
                accountMask: (account.account_mask as string | null) ?? null,
                status: (account.status as string) ?? "connected",
                manual: String(account.item_id ?? "").startsWith("manual:"),
                lastSyncedAt: (account.last_synced_at as string | null) ?? null,
                updatedAt: (account.updated_at as string | null) ?? null,
              }
            : null,
          deposits: stats.total,
          unmatched: stats.unmatched,
          latestDeposit: stats.latest,
        };
      }),
    };
  });

/** Records a fund's receiving account by hand so incoming wires can be matched to it. */
export const saveFundBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fundId: z.string().uuid(),
        institutionName: z.string().trim().min(2).max(120),
        accountName: z.string().trim().max(160).optional().or(z.literal("")),
        accountMask: z
          .string()
          .trim()
          .max(4)
          .regex(/^[0-9]*$/, "Use only the last four digits.")
          .optional()
          .or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await staffRoles(supabase, userId);
    requireManage(roles);

    const { data: existing } = await supabase
      .from("bank_accounts")
      .select("id, item_id, institution_name, account_name, account_mask")
      .eq("offering_id", data.fundId)
      .maybeSingle();

    if (existing && !String((existing as any).item_id ?? "").startsWith("manual:")) {
      throw new Error(
        "This fund's account is connected to its bank feed. Disconnect it on the fund's banking page before entering details by hand.",
      );
    }

    const payload = {
      institution_name: data.institutionName,
      account_name: data.accountName || null,
      account_mask: data.accountMask || null,
      status: "recorded",
    };

    if (existing) {
      const { error } = await supabase
        .from("bank_accounts")
        .update(payload)
        .eq("id", (existing as any).id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("bank_accounts").insert({
        offering_id: data.fundId,
        item_id: `manual:${data.fundId}`,
        created_by: userId,
        ...payload,
      });
      if (error) throw new Error(error.message);
    }

    const { data: fund } = await supabase
      .from("offerings")
      .select("client_id")
      .eq("id", data.fundId)
      .maybeSingle();

    await supabase.from("contract_audit_events").insert({
      area: "banking",
      action: existing ? "receiving account updated" : "receiving account recorded",
      target: data.fundId,
      client_id: (fund as any)?.client_id ?? null,
      offering_id: data.fundId,
      actor_id: userId,
      previous_value: existing
        ? {
            institution_name: (existing as any).institution_name,
            account_name: (existing as any).account_name,
            account_mask: (existing as any).account_mask,
          }
        : null,
      new_value: payload,
      source: "bank accounts",
    });

    return { ok: true };
  });

/** Removes a hand-entered receiving account. */
export const removeFundBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await staffRoles(supabase, userId);
    requireManage(roles);

    const { data: existing } = await supabase
      .from("bank_accounts")
      .select("id, item_id")
      .eq("offering_id", data.fundId)
      .maybeSingle();
    if (!existing) return { ok: true };
    if (!String((existing as any).item_id ?? "").startsWith("manual:")) {
      throw new Error(
        "This account came from the bank feed. Disconnect it on the fund's banking page instead.",
      );
    }

    const { error } = await supabase.from("bank_accounts").delete().eq("id", (existing as any).id);
    if (error) throw new Error(error.message);

    await supabase.from("contract_audit_events").insert({
      area: "banking",
      action: "receiving account removed",
      target: data.fundId,
      offering_id: data.fundId,
      actor_id: userId,
      source: "bank accounts",
    });

    return { ok: true };
  });
