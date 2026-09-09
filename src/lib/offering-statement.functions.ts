import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const optionalMoney = z.number().int().min(0).max(1_000_000_000_000).nullable().default(null);
const optionalBps = z.number().int().min(0).max(10000).nullable().default(null);
const optionalYears = z.number().min(0).max(99).nullable().default(null);
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .default(null);

const statementSchema = z.object({
  offering_id: z.string().uuid(),
  headline: z.string().trim().max(200).default(""),
  summary: z.string().trim().max(8000).default(""),
  security_type: z.string().trim().max(160).default(""),
  target_raise_cents: optionalMoney,
  min_investment_cents: optionalMoney,
  max_investment_cents: optionalMoney,
  management_fee_bps: optionalBps,
  carried_interest_bps: optionalBps,
  preferred_return_bps: optionalBps,
  fund_term_years: optionalYears,
  investment_period_years: optionalYears,
  first_closing_date: optionalDate,
  final_closing_date: optionalDate,
  capital_call_terms: z.string().trim().max(8000).default(""),
  distribution_policy: z.string().trim().max(8000).default(""),
  fees_and_expenses: z.string().trim().max(8000).default(""),
  transfer_restrictions: z.string().trim().max(8000).default(""),
  reporting: z.string().trim().max(8000).default(""),
  other_terms: z.string().trim().max(8000).default(""),
  is_published: z.boolean().default(false),
});

export type OfferingStatementInput = z.infer<typeof statementSchema>;

export const emptyStatement = {
  headline: "",
  summary: "",
  security_type: "",
  target_raise_cents: null as number | null,
  min_investment_cents: null as number | null,
  max_investment_cents: null as number | null,
  management_fee_bps: null as number | null,
  carried_interest_bps: null as number | null,
  preferred_return_bps: null as number | null,
  fund_term_years: null as number | null,
  investment_period_years: null as number | null,
  first_closing_date: null as string | null,
  final_closing_date: null as string | null,
  capital_call_terms: "",
  distribution_policy: "",
  fees_and_expenses: "",
  transfer_restrictions: "",
  reporting: "",
  other_terms: "",
  is_published: false,
  published_at: null as string | null,
  updated_at: null as string | null,
};

const SELECT_COLUMNS =
  "offering_id, headline, summary, security_type, target_raise_cents, min_investment_cents, max_investment_cents, management_fee_bps, carried_interest_bps, preferred_return_bps, fund_term_years, investment_period_years, first_closing_date, final_closing_date, capital_call_terms, distribution_policy, fees_and_expenses, transfer_restrictions, reporting, other_terms, is_published, published_at, updated_at";

function normalise(row: any) {
  if (!row) return { ...emptyStatement };
  return {
    ...emptyStatement,
    ...row,
    fund_term_years: row.fund_term_years === null ? null : Number(row.fund_term_years),
    investment_period_years:
      row.investment_period_years === null ? null : Number(row.investment_period_years),
  };
}

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
      .select("id, name, reg_type, target_raise_cents, min_investment_cents")
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
    .select("id, name, reg_type, target_raise_cents, min_investment_cents")
    .in("id", ids)
    .order("created_at", { ascending: true });
  return (data ?? []) as any[];
}

/** Manager/admin view: the funds they run plus the offering statement for one of them. */
export const getOfferingStatementForEdit = createServerFn({ method: "GET" })
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
    if (!selectedId) return { funds, selected: null, statement: { ...emptyStatement } };

    const { data: row } = await context.supabase
      .from("offering_statements")
      .select(SELECT_COLUMNS)
      .eq("offering_id", selectedId)
      .maybeSingle();

    const fund = funds.find((f) => f.id === selectedId) ?? null;
    const statement = normalise(row);

    // Sensible starting numbers from the fund setup when nothing is saved yet.
    if (!row && fund) {
      statement.target_raise_cents = (fund.target_raise_cents as number) ?? null;
      statement.min_investment_cents = (fund.min_investment_cents as number) ?? null;
    }

    return { funds, selected: fund, statement };
  });

/** Save the fund's offering terms, optionally publishing them to the diligence room. */
export const saveOfferingStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => statementSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { offering_id, is_published, ...fields } = data;

    const { data: existing } = await context.supabase
      .from("offering_statements")
      .select("id, is_published, published_at")
      .eq("offering_id", offering_id)
      .maybeSingle();

    const publishedAt = is_published
      ? ((existing as any)?.published_at ?? new Date().toISOString())
      : null;

    const payload = {
      offering_id,
      ...fields,
      is_published,
      published_at: publishedAt,
      updated_by: context.userId,
    };

    const { error } = await context.supabase
      .from("offering_statements")
      .upsert(payload, { onConflict: "offering_id" });
    if (error) throw new Error(error.message);

    return { ok: true, published: is_published };
  });

/** What the diligence room shows: the published statement (fund team also sees drafts). */
export const getOfferingStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: row } = await context.supabase
      .from("offering_statements")
      .select(SELECT_COLUMNS)
      .eq("offering_id", data.offering_id)
      .maybeSingle();

    if (!row) return { statement: null };
    return { statement: normalise(row) };
  });
