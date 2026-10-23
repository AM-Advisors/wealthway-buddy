import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
// Money, banking and account changes need a fully cleared identity check (not "limited" review access).
import { requireFullyVerifiedAuth as requireSupabaseAuth } from "@/lib/require-auth";

const input = z.object({ onboardingId: z.string().uuid() });

/** Only the investor on this onboarding may verify a bank for it. */
async function investorRow(userId: string, onboardingId: string) {
  const { assertOnboardingAccess } = await import("@/lib/investor-onboarding.server");
  const { row, role } = await assertOnboardingAccess(userId, onboardingId);
  if (role !== "investor") throw new Error("Only the investor can verify their own bank account.");
  return row as any;
}

export const startInvestorBankVerifyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input.parse)
  .handler(async ({ data, context }) => {
    await investorRow(context.userId, data.onboardingId);
    const { createVerifyLinkToken } = await import("@/lib/plaid.server");
    return { linkToken: (await createVerifyLinkToken({ userId: context.userId })).link_token };
  });

export const finishInvestorBankVerifyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input.extend({ publicToken: z.string().min(10).max(300) }).parse)
  .handler(async ({ data, context }) => {
    const row = await investorRow(context.userId, data.onboardingId);
    const plaid = await import("@/lib/plaid.server");
    const { bankOwnerMatches } = await import("@/lib/bank-name-match");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { access_token } = await plaid.exchangePublicToken(data.publicToken);
    try {
      const id = await plaid.getIdentity(access_token);
      const acct = id.accounts[0];
      const owners = (acct?.owners ?? []).flatMap((o) => o.names ?? []);
      let institution: string | null = null;
      if (id.item.institution_id) institution = (await plaid.getInstitution(id.item.institution_id).catch(() => null))?.institution.name ?? null;

      const expected: string[] = [];
      if (row.investment_profile_id) {
        const { data: p } = await db.from("investment_profiles").select("legal_name").eq("id", row.investment_profile_id).maybeSingle();
        if (p?.legal_name) expected.push(p.legal_name);
      }
      if (row.person_id) {
        const { data: p } = await db.from("persons").select("legal_first_name, legal_last_name, first_name, last_name").eq("id", row.person_id).maybeSingle();
        const n = [p?.legal_first_name ?? p?.first_name, p?.legal_last_name ?? p?.last_name].filter(Boolean).join(" ");
        if (n) expected.push(n);
      }
      const match = bankOwnerMatches(owners, expected);
      const { error } = await db.from("investor_bank_verifications").insert({
        onboarding_id: data.onboardingId, investor_user_id: context.userId, institution_name: institution,
        account_mask: acct?.mask ?? null, owner_names: owners, expected_names: expected,
        name_match: match, status: match ? "verified" : "name_mismatch",
      });
      if (error) throw new Error(error.message);
      return { status: match ? "verified" : "name_mismatch", institution, mask: acct?.mask ?? null };
    } finally {
      // Nothing is kept at Plaid or here beyond the result: no account numbers, no ongoing access.
      await plaid.removeItem(access_token).catch((e) => console.error("plaid item remove failed", e));
    }
  });

export const investorBankVerifyStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input.parse)
  .handler(async ({ data, context }) => {
    const { data: v } = await context.supabase.from("investor_bank_verifications" as any)
      .select("status, institution_name, account_mask, created_at").eq("onboarding_id", data.onboardingId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    return (v ?? null) as null | { status: string; institution_name: string | null; account_mask: string | null; created_at: string };
  });
