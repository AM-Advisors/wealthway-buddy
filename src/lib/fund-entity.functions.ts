import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

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
  .prefault({});

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

function stripRpTinPlain(ss4: Record<string, unknown>) {
  const { responsible_party_tin: _a, responsible_party_tin_last4: _b, ...rest } = ss4 as any;
  return rest as Record<string, unknown>;
}

async function rpMeta(offeringId: string) {
  const { rpIdentifierMeta } = await import("@/lib/responsible-party-identifier.server");
  return rpIdentifierMeta(offeringId);
}

function normalizeEin(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 9) return value.trim();
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export const getFundEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
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
        ss4: stripRpTinPlain(detail.ss4 ?? {}) as Record<string, string | boolean>,
        rp_tin_on_file: (await rpMeta(data.offering_id)).onFile,
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
  .validator((data: unknown) => saveSchema.parse(data))
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

    // Responsible Party SSN/ITIN goes only to the encrypted vault, never into SS-4 JSON.
    const rpTin = String(data.ss4.responsible_party_tin ?? "").trim();
    if (rpTin) {
      const { storeRpIdentifier } = await import("@/lib/responsible-party-identifier.server");
      await storeRpIdentifier(data.offering_id, rpTin, context.userId);
    }
    const { error: detailError } = await context.supabase.rpc("save_offering_entity_details", {
      p_offering_id: data.offering_id,
      p_has_ein: data.has_ein,
      p_ein: data.has_ein ? normalizeEin(data.ein) : "",
      p_ss4: stripRpTinPlain(data.ss4) as any,
    });
    if (detailError) throw new Error(detailError.message);
    await (await import("@/lib/fund-setup.server")).syncFundFacts(data.offering_id);

    return { ok: true };
  });

export const generateSs4 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
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
    // Identifier is decrypted server-side for this authorized generation only; never returned or persisted in plaintext.
    const { readRpIdentifierForAuthorizedOperation } = await import("@/lib/responsible-party-identifier.server");
    const rpTin = (await readRpIdentifierForAuthorizedOperation(data.offering_id)) ?? "";
    const bytes = await fillSs4Pdf({ ...stripRpTinPlain(ss4), responsible_party_tin: rpTin } as any);

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
  .validator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
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

/** Attach the fund's EIN (last 4 shown; full EIN stays in entity details) to open Texas Capital/Mercury requests. */
async function attachEinToBankRequests(offeringId: string, ein: string | null | undefined, userId: string) {
  const digits = String(ein ?? "").replace(/\D/g, "");
  if (digits.length !== 9) return 0;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: rows } = await db.from("offering_bank_setup_requests").select("id").eq("offering_id", offeringId)
    .in("bank", ["texas_capital", "mercury"]).neq("status", "cancelled").is("ein_attached_at", null);
  const ids = ((rows ?? []) as any[]).map((r) => r.id);
  if (!ids.length) return 0;
  await db.from("offering_bank_setup_requests").update({ ein_last4: digits.slice(-4), ein_attached_at: new Date().toISOString() }).in("id", ids);
  try {
    const { logFundAudit } = await import("@/lib/fund-audit.server");
    await logFundAudit(userId, { offeringId, eventType: "bank_request_ein_attached", summary: `EIN added to ${ids.length} bank account request${ids.length > 1 ? "s" : ""}`, values: { ein: digits } });
  } catch { /* best-effort */ }
  return ids.length;
}

export const requestBankSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
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

    try {
      const { data: det } = await context.supabase.rpc("get_offering_entity_details", { p_offering_id: data.offering_id }).maybeSingle();
      await attachEinToBankRequests(data.offering_id, (det as any)?.ein, context.userId);
    } catch (e) { console.error("attach EIN failed", e); }
    return { id: requestId };
  });

export const updateBankSetupStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
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

export type MercuryReadiness = {
  configured: boolean; legalName: string; fundName: string; entityType: string; addressOnFile: string; hasEin: boolean;
  owners: { name: string; email: string | null; phone: string | null; role: string }[];
  missing: string[]; existing: { id: string; signupLink: string; status: string } | null;
};

// ---- Mercury account opening (pre-fill only; the applicant submits on Mercury) ----

export const getMercuryReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    await assertCanManageFund(context.supabase, context.userId, data.offering_id);
    const { mercuryReadiness } = await import("@/lib/mercury-onboarding.server");
    return (await mercuryReadiness(data.offering_id)) as MercuryReadiness;
  });

export const startMercuryApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({
      offering_id: z.string().uuid(),
      address: z.object({
        address1: z.string().trim().min(3).max(200),
        address2: z.string().trim().max(200).optional(),
        city: z.string().trim().min(2).max(100),
        region: z.string().trim().length(2).toUpperCase(),
        postalCode: z.string().trim().regex(/^\d{5}(-\d{4})?$/),
      }),
      phone: z.string().trim().max(30).optional(),
      website: z.string().trim().max(200).optional(),
      description: z.string().trim().max(500).optional(),
      formationDoc: z.object({
        fileName: z.string().max(200),
        base64: z.string().max(28_000_000),
        type: z.enum(["ArticlesOfOrganization", "CertificateOfFormation", "PartnershipAgreement", "ArticlesOfIncorporation"]),
      }).optional(),
      confirmed: z.literal(true),
    }).parse(data),
  )
  .handler(async ({ context, data }): Promise<{ id: string; signupLink: string; reused: boolean }> => {
    await assertCanManageFund(context.supabase, context.userId, data.offering_id);
    const email = ((context.claims as any)?.email as string | undefined) ?? null;
    const { startMercuryApplication: start } = await import("@/lib/mercury-onboarding.server");
    return start(
      { offeringId: data.offering_id, address: data.address, phone: data.phone, website: data.website, description: data.description, formationDoc: data.formationDoc },
      { userId: context.userId, email },
    );
  });

/** Banking setup owner (fund manager or Harmonious) plus open bank requests. */
export const getBankingChoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    await assertCanManageFund(context.supabase, context.userId, data.offering_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: o }, { data: reqs }] = await Promise.all([
      (supabaseAdmin as any).from("offerings").select("banking_setup_by").eq("id", data.offering_id).maybeSingle(),
      context.supabase.from("offering_bank_setup_requests").select("id, bank, status, created_at, ein_last4, ein_attached_at").eq("offering_id", data.offering_id).order("created_at", { ascending: false }),
    ]);
    return {
      setupBy: ((o as any)?.banking_setup_by ?? null) as "fund" | "harmonious" | null,
      requests: ((reqs ?? []) as any[]).map((r) => ({ id: r.id as string, bank: r.bank as string, status: (r.status ?? "requested") as string, createdAt: r.created_at as string, einLast4: (r.ein_last4 ?? null) as string | null })),
    };
  });

export const setBankingChoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ offering_id: z.string().uuid(), setup_by: z.enum(["fund", "harmonious"]) }).parse(data))
  .handler(async ({ context, data }) => {
    await assertCanManageFund(context.supabase, context.userId, data.offering_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("offerings").update({ banking_setup_by: data.setup_by }).eq("id", data.offering_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Who obtains the EIN, and save an EIN the fund got itself (SS-4 answers untouched). */
export const getEinChoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const isAdmin = await assertCanManageFund(context.supabase, context.userId, data.offering_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: o } = await (supabaseAdmin as any).from("offerings").select("ein_setup_by").eq("id", data.offering_id).maybeSingle();
    return { isAdmin, setupBy: ((o as any)?.ein_setup_by ?? null) as "fund" | "harmonious" | null };
  });

export const setEinChoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ offering_id: z.string().uuid(), setup_by: z.enum(["fund", "harmonious"]) }).parse(data))
  .handler(async ({ context, data }) => {
    await assertCanManageFund(context.supabase, context.userId, data.offering_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("offerings").update({ ein_setup_by: data.setup_by }).eq("id", data.offering_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveFundEinFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ offering_id: z.string().uuid(), ein: z.string().trim().regex(/^\d{2}-?\d{7}$/, "An EIN looks like 12-3456789") }).parse(data))
  .handler(async ({ context, data }) => {
    await assertCanManageFund(context.supabase, context.userId, data.offering_id);
    const { data: detail } = await context.supabase.rpc("get_offering_entity_details", { p_offering_id: data.offering_id }).maybeSingle();
    const ein = normalizeEin(data.ein);
    const { error } = await context.supabase.rpc("save_offering_entity_details", { p_offering_id: data.offering_id, p_has_ein: true, p_ein: ein, p_ss4: stripRpTinPlain(((detail as any)?.ss4 ?? {}) as any) as any });
    if (error) throw new Error(error.message);
    await (await import("@/lib/fund-setup.server")).syncFundFacts(data.offering_id);
    // IRS filing record for the EIN (one per EIN), plus an Audit History entry (EIN shown as last 4 only).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: existing } = await db.from("fund_regulatory_filings").select("id").eq("offering_id", data.offering_id).eq("filing_type", "irs_ein").eq("accession_number", ein).is("removed_at", null).maybeSingle();
    let filingId = existing?.id ?? null;
    if (!filingId) {
      const { data: row, error: fErr } = await db.from("fund_regulatory_filings").insert({ offering_id: data.offering_id, filing_type: "irs_ein", filing_kind: "initial", accession_number: ein, filing_date: new Date().toISOString().slice(0, 10), notes: "EIN assigned by the IRS; submitted by the fund in Harmonious.", recorded_by: context.userId }).select("id").single();
      if (fErr) throw new Error(fErr.message);
      filingId = row.id;
      const { logFundAudit } = await import("@/lib/fund-audit.server");
      await logFundAudit(context.userId, { offeringId: data.offering_id, eventType: "irs_ein_filing_recorded", summary: "IRS EIN filing recorded", values: { ein, filingType: "IRS EIN (Form SS-4 / online)", filingDate: new Date().toISOString().slice(0, 10) } });
    }
    await attachEinToBankRequests(data.offering_id, ein, context.userId).catch((e) => console.error("attach EIN failed", e));
    return { ok: true, filingId };
  });
