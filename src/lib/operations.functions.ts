import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SITE = "https://app.harmonious.co";
const TEAM_EMAIL = "operations@harmonious.co";

export const TAX_DOC_TYPES = [
  { value: "w9", label: "Form W-9" },
  { value: "w8ben", label: "Form W-8BEN" },
  { value: "w8bene", label: "Form W-8BEN-E" },
  { value: "k1", label: "Schedule K-1" },
  { value: "other", label: "Other tax document" },
] as const;

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;

type Who = { userId: string; isAdmin: boolean; isOperations: boolean; name: string; email: string };

/** Operations staff and admins only. Everything in this module goes through here. */
async function requireOperations(context: any): Promise<Who> {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = ((data ?? []) as any[]).map((r) => r.role as string);
  const isAdmin = roles.includes("admin");
  const isOperations = roles.includes("operations");
  if (!isAdmin && !isOperations) {
    throw new Error("Forbidden: the operations portal is for the operations team.");
  }

  const { data: profile } = await context.supabase
    .from("profiles")
    .select("legal_name, email")
    .eq("user_id", context.userId)
    .maybeSingle();
  const email =
    ((profile as any)?.email as string | undefined) ??
    ((context.claims as any)?.email as string | undefined) ??
    "";
  return {
    userId: context.userId,
    isAdmin,
    isOperations,
    name: ((profile as any)?.legal_name as string | undefined) || email || "The operations team",
    email,
  };
}

/** Tells the app whether the signed-in person may see the operations area. */
export const getOperationsAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Legacy coarse projection of the canonical staff facts.
    const { gatherStaffFacts, operationsAccessProjection } = await import("@/lib/session-facts.server");
    return operationsAccessProjection(await gatherStaffFacts(context));
  });

async function fundMap(supabase: any, ids: string[]) {
  if (ids.length === 0) return new Map<string, any>();
  const { data } = await supabase
    .from("offerings")
    .select("id, name, legal_entity_name, entity_type, state_formed, fund_type")
    .in("id", ids);
  return new Map(((data ?? []) as any[]).map((f) => [f.id as string, f]));
}

async function peopleMap(supabase: any, ids: (string | null)[]) {
  const clean = [...new Set(ids.filter(Boolean) as string[])];
  if (clean.length === 0) return new Map<string, any>();
  const { data } = await supabase
    .from("profiles")
    .select("user_id, legal_name, email")
    .in("user_id", clean);
  return new Map(((data ?? []) as any[]).map((p) => [p.user_id as string, p]));
}

/** Everything waiting on the operations team, newest first. */
export const getOpsQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const who = await requireOperations(context);
    const { supabase } = context;

    const [banks, entities, taxDocs] = await Promise.all([
      supabase
        .from("offering_bank_setup_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.rpc("list_entity_reviews"),
      supabase
        .from("fund_tax_documents")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const bankRows = (banks.data ?? []) as any[];
    const entityRows = (entities.data ?? []) as any[];
    const taxRows = (taxDocs.data ?? []) as any[];

    const funds = await fundMap(supabase, [
      ...bankRows.map((r) => r.offering_id as string),
      ...entityRows.map((r) => r.offering_id as string),
      ...taxRows.map((r) => r.offering_id as string),
    ]);
    const people = await peopleMap(supabase, [
      ...bankRows.map((r) => r.requested_by as string | null),
      ...bankRows.map((r) => r.reviewed_by as string | null),
      ...taxRows.map((r) => r.investor_user_id as string | null),
      ...taxRows.map((r) => r.uploaded_by as string | null),
      ...taxRows.map((r) => r.reviewed_by as string | null),
    ]);

    const named = (id: string | null) => {
      if (!id) return null;
      const p = people.get(id);
      return (p?.legal_name as string) || (p?.email as string) || null;
    };
    const fundName = (id: string) => (funds.get(id)?.name as string) ?? "Unknown fund";

    return {
      who: { isAdmin: who.isAdmin, isOperations: who.isOperations, name: who.name },
      bankRequests: bankRows.map((r) => ({
        id: r.id as string,
        offeringId: r.offering_id as string,
        fundName: fundName(r.offering_id),
        legalEntityName: (funds.get(r.offering_id)?.legal_entity_name as string) ?? null,
        bank: r.bank as string,
        status: r.status as string,
        reviewStatus: (r.review_status ?? "pending") as string,
        note: (r.note ?? null) as string | null,
        reviewNote: (r.review_note ?? null) as string | null,
        requestedBy: named(r.requested_by) ?? (r.requested_by_email ?? null),
        requestedAt: r.created_at as string,
        reviewedBy: named(r.reviewed_by),
        reviewedAt: (r.reviewed_at ?? null) as string | null,
      })),
      entities: entityRows.map((r) => ({
        offeringId: r.offering_id as string,
        fundName: fundName(r.offering_id),
        legalEntityName: (funds.get(r.offering_id)?.legal_entity_name as string) ?? null,
        entityType: (funds.get(r.offering_id)?.entity_type as string) ?? null,
        stateFormed: (funds.get(r.offering_id)?.state_formed as string) ?? null,
        hasEin: Boolean(r.has_ein),
        ein: (r.ein_masked ?? null) as string | null,
        hasSs4File: Boolean(r.has_ss4_file),
        ss4GeneratedAt: (r.ss4_generated_at ?? null) as string | null,
        einStatus: (r.ein_review_status ?? "pending") as string,
        ss4Status: (r.ss4_review_status ?? "pending") as string,
        reviewNote: (r.review_note ?? null) as string | null,
        reviewedAt: (r.reviewed_at ?? null) as string | null,
        updatedAt: (r.updated_at ?? null) as string | null,
      })),
      taxDocuments: taxRows.map((r) => ({
        id: r.id as string,
        offeringId: r.offering_id as string,
        fundName: fundName(r.offering_id),
        docType: r.doc_type as string,
        taxYear: (r.tax_year ?? null) as number | null,
        fileName: r.file_name as string,
        note: (r.note ?? null) as string | null,
        investorName: named(r.investor_user_id),
        uploadedBy: named(r.uploaded_by),
        uploadedAt: r.created_at as string,
        reviewStatus: (r.review_status ?? "pending") as string,
        reviewNote: (r.review_note ?? null) as string | null,
        reviewedBy: named(r.reviewed_by),
        reviewedAt: (r.reviewed_at ?? null) as string | null,
      })),
    };
  });

/** Funds and their investors, for the upload form. */
export const getOpsFundOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireOperations(context);
    const { data: funds } = await context.supabase
      .from("offerings")
      .select("id, name")
      .order("name");
    const { data: access } = await context.supabase
      .from("investor_fund_access")
      .select("user_id, offering_id");
    const people = await peopleMap(
      context.supabase,
      ((access ?? []) as any[]).map((a) => a.user_id as string),
    );
    return {
      funds: ((funds ?? []) as any[]).map((f) => ({ id: f.id as string, name: f.name as string })),
      investors: ((access ?? []) as any[]).map((a) => ({
        userId: a.user_id as string,
        offeringId: a.offering_id as string,
        name:
          (people.get(a.user_id)?.legal_name as string) ||
          (people.get(a.user_id)?.email as string) ||
          "Investor",
      })),
    };
  });

async function notifyDecision(opts: {
  supabase: any;
  toUserId: string | null;
  toEmail?: string | null;
  itemLabel: string;
  fundName: string;
  decision: string;
  note: string;
  reviewer: string;
  linkPath: string;
  idempotencyKey: string;
}) {
  try {
    let email = opts.toEmail ?? null;
    if (!email && opts.toUserId) {
      const { data } = await opts.supabase
        .from("profiles")
        .select("email")
        .eq("user_id", opts.toUserId)
        .maybeSingle();
      email = ((data as any)?.email as string | null) ?? null;
    }
    if (!email) return;
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    await sendTemplateEmail("ops-review-decision", email, {
      templateData: {
        itemLabel: opts.itemLabel,
        fundName: opts.fundName,
        decision: opts.decision,
        note: opts.note,
        reviewer: opts.reviewer,
        portalUrl: `${SITE}${opts.linkPath}`,
      },
      idempotencyKey: opts.idempotencyKey,
    });
  } catch (err) {
    console.error("operations decision email failed", err);
  }
}

async function notifyOperations(opts: {
  itemLabel: string;
  fundName: string;
  detail: string;
  raisedBy: string;
  linkPath: string;
  idempotencyKey: string;
}) {
  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    await sendTemplateEmail("ops-review-request", TEAM_EMAIL, {
      templateData: {
        itemLabel: opts.itemLabel,
        fundName: opts.fundName,
        detail: opts.detail,
        raisedBy: opts.raisedBy,
        portalUrl: `${SITE}${opts.linkPath}`,
      },
      idempotencyKey: opts.idempotencyKey,
    });
  } catch (err) {
    console.error("operations request email failed", err);
  }
}

export const reviewBankRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reviewStatus: z.enum(REVIEW_STATUSES),
        status: z.enum(["requested", "in_progress", "opened", "cancelled"]).optional(),
        note: z.string().trim().max(1000).default(""),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const who = await requireOperations(context);

    const { data: row, error: readError } = await context.supabase
      .from("offering_bank_setup_requests")
      .select("id, offering_id, bank, requested_by, requested_by_email")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!row) throw new Error("That request no longer exists.");

    const patch: Record<string, unknown> = {
      review_status: data.reviewStatus,
      reviewed_by: who.userId,
      reviewed_at: new Date().toISOString(),
      review_note: data.note || null,
    };
    if (data.status) patch["status"] = data.status;

    const { error } = await context.supabase
      .from("offering_bank_setup_requests")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const { data: offering } = await context.supabase
      .from("offerings")
      .select("name")
      .eq("id", (row as any).offering_id)
      .maybeSingle();

    if (data.reviewStatus !== "pending") {
      await notifyDecision({
        supabase: context.supabase,
        toUserId: (row as any).requested_by ?? null,
        toEmail: (row as any).requested_by_email ?? null,
        itemLabel: "Bank account request",
        fundName: ((offering as any)?.name as string) ?? "your fund",
        decision: data.reviewStatus,
        note: data.note ?? "",
        reviewer: who.name,
        linkPath: `/admin/fund/${(row as any).offering_id}`,
        idempotencyKey: `ops-bank-${data.id}-${data.reviewStatus}-${Date.now()}`,
      });
    }
    return { ok: true };
  });

export const reviewEntityDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offeringId: z.string().uuid(),
        einStatus: z.enum(REVIEW_STATUSES),
        ss4Status: z.enum(REVIEW_STATUSES),
        note: z.string().trim().max(1000).default(""),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const who = await requireOperations(context);
    const { error } = await context.supabase.rpc("review_offering_entity", {
      p_offering_id: data.offeringId,
      p_ein_status: data.einStatus,
      p_ss4_status: data.ss4Status,
      p_note: data.note || "",
    });
    if (error) throw new Error(error.message);

    const { data: managers } = await context.supabase
      .from("fund_managers")
      .select("user_id")
      .eq("offering_id", data.offeringId);
    const { data: offering } = await context.supabase
      .from("offerings")
      .select("name")
      .eq("id", data.offeringId)
      .maybeSingle();

    for (const m of (managers ?? []) as any[]) {
      await notifyDecision({
        supabase: context.supabase,
        toUserId: m.user_id as string,
        itemLabel: "EIN and Form SS-4",
        fundName: ((offering as any)?.name as string) ?? "your fund",
        decision: data.einStatus === data.ss4Status ? data.einStatus : "updated",
        note: data.note ?? "",
        reviewer: who.name,
        linkPath: `/admin/fund/${data.offeringId}`,
        idempotencyKey: `ops-entity-${data.offeringId}-${m.user_id}-${Date.now()}`,
      });
    }
    return { ok: true };
  });

export const uploadTaxDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offeringId: z.string().uuid(),
        investorUserId: z.string().uuid().nullable().default(null),
        docType: z.enum(["w9", "w8ben", "w8bene", "k1", "other"]),
        taxYear: z.number().int().min(2000).max(2100).nullable().default(null),
        note: z.string().trim().max(1000).default(""),
        fileName: z.string().trim().min(1).max(200),
        contentBase64: z.string().min(1).max(28_000_000),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const who = await requireOperations(context);

    const binary = Buffer.from(data.contentBase64, "base64");
    const safeName = data.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `tax/${data.offeringId}/${Date.now()}-${safeName}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: uploadError } = await supabaseAdmin.storage
      .from("fund-formation")
      .upload(path, new Uint8Array(binary), { contentType: "application/pdf", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { data: inserted, error } = await context.supabase
      .from("fund_tax_documents")
      .insert({
        offering_id: data.offeringId,
        investor_user_id: data.investorUserId,
        doc_type: data.docType,
        tax_year: data.taxYear,
        storage_path: path,
        file_name: data.fileName,
        note: data.note || null,
        uploaded_by: who.userId,
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { data: offering } = await context.supabase
      .from("offerings")
      .select("name")
      .eq("id", data.offeringId)
      .maybeSingle();

    await notifyOperations({
      itemLabel: TAX_DOC_TYPES.find((t) => t.value === data.docType)?.label ?? "Tax document",
      fundName: ((offering as any)?.name as string) ?? "A fund",
      detail: data.fileName,
      raisedBy: who.name,
      linkPath: "/ops/tax-documents",
      idempotencyKey: `ops-tax-${(inserted as any).id}`,
    });

    return { id: (inserted as any).id as string };
  });

export const reviewTaxDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reviewStatus: z.enum(REVIEW_STATUSES),
        note: z.string().trim().max(1000).default(""),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const who = await requireOperations(context);
    const { error } = await context.supabase
      .from("fund_tax_documents")
      .update({
        review_status: data.reviewStatus,
        reviewed_by: who.userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.note || null,
      } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTaxDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    await requireOperations(context);
    const { data: row } = await context.supabase
      .from("fund_tax_documents")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase.from("fund_tax_documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    const path = (row as any)?.storage_path as string | undefined;
    if (path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("fund-formation").remove([path]);
    }
    return { ok: true };
  });

/** Short-lived private link to a tax document. Operations and admins only. */
export const getTaxDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    await requireOperations(context);
    const { data: row, error } = await context.supabase
      .from("fund_tax_documents")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That document no longer exists.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("fund-formation")
      .createSignedUrl((row as any).storage_path as string, 300);
    if (signError) throw new Error(signError.message);
    return { url: signed?.signedUrl ?? null };
  });

/** Short-lived private link to a fund's generated Form SS-4. */
export const getOpsSs4Url = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offeringId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    await requireOperations(context);
    const { data: detail } = await context.supabase
      .rpc("get_offering_entity_details", { p_offering_id: data.offeringId })
      .maybeSingle();
    const path = (detail as any)?.ss4_storage_path as string | undefined;
    if (!path) throw new Error("No Form SS-4 has been generated for this fund yet.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("fund-formation")
      .createSignedUrl(path, 300);
    if (error) throw new Error(error.message);
    return { url: signed?.signedUrl ?? null };
  });

/** The operations team roster. Admins can add and remove people. */
export const listOperationsTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const who = await requireOperations(context);
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("user_id, created_at")
      .eq("role", "operations");
    const people = await peopleMap(
      context.supabase,
      ((roles ?? []) as any[]).map((r) => r.user_id as string),
    );
    return {
      isAdmin: who.isAdmin,
      members: ((roles ?? []) as any[]).map((r) => ({
        userId: r.user_id as string,
        name: (people.get(r.user_id)?.legal_name as string) ?? null,
        email: (people.get(r.user_id)?.email as string) ?? "(unknown)",
        since: (r.created_at ?? null) as string | null,
      })),
    };
  });

export const inviteOperationsMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        email: z.string().trim().email("Enter a valid email address").max(255),
        name: z.string().trim().max(120).default(""),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const who = await requireOperations(context);
    if (!who.isAdmin) throw new Error("Only an administrator can add operations staff.");

    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let targetUserId: string | null = null;
    const { data: profileRow } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .ilike("email", email)
      .maybeSingle();
    if (profileRow) targetUserId = (profileRow as any).user_id as string;

    if (!targetUserId) {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: data.name ? { legal_name: data.name } : {},
      });
      if (createError || !created?.user) {
        throw new Error(createError?.message ?? "Could not create that account.");
      }
      targetUserId = created.user.id as string;
      await supabaseAdmin
        .from("profiles")
        .insert({ user_id: targetUserId, email, legal_name: data.name || null } as any);
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: targetUserId, role: "operations" as any },
        { onConflict: "user_id,role" },
      );
    if (roleError) throw new Error(roleError.message);

    let link = `${SITE}/auth`;
    try {
      const { data: generated } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${SITE}/reset-password` },
      });
      link = (generated?.properties?.action_link as string) || link;
    } catch {
      /* fall back to the sign-in page */
    }

    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      await sendTemplateEmail("ops-review-request", email, {
        templateData: {
          itemLabel: "Operations portal access",
          fundName: "Harmonious",
          detail: "You now have access to the Harmonious operations portal.",
          raisedBy: who.name,
          portalUrl: link,
        },
        idempotencyKey: `ops-invite-${targetUserId}`,
      });
    } catch (err) {
      console.error("operations invite email failed", err);
    }

    return { userId: targetUserId, link };
  });

export const removeOperationsMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const who = await requireOperations(context);
    if (!who.isAdmin) throw new Error("Only an administrator can remove operations staff.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", "operations" as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
