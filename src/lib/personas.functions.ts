import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ensureActivePersona } from "@/lib/active-application";

export const ACCOUNT_KINDS = ["individual", "joint", "entity", "trust", "ira"] as const;

export const ACCOUNT_KIND_LABELS: Record<string, string> = {
  individual: "Individual",
  joint: "Joint",
  entity: "LLC / entity",
  trust: "Trust",
  ira: "IRA / retirement",
};

const accountSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(ACCOUNT_KINDS),
  label: z.string().trim().min(2, "Give this account a name").max(120),
  legal_name: z.string().trim().max(120).optional().or(z.literal("")),
  entity_name: z.string().trim().max(160).optional().or(z.literal("")),
  tax_id: z.string().trim().max(20).optional().or(z.literal("")),
  date_of_birth: z.string().trim().max(20).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().max(255).optional().or(z.literal("")),
  address_line1: z.string().trim().max(160).optional().or(z.literal("")),
  address_line2: z.string().trim().max(160).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  region: z.string().trim().max(80).optional().or(z.literal("")),
  postal_code: z.string().trim().max(20).optional().or(z.literal("")),
  country: z.string().trim().max(60).optional().or(z.literal("")),
  is_default: z.boolean().optional(),
});

export type AccountInput = z.infer<typeof accountSchema>;

export interface AccountApplication {
  application_id: string;
  offering_id: string;
  offering_name: string;
  status: string;
  current_step: string | null;
  commitment_cents: number | null;
  funding_status: string | null;
  created_at: string;
}

export interface InvestorAccount {
  id: string;
  kind: string;
  label: string;
  legal_name: string | null;
  entity_name: string | null;
  tax_id: string | null;
  date_of_birth: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  applications: AccountApplication[];
}

const blankToNull = (value: string | undefined) => (value && value.trim() ? value.trim() : null);

/** Every investing account the signed-in person holds, with its applications. */
export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ accounts: InvestorAccount[]; activeId: string | null }> => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("active_persona_id, legal_name, entity_name, email, investor_type")
      .eq("user_id", userId)
      .maybeSingle();

    const activeId = await ensureActivePersona(supabase, userId, profile as any);

    const [{ data: personas }, { data: apps }] = await Promise.all([
      supabase
        .from("investor_personas")
        .select("*")
        .eq("user_id", userId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true }),
      supabase
        .from("investor_applications")
        .select(
          "id, persona_id, offering_id, status, current_step, commitment_cents, funding_status, created_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
    ]);

    const offeringIds = Array.from(
      new Set(((apps ?? []) as any[]).map((a) => a.offering_id as string)),
    );
    const { data: offerings } = offeringIds.length
      ? await supabase.from("offerings").select("id, name").in("id", offeringIds)
      : { data: [] as any[] };
    const nameOf = new Map(((offerings ?? []) as any[]).map((o) => [o.id, o.name as string]));

    const accounts: InvestorAccount[] = ((personas ?? []) as any[]).map((p) => ({
      id: p.id,
      kind: p.kind,
      label: p.label,
      legal_name: p.legal_name,
      entity_name: p.entity_name,
      tax_id: p.tax_id,
      date_of_birth: p.date_of_birth,
      phone: p.phone,
      email: p.email,
      address_line1: p.address_line1,
      address_line2: p.address_line2,
      city: p.city,
      region: p.region,
      postal_code: p.postal_code,
      country: p.country,
      is_default: !!p.is_default,
      is_active: p.id === activeId,
      created_at: p.created_at,
      applications: ((apps ?? []) as any[])
        .filter((a) => a.persona_id === p.id)
        .map((a) => ({
          application_id: a.id,
          offering_id: a.offering_id,
          offering_name: nameOf.get(a.offering_id) ?? "Fund",
          status: a.status,
          current_step: a.current_step,
          commitment_cents: a.commitment_cents,
          funding_status: a.funding_status,
          created_at: a.created_at,
        })),
    }));

    return { accounts, activeId };
  });

/** Creates or updates one investing account. */
export const saveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => accountSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const payload = {
      kind: data.kind,
      label: data.label.trim(),
      legal_name: blankToNull(data.legal_name),
      entity_name: blankToNull(data.entity_name),
      tax_id: blankToNull(data.tax_id),
      date_of_birth: blankToNull(data.date_of_birth),
      phone: blankToNull(data.phone),
      email: blankToNull(data.email),
      address_line1: blankToNull(data.address_line1),
      address_line2: blankToNull(data.address_line2),
      city: blankToNull(data.city),
      region: blankToNull(data.region),
      postal_code: blankToNull(data.postal_code),
      country: blankToNull(data.country),
    };

    let accountId = data.id ?? null;

    if (accountId) {
      const { error } = await supabase
        .from("investor_personas")
        .update(payload)
        .eq("id", accountId)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await supabase
        .from("investor_personas")
        .insert({ ...payload, user_id: userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      accountId = created.id as string;
    }

    if (data.is_default && accountId) {
      await supabase
        .from("investor_personas")
        .update({ is_default: false })
        .eq("user_id", userId)
        .neq("id", accountId);
      const { error } = await supabase
        .from("investor_personas")
        .update({ is_default: true })
        .eq("id", accountId)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    }

    return { ok: true, id: accountId };
  });

/** Switches which account the onboarding steps read and write. */
export const setActiveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ accountId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: owned } = await supabase
      .from("investor_personas")
      .select("id")
      .eq("id", data.accountId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!owned) throw new Error("That account was not found.");

    const { error } = await supabase
      .from("profiles")
      .update({ active_persona_id: data.accountId })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

/** Removes an account that has not been used for an application yet. */
export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ accountId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: apps } = await supabase
      .from("investor_applications")
      .select("id")
      .eq("user_id", userId)
      .eq("persona_id", data.accountId)
      .limit(1);
    if ((apps ?? []).length) {
      throw new Error("This account has an application, so it cannot be removed.");
    }

    const { data: remaining } = await supabase
      .from("investor_personas")
      .select("id")
      .eq("user_id", userId);
    if ((remaining ?? []).length <= 1) throw new Error("You need at least one account.");

    const next = ((remaining ?? []) as any[]).find((r) => r.id !== data.accountId);

    await supabase
      .from("profiles")
      .update({ active_persona_id: next?.id ?? null })
      .eq("user_id", userId)
      .eq("active_persona_id", data.accountId);

    const { error } = await supabase
      .from("investor_personas")
      .delete()
      .eq("id", data.accountId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
