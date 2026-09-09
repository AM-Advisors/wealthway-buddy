import { createFileRoute } from "@tanstack/react-router";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Live download link for a fund's offering packet. The PDF is rendered on every
 * request, so shared links always serve the current documents and bank details.
 */
export const Route = createFileRoute("/api/public/packet/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token ?? "").trim();
        if (!/^[a-f0-9]{32,80}$/.test(token)) {
          return new Response("Link not found.", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: link } = await supabaseAdmin
          .from("offering_packet_links")
          .select("id, offering_id, include_wire, expires_at, revoked_at, download_count")
          .eq("token", token)
          .maybeSingle();

        if (!link || link.revoked_at) {
          return new Response("This packet link is no longer active.", { status: 404 });
        }
        if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
          return new Response("This packet link has expired.", { status: 410 });
        }

        const { data: offering } = await supabaseAdmin
          .from("offerings")
          .select("id, name, reg_type, summary, min_investment_cents, target_raise_cents, is_open")
          .eq("id", link.offering_id)
          .maybeSingle();
        if (!offering) return new Response("Fund not found.", { status: 404 });

        const { data: docs } = await supabaseAdmin
          .from("offering_documents")
          .select("title, doc_type, body, requires_signature, sort_order")
          .eq("offering_id", offering.id)
          .order("sort_order", { ascending: true });

        let wireInstructions: Record<string, string> = {};
        if (link.include_wire) {
          const { data: wire } = await supabaseAdmin.rpc("get_wire_instructions_for_packet", {
            p_offering_id: offering.id,
          });
          wireInstructions = ((wire as any) ?? {}) as Record<string, string>;
        }

        const { buildOfferingPacketPdf } = await import("@/lib/offering-pdf.server");
        const bytes = await buildOfferingPacketPdf({
          offeringName: offering.name,
          regType: offering.reg_type,
          summary: offering.summary,
          minInvestmentCents: offering.min_investment_cents,
          targetRaiseCents: offering.target_raise_cents,
          isOpen: Boolean(offering.is_open),
          wireInstructions,
          documents: (docs ?? []).map((d: any) => ({
            title: d.title,
            docType: d.doc_type,
            body: d.body,
            requiresSignature: Boolean(d.requires_signature),
          })),
        });

        await supabaseAdmin
          .from("offering_packet_links")
          .update({
            download_count: Number(link.download_count ?? 0) + 1,
            last_downloaded_at: new Date().toISOString(),
          })
          .eq("id", link.id);

        return new Response(bytes as unknown as BodyInit, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${slugify(offering.name)}-packet.pdf"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
