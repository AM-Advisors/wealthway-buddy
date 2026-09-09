import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** One line per fund the investor has a subscription in. */
export interface PortalCommitment {
  application_id: string;
  offering_id: string;
  offering_name: string;
  reg_type: string | null;
  status: string;
  current_step: string | null;
  commitment_cents: number | null;
  funding_status: string | null;
  funded_cents: number;
  created_at: string;
}

/** A file the investor sent in, and where it stands with the team. */
export interface PortalUpload {
  id: string;
  file_name: string;
  doc_kind: string;
  note: string | null;
  uploaded_at: string;
  review_status: string;
  review_note: string | null;
  reviewed_at: string | null;
  filed_at: string | null;
}

export interface PortalDocument {
  signature_id: string;
  offering_document_id: string;
  provider: string;
  provider_status: string | null;
  provider_completed_at: string | null;
  provider_signing_url: string | null;
  title: string;
  signer_name: string;
  signed_at: string | null;
  document_hash: string | null;
  downloadable: boolean;
}

export interface PortalQuestion {
  assignment_id: string;
  prompt: string;
  category: string | null;
  is_required: boolean;
  sort_order: number;
  status: string;
  due_date: string | null;
  answered_at: string | null;
}

export interface PortalWireConfirmation {
  id: string;
  amount_cents: number | null;
  sent_on: string | null;
  sending_bank_name: string | null;
  sending_account_last4: string | null;
  bank_reference: string | null;
  status: string;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/** Everything an investor needs to see about their own application in one read. */
export const getPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ applicationId: z.string().uuid().nullable().optional() })
      .optional()
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("legal_name, email")
      .eq("user_id", userId)
      .maybeSingle();

    // Every fund this investor has a subscription in, newest last.
    const { data: allApplications } = await supabase
      .from("investor_applications")
      .select(
        "id, offering_id, status, current_step, kyc_status, aml_status, accreditation_status, documents_status, funding_status, manager_review_status, manager_reviewed_at, manager_review_notes, commitment_cents, created_at, updated_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    const applicationRows = (allApplications ?? []) as any[];
    const requested = data?.applicationId
      ? applicationRows.find((a) => a.id === data.applicationId)
      : null;
    const application = (requested ?? applicationRows[0] ?? null) as any;

    // Fund names and money already received, across every fund they are in.
    const offeringIds = Array.from(new Set(applicationRows.map((a) => a.offering_id)));
    const applicationIds = applicationRows.map((a) => a.id as string);
    const [{ data: allOfferings }, { data: allSubs }, { data: allPayments }] = await Promise.all([
      offeringIds.length
        ? supabase.from("offerings").select("id, name, reg_type").in("id", offeringIds)
        : Promise.resolve({ data: [] as any[] } as any),
      applicationIds.length
        ? supabase
            .from("subscriptions")
            .select("application_id, commitment_cents")
            .in("application_id", applicationIds)
        : Promise.resolve({ data: [] as any[] } as any),
      applicationIds.length
        ? supabase
            .from("payments")
            .select("application_id, amount_cents, status")
            .in("application_id", applicationIds)
        : Promise.resolve({ data: [] as any[] } as any),
    ]);

    const offeringById = new Map(((allOfferings ?? []) as any[]).map((o) => [o.id, o]));
    const subByApp = new Map(((allSubs ?? []) as any[]).map((s) => [s.application_id, s]));
    const receivedByApp = new Map<string, number>();
    for (const p of (allPayments ?? []) as any[]) {
      if (p.status !== "settled") continue;
      receivedByApp.set(
        p.application_id,
        (receivedByApp.get(p.application_id) ?? 0) + (p.amount_cents ?? 0),
      );
    }

    const commitments: PortalCommitment[] = applicationRows.map((a) => {
      const offering = offeringById.get(a.offering_id);
      return {
        application_id: a.id,
        offering_id: a.offering_id,
        offering_name: (offering?.name as string) ?? "Your fund",
        reg_type: (offering?.reg_type as string) ?? null,
        status: a.status,
        current_step: a.current_step ?? null,
        commitment_cents:
          subByApp.get(a.id)?.commitment_cents ?? (a.commitment_cents as number | null) ?? null,
        funding_status: a.funding_status ?? null,
        funded_cents: receivedByApp.get(a.id) ?? 0,
        created_at: a.created_at,
      };
    });

    if (!application) {
      return {
        profile,
        application: null,
        offering: null,
        documents: [],
        offeringDocuments: [],
        subscription: null,
        payment: null,
        kyc: null,
        questions: [] as PortalQuestion[],
        wireConfirmations: [] as PortalWireConfirmation[],
        wireInstructions: {} as Record<string, string>,
        commitments,
        uploads: [] as PortalUpload[],
      };
    }

    const [
      { data: offering },
      { data: offeringDocs },
      { data: signatures },
      { data: subscription },
      { data: payment },
      { data: kyc },
      { data: wire },
      { data: wireConfirmations },
      { data: assignments },
    ] = await Promise.all([
        supabase
          .from("offerings")
          .select("name, reg_type")
          .eq("id", application.offering_id)
          .maybeSingle(),
        supabase
          .from("offering_documents")
          .select("id, title, doc_type, requires_signature, sort_order")
          .eq("offering_id", application.offering_id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("document_signatures")
          .select("id, offering_document_id, signer_name, signed_at, document_hash, pdf_path, provider, provider_status, provider_completed_at, provider_signing_url")
          .eq("application_id", application.id),
        supabase
          .from("subscriptions")
          .select("commitment_cents, ownership_title, status")
          .eq("application_id", application.id)
          .maybeSingle(),
        supabase
          .from("payments")
          .select("method, status, reference_code, amount_cents, confirmed_at")
          .eq("application_id", application.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("kyc_verifications")
          .select("provider, status, session_url, completed_at, updated_at")
          .eq("application_id", application.id)
          .maybeSingle(),
        supabase
          .rpc("get_wire_instructions", { p_offering_id: application.offering_id })
          .maybeSingle(),
        supabase
          .from("wire_confirmations")
          .select(
            "id, amount_cents, sent_on, sending_bank_name, sending_account_last4, bank_reference, status, review_notes, reviewed_at, created_at",
          )
          .eq("application_id", application.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("diligence_question_assignments")
          .select("id, question_id, status, due_date, answered_at, created_at")
          .eq("offering_id", application.offering_id)
          .eq("investor_user_id", userId)
          .order("created_at", { ascending: true }),
      ]);

    // Files the investor sent in for this fund, and where they stand.
    const { data: uploadRows } = await supabase
      .from("investor_documents")
      .select(
        "id, file_name, doc_kind, note, uploaded_at, review_status, review_note, reviewed_at, box_uploaded_at",
      )
      .eq("user_id", userId)
      .eq("application_id", application.id)
      .order("uploaded_at", { ascending: false });

    const uploads: PortalUpload[] = ((uploadRows ?? []) as any[]).map((u) => ({
      id: u.id,
      file_name: u.file_name,
      doc_kind: u.doc_kind,
      note: u.note ?? null,
      uploaded_at: u.uploaded_at,
      review_status: u.review_status ?? "new",
      review_note: u.review_note ?? null,
      reviewed_at: u.reviewed_at ?? null,
      filed_at: u.box_uploaded_at ?? null,
    }));

    // Assigned due diligence questions, with the prompt text and whether the
    // investor still owes an answer.
    const assignmentRows = (assignments ?? []) as any[];
    let questions: PortalQuestion[] = [];
    if (assignmentRows.length > 0) {
      const { data: prompts } = await supabase
        .from("diligence_request_questions")
        .select("id, prompt, category, is_required, sort_order")
        .in(
          "id",
          assignmentRows.map((a) => a.question_id),
        );
      const byId = new Map(((prompts ?? []) as any[]).map((p) => [p.id, p]));
      questions = assignmentRows
        .map((a) => {
          const prompt = byId.get(a.question_id);
          return {
            assignment_id: a.id as string,
            prompt: (prompt?.prompt as string) ?? "Question",
            category: (prompt?.category as string) ?? null,
            is_required: Boolean(prompt?.is_required),
            sort_order: (prompt?.sort_order as number) ?? 0,
            status: a.status as string,
            due_date: a.due_date as string | null,
            answered_at: a.answered_at as string | null,
          };
        })
        .sort((a, b) => a.sort_order - b.sort_order);
    }


    const titleById = new Map((offeringDocs ?? []).map((d) => [d.id, d.title]));

    const documents: PortalDocument[] = (signatures ?? []).map((sig) => ({
      signature_id: sig.id,
      offering_document_id: sig.offering_document_id,
      title: titleById.get(sig.offering_document_id) ?? "Fund document",
      signer_name: sig.signer_name,
      signed_at: sig.signed_at,
      document_hash: sig.document_hash,
      provider: sig.provider ?? "internal",
      provider_status: sig.provider_status ?? null,
      provider_completed_at: sig.provider_completed_at ?? null,
      provider_signing_url: sig.provider_signing_url ?? null,
      downloadable: Boolean(sig.pdf_path),
    }));

    documents.sort((a, b) => a.title.localeCompare(b.title));

    return {
      profile,
      application,
      offering,
      documents,
      offeringDocuments: offeringDocs ?? [],
      subscription,
      payment,
      kyc,
      questions,
      wireConfirmations: (wireConfirmations ?? []) as PortalWireConfirmation[],
      wireInstructions: Object.fromEntries(
        Object.entries(((wire as any)?.details ?? {}) as Record<string, unknown>)
          .filter(([, v]) => String(v ?? "").trim() !== "")
          .map(([k, v]) => [k, String(v)]),
      ) as Record<string, string>,
      commitments,
      uploads,
    };
  });

export type InvestorDocumentStatus =
  | "not_started"
  | "awaiting_signature"
  | "in_progress"
  | "completed"
  | "reference";

export interface InvestorDocumentRow {
  document_id: string;
  title: string;
  doc_type: string;
  requires_signature: boolean;
  status: InvestorDocumentStatus;
  signature_id: string | null;
  signer_name: string | null;
  completed_at: string | null;
  last_activity_at: string | null;
  provider: string | null;
  provider_status: string | null;
  downloadable: boolean;
}

/**
 * Required documents for the fund on the signed-in investor's application,
 * split by what still needs signing versus what is already complete.
 */
export const getInvestorDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: application } = await supabase
      .from("investor_applications")
      .select("id, offering_id, status, documents_status, funding_status")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!application) {
      return { application: null, offering: null, documents: [] as InvestorDocumentRow[] };
    }

    const [{ data: offering }, { data: offeringDocs }, { data: signatures }] = await Promise.all([
      supabase
        .from("offerings")
        .select("name, reg_type")
        .eq("id", application.offering_id)
        .maybeSingle(),
      supabase
        .from("offering_documents")
        .select("id, title, doc_type, requires_signature, sort_order")
        .eq("offering_id", application.offering_id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("document_signatures")
        .select(
          "id, offering_document_id, signer_name, signed_at, pdf_path, provider, provider_status, provider_completed_at, provider_last_event_at",
        )
        .eq("application_id", application.id),
    ]);

    const sigByDoc = new Map((signatures ?? []).map((s) => [s.offering_document_id, s]));

    const documents: InvestorDocumentRow[] = (offeringDocs ?? []).map((doc) => {
      const sig = sigByDoc.get(doc.id);
      const external = sig ? (sig.provider ?? "internal") !== "internal" : false;
      const completed = sig
        ? !external || sig.provider_status === "completed"
        : false;

      let status: InvestorDocumentStatus;
      if (completed) status = "completed";
      else if (sig) status = external ? "in_progress" : "awaiting_signature";
      else if (doc.requires_signature) status = "not_started";
      else status = "reference";

      return {
        document_id: doc.id,
        title: doc.title,
        doc_type: doc.doc_type,
        requires_signature: doc.requires_signature,
        status,
        signature_id: sig?.id ?? null,
        signer_name: sig?.signer_name ?? null,
        completed_at: completed ? (sig?.provider_completed_at ?? sig?.signed_at ?? null) : null,
        last_activity_at:
          sig?.provider_last_event_at ?? sig?.provider_completed_at ?? sig?.signed_at ?? null,
        provider: sig?.provider ?? null,
        provider_status: sig?.provider_status ?? null,
        downloadable: Boolean(sig?.pdf_path) && completed,
      };
    });

    return { application, offering, documents };
  });
