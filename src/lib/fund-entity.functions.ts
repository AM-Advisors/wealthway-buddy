import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const BANK_CHOICES = [
  { value: "mercury", label: "Mercury" },
  { value: "texas_capital", label: "Texas Capital Bank" },
  { value: "customers", label: "Customers Bank" },
] as const;

export const BANK_STATUSES = ["requested", "in_progress", "opened", "cancelled"] as const;

const TEAM_EMAIL = "operations@harmonious.co";
const SITE = "https://app.harmonious.co";

async function isAdminUser(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** Admins, or a fund manager assigned to this fund. */
async function assertCanManageFund(supabase: any, userId: string, offeringId: string) {
  if (await isAdminUser(supabase, userId)) return true;
  const { data, error } = await supabase
    .from("fund_managers")
    .select("id")
    .eq("user_id", userId)
    .eq("offering_id", offeringId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: you do not manage that fund.");
  return false;
}

const ss4Schema = z
  .object({
    legal_name: z.string().trim().max(200).default(""),
    trade_name: z.string().trim().max(200).default(""),
    care_of: z.string().trim().max(200).default(""),
    mailing_street: z.string().trim().max(200).default(""),
    mailing_city_state_zip: z.string().trim().max(200).default(""),
    street_address: z.string().trim().max(200).default(""),
    street_city_state_zip: z.string().trim().max(200).default(""),
    county_state: z.string().trim().max(160).default(""),
    responsible_party_name: z.string().trim().max(160).default(""),
    responsible_party_tin: z.string().trim().max(20).default(""),
    is_llc: z.boolean().default(false),
    llc_members: z.string().trim().max(10).default(""),
    llc_us_organized: z.boolean().default(true),
    entity_kind: z.string().trim().max(40).default(""),
    entity_detail: z.string().trim().max(160).default(""),
    state_incorporated: z.string().trim().max(60).default(""),
    reason: z.string().trim().max(40).default(""),
    reason_detail: z.string().trim().max(160).default(""),
    date_started: z.string().trim().max(20).default(""),
    closing_month: z.string().trim().max(20).default(""),
    employees_agricultural: z.string().trim().max(8).default(""),
    employees_household: z.string().trim().max(8).default(""),
    employees_other: z.string().trim().max(8).default(""),
    first_wages_date: z.string().trim().max(20).default(""),
    principal_activity: z.string().trim().max(40).default(""),
    principal_activity_other: z.string().trim().max(120).default(""),
    principal_line: z.string().trim().max(200).default(""),
    previous_ein_applied: z.boolean().default(false),
    previous_ein: z.string().trim().max(20).default(""),
    designee_name: z.string().trim().max(160).default(""),
    designee_phone: z.string().trim().max(40).default(""),
    designee_address: z.string().trim().max(200).default(""),
    designee_fax: z.string().trim().max(40).default(""),
    applicant_name_title: z.string().trim().max(160).default(""),
    applicant_phone: z.string().trim().max(40).default(""),
    applicant_fax: z.string().trim().max(40).default(""),
  })
  .default({});

const FUND_TYPES = [
  "SPV",
  "Private Equity",
  "Venture Capital",
  "Family Office",
  "Hedge Fund",
  "Other",
] as const;
const ENTITY_TYPES = ["LLC", "LP", "GP", "Series LLC", "Master LLC"] as const;

const saveSchema = z.object({
  offering_id: z.string().uuid(),
  legal_entity_name: z.string().trim().max(200).default(""),
  fund_type: z.enum(FUND_TYPES).nullable().default(null),
  fund_type_other: z.string().trim().max(120).default(""),
  entity_type: z.enum(ENTITY_TYPES).nullable().default(null),
  state_formed: z.string().trim().max(60).default(""),
  date_formed: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-01-31")
    .nullable()
    .default(null),
  has_ein: z.boolean().default(false),
  ein: z
    .string()
    .trim()
    .max(20)
    .default("")
    .refine((v) => v === "" || /^\d{2}-?\d{7}$/.test(v), "An EIN looks like 12-3456789"),
  ss4: ss4Schema,
});

function normalizeEin(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 9) return value.trim();
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export const getFundEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const isAdmin = await assertCanManageFund(context.supabase, context.userId, data.offering_id);

    const { data: offering, error } = await context.supabase
      .from("offerings")
      .select(
        "id, name, legal_entity_name, fund_type, fund_type_other, entity_type, state_formed, date_formed",
      )
      .eq("id", data.offering_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!offering) throw new Error("Fund not found.");

    const { data: detailRow } = await context.supabase
      .rpc("get_offering_entity_details", { p_offering_id: data.offering_id })
      .maybeSingle();

    const { data: bankRows } = await context.supabase
      .from("offering_bank_setup_requests")
      .select("*")
      .eq("offering_id", data.offering_id)
      .order("created_at", { ascending: false });

    const detail = (detailRow ?? {}) as any;
    const einStatus = (detail.ein_review_status ?? "pending") as string;
    const ss4Status = (detail.ss4_review_status ?? "pending") as string;
    // Operations checks tax records before the fund team relies on them.
    const einVisible = isAdmin || einStatus === "approved";
    const ss4Visible = isAdmin || ss4Status === "approved";

    return {
      isAdmin,
      offering: offering as any,
      details: {
        has_ein: Boolean(detail.has_ein),
        ein: einVisible ? ((detail.ein ?? "") as string) : "",
        ss4: (detail.ss4 ?? {}) as Record<string, string | boolean>,
        ss4_generated_at: (detail.ss4_generated_at ?? null) as string | null,
        has_ss4_file: ss4Visible && Boolean(detail.ss4_storage_path),
        ein_review_status: einStatus,
        ss4_review_status: ss4Status,
        review_note: (detail.review_note ?? null) as string | null,
        reviewed_at: (detail.reviewed_at ?? null) as string | null,
        withOperations: !einVisible || !ss4Visible,
      },
      bankRequests: ((bankRows ?? []) as any[]).map((r) => ({
        ...r,
        review_status: (r.review_status ?? "pending") as string,
      })),
    };
  });

export const saveFundEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertCanManageFund(context.supabase, context.userId, data.offering_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: offeringError } = await supabaseAdmin
      .from("offerings")
      .update({
        legal_entity_name: data.legal_entity_name || null,
        fund_type: data.fund_type,
        fund_type_other: data.fund_type === "Other" ? data.fund_type_other || null : null,
        entity_type: data.entity_type,
        state_formed: data.state_formed || null,
        date_formed: data.date_formed,
      } as any)
      .eq("id", data.offering_id);
    if (offeringError) throw new Error(offeringError.message);

    const { error: detailError } = await context.supabase.rpc("save_offering_entity_details", {
      p_offering_id: data.offering_id,
      p_has_ein: data.has_ein,
      p_ein: data.has_ein ? normalizeEin(data.ein) : "",
      p_ss4: data.ss4 as any,
    });
    if (detailError) throw new Error(detailError.message);

    return { ok: true };
  });

export const generateSs4 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    await assertCanManageFund(context.supabase, context.userId, data.offering_id);

    const { data: detailRow } = await context.supabase
      .rpc("get_offering_entity_details", { p_offering_id: data.offering_id })
      .maybeSingle();
    const ss4 = ((detailRow as any)?.ss4 ?? {}) as Record<string, unknown>;
    if (!String(ss4["legal_name"] ?? "").trim()) {
      throw new Error("Add the legal name of the entity before generating the form.");
    }

    const { fillSs4Pdf } = await import("@/lib/ss4-pdf.server");
    const bytes = await fillSs4Pdf(ss4 as any);

    const path = `${data.offering_id}/form-ss4-${Date.now()}.pdf`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: uploadError } = await supabaseAdmin.storage
      .from("fund-formation")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { error: saveError } = await context.supabase.rpc("save_offering_ss4_file", {
      p_offering_id: data.offering_id,
      p_path: path,
    });
    if (saveError) throw new Error(saveError.message);

    try {
      const { data: offering } = await context.supabase
        .from("offerings")
        .select("name")
        .eq("id", data.offering_id)
        .maybeSingle();
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      await sendTemplateEmail("ops-review-request", TEAM_EMAIL, {
        templateData: {
          itemLabel: "Form SS-4 and EIN",
          fundName: ((offering as any)?.name as string) ?? "A fund",
          detail: "A new Form SS-4 was generated and needs review.",
          raisedBy: "A fund manager",
          portalUrl: `${SITE}/ops/ss4`,
        },
        idempotencyKey: `ops-ss4-${path}`,
      });
    } catch (err) {
      console.error("operations SS-4 email failed", err);
    }

    const { data: signed } = await supabaseAdmin.storage
      .from("fund-formation")
      .createSignedUrl(path, 300);

    return { url: signed?.signedUrl ?? null };
  });

export const getSs4Url = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const isAdmin = await assertCanManageFund(context.supabase, context.userId, data.offering_id);

    const { data: detailRow } = await context.supabase
      .rpc("get_offering_entity_details", { p_offering_id: data.offering_id })
      .maybeSingle();
    const path = (detailRow as any)?.ss4_storage_path as string | undefined;
    if (!path) throw new Error("No form has been generated for this fund yet.");
    if (!isAdmin && ((detailRow as any)?.ss4_review_status ?? "pending") !== "approved") {
      throw new Error("This form is with the operations team for review.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("fund-formation")
      .createSignedUrl(path, 300);
    if (error) throw new Error(error.message);
    return { url: signed?.signedUrl ?? null };
  });

export const requestBankSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        bank: z.enum(["mercury", "texas_capital", "customers"]),
        note: z.string().trim().max(1000).default(""),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertCanManageFund(context.supabase, context.userId, data.offering_id);

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("legal_name, email")
      .eq("user_id", context.userId)
      .maybeSingle();
    const requesterEmail =
      ((profile as any)?.email as string | undefined) ??
      ((context.claims as any)?.email as string | undefined) ??
      null;

    const { data: inserted, error } = await context.supabase
      .from("offering_bank_setup_requests")
      .insert({
        offering_id: data.offering_id,
        bank: data.bank,
        note: data.note || null,
        requested_by: context.userId,
        requested_by_email: requesterEmail,
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const requestId = (inserted as any).id as string;

    const { data: offering } = await context.supabase
      .from("offerings")
      .select("name, legal_entity_name, entity_type, state_formed")
      .eq("id", data.offering_id)
      .maybeSingle();

    const bankLabel = BANK_CHOICES.find((b) => b.value === data.bank)?.label ?? data.bank;

    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      await sendTemplateEmail("bank-setup-request", TEAM_EMAIL, {
        templateData: {
          fundName: ((offering as any)?.name as string) ?? "A fund",
          legalEntityName: ((offering as any)?.legal_entity_name as string) ?? "",
          entityType: ((offering as any)?.entity_type as string) ?? "",
          stateFormed: ((offering as any)?.state_formed as string) ?? "",
          bankName: bankLabel,
          requestedBy: ((profile as any)?.legal_name as string) ?? requesterEmail ?? "A fund manager",
          requestedByEmail: requesterEmail ?? "",
          note: data.note ?? "",
          portalUrl: `${SITE}/admin/fund/${data.offering_id}`,
        },
        idempotencyKey: `bank-setup-${requestId}`,
      });
      await context.supabase
        .from("offering_bank_setup_requests")
        .update({ notified_at: new Date().toISOString() } as any)
        .eq("id", requestId);
    } catch (err) {
      console.error("bank setup email failed", err);
    }

    return { id: requestId };
  });

export const updateBankSetupStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        offering_id: z.string().uuid(),
        status: z.enum(BANK_STATUSES),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertCanManageFund(context.supabase, context.userId, data.offering_id);
    const { error } = await context.supabase
      .from("offering_bank_setup_requests")
      .update({ status: data.status } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
