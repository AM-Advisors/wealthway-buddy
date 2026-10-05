import { createFileRoute } from "@tanstack/react-router";

/**
 * Opens the approved version of a sent proposal/RFP/RFQ as a PDF.
 * Access requires an HMAC-signed token from the email; only sent, approved documents are served.
 */
export const Route = createFileRoute("/api/public/proposal/view")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("t") ?? "";
        const notFound = () => new Response("This link is no longer available.", { status: 404, headers: { "Content-Type": "text/plain" } });
        try {
          const { verifyProposalView } = await import("@/lib/email-tracking.server");
          const v = token ? await verifyProposalView(token) : null;
          if (!v) return notFound();
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const db = supabaseAdmin as any;
          const { data: doc } = await db.from("sales_documents").select("id, kind, title, recipient_name, sent_at, approved_version").eq("id", v.documentId).maybeSingle();
          if (!doc?.sent_at) return notFound();
          const { data: ver } = await db.from("sales_document_versions").select("sections").eq("document_id", doc.id).eq("version", v.version).maybeSingle();
          if (!ver) return notFound();
          const { renderPdf } = await import("@/lib/sales-documents-render.server");
          const bytes = await renderPdf(doc, ver.sections ?? [], false);
          const name = String(doc.title).replace(/[^\w -]/g, "").trim() || "document";
          return new Response(bytes, { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "private, no-store" } });
        } catch (e) {
          console.error("proposal view failed", e);
          return notFound();
        }
      },
    },
  },
});
