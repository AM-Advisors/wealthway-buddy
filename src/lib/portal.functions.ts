import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

/** Everything an investor needs to see about their own application in one read. */
export const getPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("legal_name, email")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: application } = await supabase
      .from("investor_applications")
      .select(
        "id, offering_id, status, current_step, kyc_status, aml_status, accreditation_status, documents_status, funding_status, created_at, updated_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

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
      };
    }

    const [
      { data: offering },
      { data: offeringDocs },
      { data: signatures },
      { data: subscription },
      { data: payment },
      { data: kyc },
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
      ]);


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
    };
  });
