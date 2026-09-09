import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MEMO_SECTIONS = [
  { key: "overview", label: "Overview", hint: "What the fund is, in a few plain sentences." },
  { key: "strategy", label: "Strategy", hint: "How the fund invests and why." },
  { key: "opportunity", label: "The opportunity", hint: "Market, timing and edge." },
  { key: "terms", label: "Terms", hint: "Fees, minimum, structure and closing." },
  { key: "use_of_proceeds", label: "Use of proceeds", hint: "Where the capital goes." },
  { key: "team", label: "Team", hint: "Who runs the fund and their track record." },
  { key: "risks", label: "Risks", hint: "The honest risk disclosure investors should read." },
] as const;

export type MemoSectionKey = (typeof MEMO_SECTIONS)[number]["key"];

const memoSchema = z.object({
  offering_id: z.string().uuid(),
  headline: z.string().trim().max(200).default(""),
  overview: z.string().trim().max(20000).default(""),
  strategy: z.string().trim().max(20000).default(""),
  opportunity: z.string().trim().max(20000).default(""),
  terms: z.string().trim().max(20000).default(""),
  use_of_proceeds: z.string().trim().max(20000).default(""),
  team: z.string().trim().max(20000).default(""),
  risks: z.string().trim().max(20000).default(""),
  is_published: z.boolean().default(false),
});

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

const emptyMemo = {
  headline: "",
  overview: "",
  strategy: "",
  opportunity: "",
  terms: "",
  use_of_proceeds: "",
  team: "",
  risks: "",
  is_published: false,
  published_at: null as string | null,
  updated_at: null as string | null,
};

/** Manager/admin view: the funds they can edit plus the memo for the selected one. */
export const getMemoForEdit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ offering_id: z.string().uuid().nullable().optional() })
      .optional()
      .parse(data ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const funds = (await editableFunds(supabase, userId)).map((o) => ({
      id: o.id as string,
      name: o.name as string,
      reg_type: (o.reg_type as string) ?? null,
    }));

    const selectedId =
      (data?.offering_id && funds.find((f) => f.id === data.offering_id)?.id) ?? funds[0]?.id ?? null;
    if (!selectedId) return { funds, selected: null, memo: emptyMemo };

    const { data: memo } = await supabase
      .from("offering_memos")
      .select("*")
      .eq("offering_id", selectedId)
      .maybeSingle();

    return {
      funds,
      selected: funds.find((f) => f.id === selectedId) ?? null,
      memo: memo ? { ...emptyMemo, ...(memo as any) } : emptyMemo,
    };
  });

export const saveMemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => memoSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const allowed = (await editableFunds(supabase, userId)).some((o) => o.id === data.offering_id);
    if (!allowed) throw new Error("You do not manage that fund.");

    const now = new Date().toISOString();
    const { error } = await supabase.from("offering_memos").upsert(
      {
        ...data,
        updated_by: userId,
        published_at: data.is_published ? now : null,
      },
      { onConflict: "offering_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, saved_at: now };
  });

/** Investor view: published memos for the funds this person is attached to. */
export const getMemoForInvestor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ offering_id: z.string().uuid().nullable().optional() })
      .optional()
      .parse(data ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const [{ data: apps }, { data: access }] = await Promise.all([
      supabase.from("investor_applications").select("offering_id").eq("user_id", userId),
      supabase.from("investor_fund_access").select("offering_id").eq("user_id", userId),
    ]);
    const ids = Array.from(
      new Set([...((apps ?? []) as any[]), ...((access ?? []) as any[])].map((r) => r.offering_id as string)),
    );
    if (ids.length === 0) return { funds: [], selected: null, memo: null };

    const { data: offerings } = await supabase
      .from("offerings")
      .select("id, name, reg_type, min_investment_cents")
      .in("id", ids);

    const funds = ((offerings ?? []) as any[]).map((o) => ({
      id: o.id as string,
      name: o.name as string,
      reg_type: (o.reg_type as string) ?? null,
      min_investment_cents: (o.min_investment_cents as number) ?? null,
    }));

    const selectedId =
      (data?.offering_id && funds.find((f) => f.id === data.offering_id)?.id) ?? funds[0]?.id ?? null;
    if (!selectedId) return { funds, selected: null, memo: null };

    const { data: memo } = await supabase
      .from("offering_memos")
      .select(
        "headline, overview, strategy, opportunity, terms, use_of_proceeds, team, risks, published_at, updated_at",
      )
      .eq("offering_id", selectedId)
      .maybeSingle();

    return {
      funds,
      selected: funds.find((f) => f.id === selectedId) ?? null,
      memo: (memo as any) ?? null,
    };
  });
