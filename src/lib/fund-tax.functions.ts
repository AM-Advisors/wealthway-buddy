import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const FUND_TAX_DOC_TYPES = [
  { value: "w9", label: "Form W-9" },
  { value: "w8ben", label: "Form W-8BEN" },
  { value: "w8bene", label: "Form W-8BEN-E" },
  { value: "k1", label: "Schedule K-1" },
  { value: "other", label: "Other tax document" },
] as const;

const BUCKET = "fund-formation";

type Who = { userId: string; isAdmin: boolean; name: string };

/** Admins, and fund managers assigned to the fund. Nobody else. */
async function requireFundAccess(context: any, offeringId: string): Promise<Who> {
  const { data: roleRows, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = ((roleRows ?? []) as any[]).map((r) => r.role as string);
  const isAdmin = roles.includes("admin");

  if (!isAdmin) {
    if (!roles.includes("fund_manager")) {
      throw new Error("Forbidden: the tax profile is for approved fund managers.");
    }
    const { data: assignment } = await context.supabase
      .from("fund_managers")
      .select("id")
      .eq("user_id", context.userId)
      .eq("offering_id", offeringId)
      .maybeSingle();
    if (!assignment) throw new Error("Forbidden: you are not assigned to this fund.");
  }

  const { data: profile } = await context.supabase
    .from("profiles")
    .select("legal_name, email")
    .eq("user_id", context.userId)
    .maybeSingle();
  const name =
    ((profile as any)?.legal_name as string | undefined) ||
    ((profile as any)?.email as string | undefined) ||
    ((context.claims as any)?.email as string | undefined) ||
    "A fund manager";
  return { userId: context.userId, isAdmin, name };
}

/** The funds whose tax profile the signed-in person may open. */
export const listTaxProfileFunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = ((roleRows ?? []) as any[]).map((r) => r.role as string);
    const isAdmin = roles.includes("admin");
    const isManager = roles.includes("fund_manager");
    if (!isAdmin && !isManager) return { isAdmin: false, funds: [] as any[] };

    let query = supabase.from("offerings").select("id, name, legal_entity_name").order("name");
    if (!isAdmin) {
      const { data: assignments } = await supabase
        .from("fund_managers")
        .select("offering_id")
        .eq("user_id", userId);
      const ids = [...new Set(((assignments ?? []) as any[]).map((a) => a.offering_id as string))];
      if (ids.length === 0) return { isAdmin, funds: [] as any[] };
      query = query.in("id", ids);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { isAdmin, funds: (data ?? []) as any[] };
  });

/** Every tax document filed for one fund, newest first. */
export const getFundTaxProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offeringId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const who = await requireFundAccess(context, data.offeringId);

    const [{ data: offering }, { data: rows, error }] = await Promise.all([
      context.supabase
        .from("offerings")
        .select("id, name, legal_entity_name, entity_type, state_formed")
        .eq("id", data.offeringId)
        .maybeSingle(),
      context.supabase
        .from("fund_tax_documents")
        .select(
          "id, doc_type, tax_year, file_name, note, review_status, review_note, reviewed_at, created_at, uploaded_by, investor_user_id",
        )
        .eq("offering_id", data.offeringId)
        .order("created_at", { ascending: false }),
    ]);
    if (error) throw new Error(error.message);

    const docs = ((rows ?? []) as any[]).map((r) => ({
      id: r.id as string,
      docType: r.doc_type as string,
      docLabel: FUND_TAX_DOC_TYPES.find((t) => t.value === r.doc_type)?.label ?? "Tax document",
      taxYear: (r.tax_year ?? null) as number | null,
      fileName: r.file_name as string,
      note: (r.note ?? null) as string | null,
      reviewStatus: (r.review_status ?? "pending") as string,
      reviewNote: (r.review_note ?? null) as string | null,
      reviewedAt: (r.reviewed_at ?? null) as string | null,
      createdAt: r.created_at as string,
      mine: r.uploaded_by === who.userId,
      forInvestor: Boolean(r.investor_user_id),
    }));

    const counts = {
      total: docs.length,
      approved: docs.filter((d) => d.reviewStatus === "approved").length,
      pending: docs.filter((d) => d.reviewStatus === "pending").length,
      rejected: docs.filter((d) => d.reviewStatus === "rejected").length,
    };

    return {
      isAdmin: who.isAdmin,
      fund: {
        id: data.offeringId,
        name: ((offering as any)?.name as string) ?? "Fund",
        legalEntityName: ((offering as any)?.legal_entity_name as string | null) ?? null,
        entityType: ((offering as any)?.entity_type as string | null) ?? null,
        stateFormed: ((offering as any)?.state_formed as string | null) ?? null,
      },
      counts,
      documents: docs,
    };
  });

/** Managers file a W-9, W-8 or K-1 for their fund; operations still reviews it. */
export const uploadFundTaxDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offeringId: z.string().uuid(),
        docType: z.enum(["w9", "w8ben", "w8bene", "k1", "other"]),
        taxYear: z.number().int().min(2000).max(2100).nullable().default(null),
        note: z.string().trim().max(1000).default(""),
        fileName: z.string().trim().min(1).max(200),
        contentBase64: z.string().min(1).max(28_000_000),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const who = await requireFundAccess(context, data.offeringId);

    const binary = Buffer.from(data.contentBase64, "base64");
    const safeName = data.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `tax/${data.offeringId}/${Date.now()}-${safeName}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, new Uint8Array(binary), { contentType: "application/pdf", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { data: inserted, error } = await context.supabase
      .from("fund_tax_documents")
      .insert({
        offering_id: data.offeringId,
        investor_user_id: null,
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

    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      await sendTemplateEmail("ops-review-request", "operations@harmonious.co", {
        templateData: {
          itemLabel:
            FUND_TAX_DOC_TYPES.find((t) => t.value === data.docType)?.label ?? "Tax document",
          fundName: ((offering as any)?.name as string) ?? "A fund",
          detail: data.fileName,
          raisedBy: who.name,
          portalUrl: "https://ops.harmonious.co/ops/tax-documents",
        },
        idempotencyKey: `ops-tax-${(inserted as any).id}`,
      });
    } catch (err) {
      console.error("tax document operations alert failed", err);
    }

    return { id: (inserted as any).id as string };
  });

/** Short-lived private link, for approved managers of that fund only. */
export const getFundTaxUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ offeringId: z.string().uuid(), id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await requireFundAccess(context, data.offeringId);
    const { data: row, error } = await context.supabase
      .from("fund_tax_documents")
      .select("storage_path")
      .eq("id", data.id)
      .eq("offering_id", data.offeringId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That document no longer exists.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl((row as any).storage_path as string, 300);
    if (signError) throw new Error(signError.message);
    return { url: signed?.signedUrl ?? null };
  });

/** A manager can pull back their own upload while it is still waiting on review. */
export const removeFundTaxDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ offeringId: z.string().uuid(), id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await requireFundAccess(context, data.offeringId);
    const { data: row } = await context.supabase
      .from("fund_tax_documents")
      .select("storage_path, review_status")
      .eq("id", data.id)
      .eq("offering_id", data.offeringId)
      .maybeSingle();
    if (!row) throw new Error("That document no longer exists.");

    const { error } = await context.supabase
      .from("fund_tax_documents")
      .delete()
      .eq("id", data.id)
      .eq("offering_id", data.offeringId);
    if (error) throw new Error(error.message);

    const path = (row as any).storage_path as string | undefined;
    if (path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from(BUCKET).remove([path]);
    }
    return { ok: true };
  });
