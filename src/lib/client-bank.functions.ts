import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Confirms the signed-in person is a contact of the client that owns this fund. */
async function assertClientFund(supabase: any, userId: string, fundId: string) {
  const { data: memberships } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("user_id", userId);
  const clientIds = ((memberships ?? []) as any[]).map((m) => String(m.client_id));
  if (!clientIds.length) throw new Error("Your sign-in isn't linked to a client engagement yet.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: fund } = await supabaseAdmin
    .from("offerings")
    .select("id, name, client_id")
    .eq("id", fundId)
    .maybeSingle();
  if (!fund || !fund.client_id || !clientIds.includes(String(fund.client_id))) {
    throw new Error("That fund isn't part of your engagement.");
  }
  return { fund, supabaseAdmin, clientIds };
}

async function bankAudit(
  supabaseAdmin: any,
  userId: string,
  entry: {
    action: string;
    target: string;
    clientId: string | null;
    offeringId: string;
    next?: unknown;
  },
) {
  await supabaseAdmin.from("contract_audit_events").insert({
    area: "banking",
    action: entry.action,
    target: entry.target,
    client_id: entry.clientId,
    offering_id: entry.offeringId,
    actor_id: userId,
    new_value: entry.next ?? null,
    source: "client portal bank link",
  });
}

/** Each of the client's funds, whether its bank account is linked, and how
 *  many declared payments are still waiting to be matched to a deposit. */
export const getClientBankLinking = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: memberships } = await supabase
      .from("client_users")
      .select("client_id")
      .eq("user_id", userId);
    const clientIds = ((memberships ?? []) as any[]).map((m) => String(m.client_id));
    if (!clientIds.length) return { configured: false, funds: [] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { plaidConfigured } = await import("@/lib/plaid.server");

    const { data: offerings } = await supabaseAdmin
      .from("offerings")
      .select("id, name, client_id")
      .in("client_id", clientIds)
      .order("created_at", { ascending: false });

    const funds = (offerings ?? []) as any[];
    const fundIds = funds.map((f) => String(f.id));
    if (!fundIds.length) return { configured: plaidConfigured(), funds: [] };

    const [{ data: accounts }, { data: lines }, { data: invoices }] = await Promise.all([
      supabaseAdmin
        .from("bank_accounts")
        .select("offering_id, institution_name, account_name, account_mask, status, last_synced_at")
        .in("offering_id", fundIds),
      supabaseAdmin
        .from("bank_transactions")
        .select("id, offering_id, posted_on, amount_cents, name, matched_invoice_id")
        .in("offering_id", fundIds)
        .order("posted_on", { ascending: false })
        .limit(300),
      supabaseAdmin
        .from("invoices")
        .select("id, offering_id, number, total_cents, status, client_payment_declared_at")
        .in("offering_id", fundIds)
        .eq("status", "issued"),
    ]);

    const accountByFund = new Map(
      ((accounts ?? []) as any[]).map((a) => [String(a.offering_id), a]),
    );

    return {
      configured: plaidConfigured(),
      funds: funds.map((f) => {
        const id = String(f.id);
        const account = accountByFund.get(id) ?? null;
        const fundLines = ((lines ?? []) as any[]).filter((l) => String(l.offering_id) === id);
        const fundInvoices = ((invoices ?? []) as any[]).filter(
          (i) => String(i.offering_id) === id,
        );
        return {
          id,
          name: String(f.name ?? "Fund"),
          clientId: f.client_id ? String(f.client_id) : null,
          linked: Boolean(account),
          institution: (account?.institution_name ?? null) as string | null,
          accountName: (account?.account_name ?? null) as string | null,
          mask: (account?.account_mask ?? null) as string | null,
          lastSyncedAt: (account?.last_synced_at ?? null) as string | null,
          recentDeposits: fundLines.slice(0, 5).map((l) => ({
            id: String(l.id),
            postedOn: String(l.posted_on),
            amountCents: Number(l.amount_cents ?? 0),
            name: String(l.name ?? "Deposit"),
            matched: Boolean(l.matched_invoice_id),
          })),
          awaitingMatch: fundInvoices.filter((i) => i.client_payment_declared_at).length,
          openInvoices: fundInvoices.length,
        };
      }),
    };
  });

/** Starts the secure bank sign-in for one of the client's own funds. */
export const startClientBankLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fundId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { fund } = await assertClientFund(supabase, userId, data.fundId);

    const { createLinkToken } = await import("@/lib/plaid.server");
    const result = await createLinkToken({
      userId,
      fundName: String((fund as any).name ?? "Harmonious"),
    });
    return { linkToken: result.link_token };
  });

/** Saves the connection once the client finishes signing in at their bank. */
export const finishClientBankLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ fundId: z.string().uuid(), publicToken: z.string().min(10).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { fund, supabaseAdmin } = await assertClientFund(supabase, userId, data.fundId);

    const plaid = await import("@/lib/plaid.server");
    const exchanged = await plaid.exchangePublicToken(data.publicToken);
    const accounts = await plaid.getAccounts(exchanged.access_token);

    let institutionName: string | null = null;
    const institutionId = accounts.item?.institution_id ?? null;
    if (institutionId) {
      try {
        institutionName = (await plaid.getInstitution(institutionId)).institution?.name ?? null;
      } catch {
        institutionName = null;
      }
    }

    const first = accounts.accounts[0];

    const { error: saveError } = await supabaseAdmin.rpc("save_bank_link", {
      p_offering_id: data.fundId,
      p_item_id: exchanged.item_id,
      p_access_token: exchanged.access_token,
      p_institution: institutionName ?? "",
    });
    if (saveError) throw new Error(saveError.message);

    await supabaseAdmin.from("bank_accounts").delete().eq("offering_id", data.fundId);
    const { error } = await supabaseAdmin.from("bank_accounts").insert({
      offering_id: data.fundId,
      item_id: exchanged.item_id,
      institution_name: institutionName,
      account_name: first?.official_name ?? first?.name ?? null,
      account_mask: first?.mask ?? null,
      status: "connected",
      created_by: userId,
    });
    if (error) throw new Error(error.message);

    await bankAudit(supabaseAdmin, userId, {
      action: "bank account linked by client",
      target: String((fund as any).name ?? "Fund"),
      clientId: (fund as any).client_id ? String((fund as any).client_id) : null,
      offeringId: data.fundId,
      next: { institution: institutionName, mask: first?.mask ?? null },
    });

    return { ok: true, message: `Connected to ${institutionName ?? "your bank"}.` };
  });

/** Refreshes deposits from the linked account and matches the payments the
 *  client already declared, so a wire settles its invoice without staff typing. */
export const refreshClientBankMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fundId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await assertClientFund(supabase, userId, data.fundId);

    const { data: token, error: tokenError } = await supabaseAdmin.rpc("get_bank_access_token", {
      p_offering_id: data.fundId,
    });
    if (tokenError) throw new Error(tokenError.message);
    if (!token) throw new Error("No bank account is linked for this fund yet.");

    const end = new Date();
    const start = new Date(end.getTime() - 90 * 86400000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const { getTransactions } = await import("@/lib/plaid.server");
    const result = await getTransactions(token as string, iso(start), iso(end));
    const deposits = result.transactions.filter((t) => t.amount < 0 && !t.pending);

    let added = 0;
    for (const t of deposits) {
      const { data: existing } = await supabaseAdmin
        .from("bank_transactions")
        .select("id")
        .eq("offering_id", data.fundId)
        .eq("plaid_transaction_id", t.transaction_id)
        .maybeSingle();
      if (existing) continue;

      const { error } = await supabaseAdmin.from("bank_transactions").insert({
        offering_id: data.fundId,
        plaid_transaction_id: t.transaction_id,
        posted_on: t.date,
        amount_cents: Math.round(Math.abs(t.amount) * 100),
        name: t.merchant_name || t.name,
        description: t.original_description ?? null,
      });
      if (!error) added += 1;
    }

    await supabaseAdmin
      .from("bank_accounts")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("offering_id", data.fundId);

    const { runAutoMatch } = await import("@/lib/bank-auto-match.server");
    const matched = (
      await runAutoMatch(supabaseAdmin, userId, data.fundId, "client linked bank account")
    ).total;

    return {
      ok: true,
      added,
      matched,
      message:
        matched > 0
          ? `${matched} payment${matched === 1 ? "" : "s"} matched to your invoices.`
          : added > 0
            ? `${added} new deposit${added === 1 ? "" : "s"} found — nothing matched an invoice yet.`
            : "No new deposits since the last check.",
    };
  });

/** Removes the client's bank connection for a fund. */
export const disconnectClientBankLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fundId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { fund, supabaseAdmin } = await assertClientFund(supabase, userId, data.fundId);

    const { error } = await supabaseAdmin.rpc("remove_bank_link", { p_offering_id: data.fundId });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("bank_accounts").delete().eq("offering_id", data.fundId);

    await bankAudit(supabaseAdmin, userId, {
      action: "bank account unlinked by client",
      target: String((fund as any).name ?? "Fund"),
      clientId: (fund as any).client_id ? String((fund as any).client_id) : null,
      offeringId: data.fundId,
    });

    return { ok: true, message: "Bank account disconnected." };
  });
