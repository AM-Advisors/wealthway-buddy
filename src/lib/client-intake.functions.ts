import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** First-run fund details for a new client contact.
 *
 *  An administrator invites the contact; the first time a main contact signs in
 *  they tell Harmonious about their fund, and that creates the fund record.
 *  Harmonious records and administers — the fund stays closed to investors until
 *  a signed and approved statement of work covers it. */

/** Contacts who must complete the intake. View-only contacts go straight in. */
const MAIN_CONTACT_ROLES = [
  "client_gp",
  "client_signatory",
  "client_finance",
  "client_legal",
  "client_compliance",
];

const STAFF_ROLES = [
  "admin",
  "super_admin",
  "legal",
  "compliance",
  "finance",
  "client_success",
  "executive",
  "operations",
  "fund_administration",
  "tax",
];

export const ENTITY_TYPES = ["LLC", "LP", "Corporation", "Trust", "Series LLC", "Other"] as const;
export const FUND_TYPES = [
  "Real estate",
  "Venture capital",
  "Private equity",
  "Private credit",
  "Single asset SPV",
  "Other",
] as const;
export const REG_TYPES = [
  { value: "506b", label: "Reg D 506(b) — private, no general solicitation" },
  { value: "506c", label: "Reg D 506(c) — verified accredited investors only" },
  { value: "regcf", label: "Reg CF" },
  { value: "rega", label: "Reg A" },
  { value: "regaplus", label: "Reg A+" },
] as const;

const person = z
  .object({
    name: z.string().trim().max(160).optional().default(""),
    firm: z.string().trim().max(160).optional().default(""),
    email: z.string().trim().max(255).optional().default(""),
  })
  .default({ name: "", firm: "", email: "" });

const detailsSchema = z.object({
  // Fund basics
  fund_name: z.string().trim().max(160).optional().default(""),
  legal_entity_name: z.string().trim().max(160).optional().default(""),
  entity_type: z.string().trim().max(60).optional().default(""),
  state_formed: z.string().trim().max(60).optional().default(""),
  date_formed: z.string().trim().max(20).optional().default(""),
  fund_type: z.string().trim().max(60).optional().default(""),
  fund_type_other: z.string().trim().max(120).optional().default(""),
  // Offering terms
  reg_type: z.string().trim().max(20).optional().default(""),
  target_raise: z.string().trim().max(30).optional().default(""),
  min_investment: z.string().trim().max(30).optional().default(""),
  expected_investors: z.string().trim().max(20).optional().default(""),
  // Key people and advisers
  general_partner: person,
  signatory: person,
  lawyer: person,
  accountant: person,
  bank_contact: person,
  // Banking and tax
  has_ein: z.boolean().optional().default(false),
  ein: z.string().trim().max(20).optional().default(""),
  bank_name: z.string().trim().max(160).optional().default(""),
  distribution_source: z.string().trim().max(400).optional().default(""),
});

export type IntakeDetails = z.infer<typeof detailsSchema>;

const dollarsToCents = (value: string | undefined) => {
  const n = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "fund";

async function membership(context: any) {
  const [{ data: roleRows }, { data: memberships }] = await Promise.all([
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    context.supabase.from("client_users").select("client_id, client_role, can_approve").eq("user_id", context.userId),
  ]);
  const roles = ((roleRows ?? []) as any[]).map((r) => String(r.role));
  const rows = (memberships ?? []) as any[];
  return {
    roles,
    isStaff: roles.some((r) => STAFF_ROLES.includes(r)),
    memberships: rows,
  };
}

export interface IntakeRequirement {
  required: boolean;
  clientId: string | null;
  clientName: string | null;
  draft: { id: string; details: Record<string, any> } | null;
}

/** Does the signed-in person still owe us their fund details? */
export const getIntakeRequirement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IntakeRequirement> => {
    const who = await membership(context);
    const empty: IntakeRequirement = { required: false, clientId: null, clientName: null, draft: null };

    // Harmonious staff never see the client intake form.
    if (who.isStaff) return empty;

    const main = who.memberships.find((m) => MAIN_CONTACT_ROLES.includes(String(m.client_role)));
    if (!main) return empty;

    const clientId = String(main.client_id);

    const [{ data: funds }, { data: intakes }, { data: client }] = await Promise.all([
      context.supabase.from("offerings").select("id").eq("client_id", clientId).limit(1),
      context.supabase
        .from("client_fund_intakes")
        .select("id, status, details")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      context.supabase.from("clients").select("name").eq("id", clientId).maybeSingle(),
    ]);

    const rows = (intakes ?? []) as any[];
    const submitted = rows.some((r) => r.status !== "draft");
    // A client that already has a fund on the platform never sees the form.
    if (submitted || (funds ?? []).length > 0) return empty;

    const draft = rows.find((r) => r.status === "draft") ?? null;

    return {
      required: true,
      clientId,
      clientName: (client as any)?.name ?? null,
      draft: draft ? { id: String(draft.id), details: (draft.details ?? {}) as Record<string, any> } : null,
    };
  });

/** Saves what they have typed so far so they can come back to it. */
export const saveFundIntakeDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid(), details: detailsSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await membership(context);
    const main = who.memberships.find(
      (m) => String(m.client_id) === data.clientId && MAIN_CONTACT_ROLES.includes(String(m.client_role)),
    );
    if (!main) throw new Error("Forbidden: only this organisation's main contacts can fill in its fund details.");

    const { data: existing } = await context.supabase
      .from("client_fund_intakes")
      .select("id")
      .eq("client_id", data.clientId)
      .eq("status", "draft")
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase
        .from("client_fund_intakes")
        .update({ details: data.details as any })
        .eq("id", (existing as any).id);
      if (error) throw new Error(error.message);
      return { ok: true, id: String((existing as any).id) };
    }

    const { data: inserted, error } = await context.supabase
      .from("client_fund_intakes")
      .insert({
        client_id: data.clientId,
        details: data.details as any,
        status: "draft",
        created_by: context.userId,
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: String((inserted as any).id) };
  });

/** Creates the fund from the details given, and opens the portal. */
export const submitFundIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid(), details: detailsSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await membership(context);
    const main = who.memberships.find(
      (m) => String(m.client_id) === data.clientId && MAIN_CONTACT_ROLES.includes(String(m.client_role)),
    );
    if (!main) throw new Error("Forbidden: only this organisation's main contacts can fill in its fund details.");

    const d = data.details;
    if (!d.fund_name.trim()) throw new Error("Please tell us the fund's name.");
    if (!d.legal_entity_name.trim()) throw new Error("Please tell us the legal entity name.");
    if (!d.entity_type.trim()) throw new Error("Please choose the entity type.");
    if (!REG_TYPES.some((r) => r.value === d.reg_type)) throw new Error("Please choose the exemption used.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Nothing else may have been created for this client in the meantime.
    const { data: alreadySubmitted } = await supabaseAdmin
      .from("client_fund_intakes")
      .select("id")
      .eq("client_id", data.clientId)
      .neq("status", "draft")
      .limit(1);
    if ((alreadySubmitted ?? []).length > 0) {
      return { ok: true, already: true } as const;
    }

    // A unique address for the fund's page.
    const base = slugify(d.fund_name);
    let slug = base;
    for (let i = 2; i < 40; i += 1) {
      const { data: clash } = await supabaseAdmin.from("offerings").select("id").eq("slug", slug).maybeSingle();
      if (!clash) break;
      slug = `${base}-${i}`;
    }

    // A signed and approved statement of work with no fund attached can cover this one.
    const { data: sows } = await supabaseAdmin
      .from("client_sows")
      .select("id, status, signed_on, signed_by, approval_status, offering_id")
      .eq("client_id", data.clientId)
      .eq("status", "active")
      .is("offering_id", null);
    const eligibleSow = ((sows ?? []) as any[]).find(
      (s) => s.signed_on && s.signed_by && s.approval_status === "approved",
    );

    // Start the fund on the client's agreed rates (then the standard card) so
    // its wire fee and closing cost are ready to invoice.
    const { seedFundFeeColumns } = await import("@/lib/fee-rates.server");
    const seededFees = await seedFundFeeColumns(supabaseAdmin, data.clientId);

    const { data: inserted, error } = await supabaseAdmin
      .from("offerings")
      .insert({
        ...seededFees,
        client_id: data.clientId,
        name: d.fund_name.trim(),
        slug,
        legal_entity_name: d.legal_entity_name.trim(),
        entity_type: d.entity_type,
        fund_type: d.fund_type || null,
        fund_type_other: d.fund_type === "Other" ? d.fund_type_other || null : null,
        state_formed: d.state_formed || null,
        date_formed: d.date_formed || null,
        reg_type: d.reg_type,
        target_raise_cents: dollarsToCents(d.target_raise) || null,
        min_investment_cents: dollarsToCents(d.min_investment),
        // Closed to investors until Harmonious has set the fund up.
        is_open: false,
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const offeringId = String((inserted as any).id);

    if (eligibleSow) {
      await supabaseAdmin
        .from("client_sows")
        .update({ offering_id: offeringId } as any)
        .eq("id", eligibleSow.id)
        .is("offering_id", null);
    }

    const { data: draft } = await supabaseAdmin
      .from("client_fund_intakes")
      .select("id")
      .eq("client_id", data.clientId)
      .eq("status", "draft")
      .maybeSingle();

    const record = {
      client_id: data.clientId,
      offering_id: offeringId,
      details: d as any,
      status: "submitted",
      submitted_by: context.userId,
      submitted_at: new Date().toISOString(),
    };

    if (draft) {
      await supabaseAdmin.from("client_fund_intakes").update(record as any).eq("id", (draft as any).id);
    } else {
      await supabaseAdmin
        .from("client_fund_intakes")
        .insert({ ...record, created_by: context.userId } as any);
    }

    await supabaseAdmin.from("contract_audit_events").insert({
      actor_id: context.userId,
      actor_role: String(main.client_role),
      client_id: data.clientId,
      offering_id: offeringId,
      area: "onboarding",
      action: "client submitted their fund details",
      target: d.fund_name.trim(),
      new_value: { fund_id: offeringId, sow_linked: eligibleSow ? eligibleSow.id : null } as any,
      source: "web",
    } as any);

    return { ok: true, offeringId, awaitingReview: !eligibleSow } as const;
  });

/** Staff view: the fund details a client submitted. */
export const getClientIntakes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await membership(context);
    if (!who.isStaff) throw new Error("Forbidden: this area is for the Harmonious team.");

    const { data: rows } = await context.supabase
      .from("client_fund_intakes")
      .select("id, status, details, offering_id, submitted_at, submitted_by, created_at")
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: false });

    return { intakes: (rows ?? []) as any[] };
  });
