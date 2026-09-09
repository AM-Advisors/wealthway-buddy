import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { OFFERING_FILES_BUCKET } from "@/lib/offering-files.functions";

export type TemplateItem = {
  title: string;
  doc_type: string;
  body: string;
  requires_signature: boolean;
  source_path: string;
  file_name: string;
};

export type TemplatePack = {
  id: "ilpa" | "spv";
  name: string;
  summary: string;
  source: string;
  items: TemplateItem[];
};

/**
 * Ready-made legal packs a fund manager can drop into a fund.
 * ILPA files are the association's published model documents; the SPV pack is
 * the firm's own template set. Both are starting points for counsel to tailor.
 */
export const TEMPLATE_PACKS: TemplatePack[] = [
  {
    id: "ilpa",
    name: "ILPA model fund documents",
    summary:
      "The Institutional Limited Partners Association model partnership and subscription documents, used as the market starting point for a pooled fund.",
    source: "https://ilpa.org/",
    items: [
      {
        title: "Limited Partnership Agreement (whole-of-fund waterfall)",
        doc_type: "partnership_agreement",
        body: "This is the ILPA model limited partnership agreement using a whole-of-fund distribution waterfall, published by the Institutional Limited Partners Association (ilpa.org). It sets out how the fund is governed, how profits are shared and what the manager may and may not do. It is a starting point and will be tailored for this fund by counsel before signing.",
        requires_signature: false,
        source_path: "templates/ilpa/ILPA-Model-LPA-Whole-of-Fund-Waterfall.pdf",
        file_name: "ILPA-Model-LPA-Whole-of-Fund-Waterfall.pdf",
      },
      {
        title: "Limited Partnership Agreement (deal-by-deal waterfall)",
        doc_type: "partnership_agreement",
        body: "This is the ILPA model limited partnership agreement using a deal-by-deal distribution waterfall, published by the Institutional Limited Partners Association (ilpa.org). Use this version where carried interest is calculated investment by investment. It is a starting point and will be tailored for this fund by counsel before signing.",
        requires_signature: false,
        source_path: "templates/ilpa/ILPA-Model-LPA-Deal-by-Deal-Waterfall.pdf",
        file_name: "ILPA-Model-LPA-Deal-by-Deal-Waterfall.pdf",
      },
      {
        title: "Model Subscription Agreement",
        doc_type: "subscription_agreement",
        body: "This is the ILPA model subscription agreement (ilpa.org). It is the form an investor completes to commit capital, confirm who they are and make the representations the fund relies on. It will be tailored for this fund before signing.",
        requires_signature: true,
        source_path: "templates/ilpa/ILPA-Model-Subscription-Agreement.pdf",
        file_name: "ILPA-Model-Subscription-Agreement.pdf",
      },
    ],
  },
  {
    id: "spv",
    name: "SPV documents",
    summary:
      "The single-deal vehicle set: private placement memorandum, subscription agreement and the manager entity operating agreement.",
    source: "Harmonious template library",
    items: [
      {
        title: "Private Placement Memorandum",
        doc_type: "ppm",
        body: "The private placement memorandum describes the investment, the terms, the fees and the risks of this vehicle. Read it in full before committing capital.",
        requires_signature: false,
        source_path: "templates/spv/SPV-Private-Placement-Memorandum.docx",
        file_name: "SPV-Private-Placement-Memorandum.docx",
      },
      {
        title: "Subscription Agreement",
        doc_type: "subscription_agreement",
        body: "The subscription agreement is the contract by which you commit capital to this vehicle and confirm your investor status. It must be signed before funds are wired.",
        requires_signature: true,
        source_path: "templates/spv/SPV-Subscription-Agreement.docx",
        file_name: "SPV-Subscription-Agreement.docx",
      },
      {
        title: "Management GP LLC Operating Agreement",
        doc_type: "operating_agreement",
        body: "The operating agreement for the manager entity that controls the vehicle. It sets out how the manager is governed and how decisions about the investment are made.",
        requires_signature: false,
        source_path: "templates/spv/SPV-Management-GP-LLC-Operating-Agreement.docx",
        file_name: "SPV-Management-GP-LLC-Operating-Agreement.docx",
      },
    ],
  },
];

async function isAdminUser(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

async function assertCanEdit(supabase: any, userId: string, offeringId: string) {
  if (await isAdminUser(supabase, userId)) return;
  const { data } = await supabase
    .from("fund_managers")
    .select("id")
    .eq("user_id", userId)
    .eq("offering_id", offeringId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden: you do not manage that fund.");
}

/** List the packs a manager can apply (no file access, just the menu). */
export const listTemplatePacks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () =>
    TEMPLATE_PACKS.map((pack) => ({
      id: pack.id,
      name: pack.name,
      summary: pack.summary,
      source: pack.source,
      items: pack.items.map((i) => ({
        title: i.title,
        doc_type: i.doc_type,
        requires_signature: i.requires_signature,
        file_name: i.file_name,
      })),
    })),
  );

/**
 * Copy a template pack into a fund: each master file is duplicated into the
 * fund's own storage folder and recorded as an offering document investors read.
 */
export const applyTemplatePack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ offering_id: z.string().uuid(), pack: z.enum(["ilpa", "spv"]) })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertCanEdit(context.supabase, context.userId, data.offering_id);

    const pack = TEMPLATE_PACKS.find((p) => p.id === data.pack);
    if (!pack) throw new Error("Unknown template pack.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("offering_documents")
      .select("title, sort_order")
      .eq("offering_id", data.offering_id);

    const existingTitles = new Set(
      ((existing ?? []) as any[]).map((d) => String(d.title).toLowerCase()),
    );
    let nextOrder =
      ((existing ?? []) as any[]).reduce((max, d) => Math.max(max, d.sort_order ?? 0), 0) + 1;

    const added: string[] = [];
    const skipped: string[] = [];

    for (const item of pack.items) {
      if (existingTitles.has(item.title.toLowerCase())) {
        skipped.push(item.title);
        continue;
      }

      const { data: file, error: downloadError } = await supabaseAdmin.storage
        .from(OFFERING_FILES_BUCKET)
        .download(item.source_path);
      if (downloadError || !file) {
        throw new Error(`Could not read the template file for ${item.title}.`);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const filePath = `${data.offering_id}/${crypto.randomUUID()}-${item.file_name}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from(OFFERING_FILES_BUCKET)
        .upload(filePath, bytes, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (uploadError) throw new Error(uploadError.message);

      const { error: insertError } = await supabaseAdmin.from("offering_documents").insert({
        offering_id: data.offering_id,
        title: item.title,
        doc_type: item.doc_type,
        body: item.body,
        requires_signature: item.requires_signature,
        sort_order: nextOrder,
        file_name: item.file_name,
        file_path: filePath,
        file_size_bytes: bytes.byteLength,
      });
      if (insertError) throw new Error(insertError.message);

      nextOrder += 1;
      added.push(item.title);
    }

    return { added, skipped };
  });

/**
 * Everything an investor needs to read before confirming a commitment:
 * the funds they belong to and each fund's legal documents.
 */
export const getFundLegalDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ offering_id: z.string().uuid().nullable().optional() })
      .optional()
      .parse(data ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: applications } = await supabase
      .from("investor_applications")
      .select("id, offering_id, status, documents_status, commitment_cents, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    const rows = (applications ?? []) as any[];
    const offeringIds = Array.from(new Set(rows.map((r) => r.offering_id as string)));
    if (offeringIds.length === 0) {
      return { funds: [], selected: null, documents: [], subscriptionConfirmed: false };
    }

    const { data: offerings } = await supabase
      .from("offerings")
      .select("id, name, reg_type, min_investment_cents")
      .in("id", offeringIds);

    const funds = ((offerings ?? []) as any[]).map((o) => ({
      id: o.id as string,
      name: o.name as string,
      reg_type: (o.reg_type as string) ?? null,
      min_investment_cents: (o.min_investment_cents as number) ?? null,
    }));

    const selectedId =
      (data?.offering_id && funds.find((f) => f.id === data.offering_id)?.id) ??
      funds[0]?.id ??
      null;
    if (!selectedId) {
      return { funds, selected: null, documents: [], subscriptionConfirmed: false };
    }

    const application = rows.find((r) => r.offering_id === selectedId) ?? null;

    const [{ data: documents }, subscription] = await Promise.all([
      supabase
        .from("offering_documents")
        .select(
          "id, title, doc_type, body, requires_signature, sort_order, file_name, file_size_bytes, file_path",
        )
        .eq("offering_id", selectedId)
        .order("sort_order", { ascending: true }),
      application
        ? supabase
            .from("subscriptions")
            .select("id, confirmed_at, commitment_cents")
            .eq("application_id", application.id)
            .maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

    const { data: signatures } = application
      ? await supabase
          .from("document_signatures")
          .select("document_id, signed_at")
          .eq("application_id", application.id)
      : ({ data: [] } as any);

    const signedAtByDoc = new Map(
      ((signatures ?? []) as any[]).map((s) => [s.document_id, s.signed_at as string | null]),
    );

    return {
      funds,
      selected: funds.find((f) => f.id === selectedId) ?? null,
      applicationId: (application?.id as string) ?? null,
      documents: ((documents ?? []) as any[]).map((d) => ({
        id: d.id as string,
        title: d.title as string,
        doc_type: (d.doc_type as string) ?? "document",
        body: (d.body as string) ?? "",
        requires_signature: Boolean(d.requires_signature),
        file_name: (d.file_name as string) ?? null,
        file_size_bytes: (d.file_size_bytes as number) ?? null,
        has_file: Boolean(d.file_path),
        signed_at: signedAtByDoc.get(d.id) ?? null,
      })),
      subscriptionConfirmed: Boolean((subscription as any)?.data?.confirmed_at),
    };
  });
