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

        let wireInstructions: Record<string, string> = {};
        if (link.include_wire) {
          const { data: wire } = await supabaseAdmin.rpc("get_wire_instructions_for_packet", {
            p_offering_id: offering.id,
          });
          wireInstructions = ((wire as any) ?? {}) as Record<string, string>;
        }

        // Same subscription packet as the fund Documents tab; wire details only when this link allows them.
        const { buildSubscriptionPacket } = await import("@/lib/subscription-packet.server");
        const { bytes } = await buildSubscriptionPacket(supabaseAdmin, { fundId: offering.id, wire: wireInstructions });

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
