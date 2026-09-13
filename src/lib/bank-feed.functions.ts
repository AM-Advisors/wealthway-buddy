import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Only admins and the fund's assigned managers may touch a fund's bank feed. */
async function assertFundAccess(supabase: any, userId: string, fundId: string) {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "fund_manager"]);
  const list = (roles ?? []).map((r: any) => r.role as string);
  if (list.includes("admin")) return;
  const { data: assignment } = await supabase
    .from("fund_managers")
    .select("id")
    .eq("user_id", userId)
    .eq("offering_id", fundId)
    .maybeSingle();
  if (!assignment) throw new Error("Forbidden: you do not manage this fund.");
}

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

/** The connected account, recent deposits, and the investors still expected to wire. */
export const getBankFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFundAccess(supabase, userId, data.fundId);

    const { plaidConfigured } = await import("@/lib/plaid.server");

    // Settle whatever the rules can settle before the page is drawn, so staff
    // only see the deposits that genuinely need a person to look at them.
    const auto = await (
      await import("@/lib/bank-auto-match.server")
    ).runAutoMatch(supabase, userId, data.fundId, "fund bank feed");


    const [{ data: account }, { data: transactions }, { data: applications }] = await Promise.all([
      supabase
        .from("bank_accounts")
        .select("id, institution_name, account_name, account_mask, status, last_synced_at, created_at")
        .eq("offering_id", data.fundId)
        .maybeSingle(),
      supabase
        .from("bank_transactions")
        .select("id, posted_on, amount_cents, name, description, matched_application_id, matched_at")
        .eq("offering_id", data.fundId)
        .order("posted_on", { ascending: false })
        .limit(100),
      supabase
        .from("investor_applications")
        .select("id, user_id, commitment_cents, funding_status")
        .eq("offering_id", data.fundId),
    ]);

    const apps = applications ?? [];
    const userIds = apps.map((a: any) => a.user_id as string);
    const appIds = apps.map((a: any) => a.id as string);

    const [{ data: profiles }, { data: payments }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("user_id, legal_name, email").in("user_id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      appIds.length
        ? supabase
            .from("payments")
            .select("application_id, amount_cents, reference_code, status")
            .in("application_id", appIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const nameByUser = new Map(
      (profiles ?? []).map((p: any) => [p.user_id, p.legal_name || p.email || "Investor"]),
    );
    const paymentByApp = new Map((payments ?? []).map((p: any) => [p.application_id, p]));

    const investors = apps.map((a: any) => ({
      applicationId: a.id as string,
      name: (nameByUser.get(a.user_id) as string) ?? "Investor",
      expectedCents: (paymentByApp.get(a.id)?.amount_cents ?? a.commitment_cents ?? 0) as number,
      reference: (paymentByApp.get(a.id)?.reference_code ?? null) as string | null,
      fundingStatus: a.funding_status as string,
    }));

    const investorByApp = new Map(investors.map((i) => [i.applicationId, i]));

    const rows = (transactions ?? []).map((t: any) => {
      const matched = t.matched_application_id ? investorByApp.get(t.matched_application_id) : null;
      const suggestion =
        matched || !t.matched_application_id
          ? investors.find(
              (i) =>
                i.fundingStatus !== "settled" &&
                ((i.reference && `${t.name} ${t.description ?? ""}`.toLowerCase().includes(i.reference.toLowerCase())) ||
                  (i.expectedCents > 0 && i.expectedCents === t.amount_cents)),
            ) ?? null
          : null;
      return {
        id: t.id as string,
        postedOn: t.posted_on as string,
        amountCents: t.amount_cents as number,
        amount: money(t.amount_cents as number),
        name: t.name as string,
        description: (t.description ?? null) as string | null,
        matchedApplicationId: (t.matched_application_id ?? null) as string | null,
        matchedName: matched?.name ?? null,
        matchedAt: (t.matched_at ?? null) as string | null,
        suggestedApplicationId: t.matched_application_id ? null : (suggestion?.applicationId ?? null),
        suggestedName: t.matched_application_id ? null : (suggestion?.name ?? null),
      };
    });

    return {
      configured: plaidConfigured(),
      account: account ?? null,
      transactions: rows,
      investors: investors.filter((i) => i.fundingStatus !== "settled"),
      unmatchedCount: rows.filter((r) => !r.matchedApplicationId).length,
    };
  });

/** Starts the secure bank sign-in; the browser hands this token to Plaid Link. */
export const startBankConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFundAccess(supabase, userId, data.fundId);

    const { data: offering } = await supabase
      .from("offerings")
      .select("name")
      .eq("id", data.fundId)
      .maybeSingle();

    const { createLinkToken } = await import("@/lib/plaid.server");
    const result = await createLinkToken({
      userId,
      fundName: (offering as any)?.name ?? "Harmonious",
    });
    return { linkToken: result.link_token };
  });

/** Stores the connection after the user finishes the bank sign-in. */
export const finishBankConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ fundId: z.string().uuid(), publicToken: z.string().min(10).max(500) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFundAccess(supabase, userId, data.fundId);

    const plaid = await import("@/lib/plaid.server");
    const exchanged = await plaid.exchangePublicToken(data.publicToken);
    const accounts = await plaid.getAccounts(exchanged.access_token);

    let institutionName: string | null = null;
    const institutionId = accounts.item?.institution_id ?? null;
    if (institutionId) {
      try {
        const inst = await plaid.getInstitution(institutionId);
        institutionName = inst.institution?.name ?? null;
      } catch {
        institutionName = null;
      }
    }

    const first = accounts.accounts[0];

    const { error: saveError } = await supabase.rpc("save_bank_link", {
      p_offering_id: data.fundId,
      p_item_id: exchanged.item_id,
      p_access_token: exchanged.access_token,
      p_institution: institutionName ?? "",
    });
    if (saveError) throw new Error(saveError.message);

    await supabase.from("bank_accounts").delete().eq("offering_id", data.fundId);
    const { error } = await supabase.from("bank_accounts").insert({
      offering_id: data.fundId,
      item_id: exchanged.item_id,
      institution_name: institutionName,
      account_name: first?.official_name ?? first?.name ?? null,
      account_mask: first?.mask ?? null,
      status: "connected",
      created_by: userId,
    });
    if (error) throw new Error(error.message);

    return { ok: true, message: `Connected to ${institutionName ?? "your bank"}.` };
  });

/** Pulls the last 90 days of deposits into the portal. */
export const syncBankTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFundAccess(supabase, userId, data.fundId);

    const { data: token, error: tokenError } = await supabase.rpc("get_bank_access_token", {
      p_offering_id: data.fundId,
    });
    if (tokenError) throw new Error(tokenError.message);
    if (!token) throw new Error("No bank account is connected for this fund yet.");

    const end = new Date();
    const start = new Date(end.getTime() - 90 * 86400000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const { getTransactions } = await import("@/lib/plaid.server");
    const result = await getTransactions(token as string, iso(start), iso(end));

    // In Plaid, money arriving in the account is a negative amount.
    const deposits = result.transactions.filter((t) => t.amount < 0 && !t.pending);

    let added = 0;
    for (const t of deposits) {
      const { data: existing } = await supabase
        .from("bank_transactions")
        .select("id")
        .eq("offering_id", data.fundId)
        .eq("plaid_transaction_id", t.transaction_id)
        .maybeSingle();
      if (existing) continue;

      const { error } = await supabase.from("bank_transactions").insert({
        offering_id: data.fundId,
        plaid_transaction_id: t.transaction_id,
        posted_on: t.date,
        amount_cents: Math.round(Math.abs(t.amount) * 100),
        name: t.merchant_name || t.name,
        description: t.original_description ?? null,
      });
      if (!error) added += 1;
    }

    await supabase
      .from("bank_accounts")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("offering_id", data.fundId);

    const { runAutoMatch } = await import("@/lib/bank-auto-match.server");
    const auto = await runAutoMatch(supabase, userId, data.fundId, "fund bank feed");

    const settled = auto.total;
    return {
      ok: true,
      added,
      matched: settled,
      message:
        `${added === 0 ? "No new deposits since the last refresh." : `${added} new deposit${added === 1 ? "" : "s"} pulled in.`}` +
        (settled > 0
          ? ` ${settled} wire${settled === 1 ? " was" : "s were"} matched automatically.`
          : ""),
    };
  });

/** Confirms a deposit belongs to one investor and marks their funding received. */
export const matchBankTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        transactionId: z.string().uuid(),
        applicationId: z.string().uuid().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: row, error: readError } = await supabase
      .from("bank_transactions")
      .select("id, offering_id, amount_cents, posted_on, name")
      .eq("id", data.transactionId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!row) throw new Error("That deposit is no longer listed.");
    await assertFundAccess(supabase, userId, row.offering_id as string);

    const now = new Date().toISOString();

    if (!data.applicationId) {
      const { error } = await supabase
        .from("bank_transactions")
        .update({ matched_application_id: null, matched_by: null, matched_at: null })
        .eq("id", data.transactionId);
      if (error) throw new Error(error.message);
      return { ok: true, message: "Match removed." };
    }

    const { data: application } = await supabase
      .from("investor_applications")
      .select("id, offering_id")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!application || application.offering_id !== row.offering_id) {
      throw new Error("That investor is not part of this fund.");
    }

    const { error } = await supabase
      .from("bank_transactions")
      .update({
        matched_application_id: data.applicationId,
        matched_by: userId,
        matched_at: now,
      })
      .eq("id", data.transactionId);
    if (error) throw new Error(error.message);

    const { data: payment } = await supabase
      .from("payments")
      .select("id")
      .eq("application_id", data.applicationId)
      .maybeSingle();
    if (payment) {
      await supabase
        .from("payments")
        .update({ status: "settled", confirmed_at: now, failure_reason: null, updated_at: now })
        .eq("id", payment.id);
    }

    await supabase
      .from("investor_applications")
      .update({ funding_status: "settled", status: "funded", updated_at: now })
      .eq("id", data.applicationId);

    await (await import("@/lib/reviewer-activity.server")).logReviewerActivity(supabase, {
      actorId: userId,
      applicationId: data.applicationId,
      offeringId: row.offering_id as string,
      action: "bank_match",
      area: "wire",
      outcome: "approved",
      summary: `Bank deposit of ${money(row.amount_cents as number)} on ${row.posted_on} matched to this investor`,
      note: row.name as string,
    });

    void (await import("@/lib/manager-alerts.server")).drainManagerAlerts().catch(() => {});
    return { ok: true, message: "Deposit matched and funding marked received." };
  });

/** Removes the bank connection for this fund. */
export const disconnectBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ fundId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFundAccess(supabase, userId, data.fundId);

    const { error: rpcError } = await supabase.rpc("remove_bank_link", {
      p_offering_id: data.fundId,
    });
    if (rpcError) throw new Error(rpcError.message);
    await supabase.from("bank_accounts").delete().eq("offering_id", data.fundId);
    return { ok: true, message: "Bank account disconnected." };
  });
