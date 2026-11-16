import { createFileRoute } from "@tanstack/react-router";
import { linkUsable } from "@/lib/texas-capital-packet-model";

// Secure download for the Texas Capital package. The token is the only credential;
// only its hash is stored. Returns no personal data in the response itself.
export const Route = createFileRoute("/api/public/bank-packet/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const token = String(params.token ?? "");
        const gone = () => new Response("This link has expired or was turned off. Please reply to the email for a new one.", { status: 410, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
        if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return gone();
        const s = await import("@/lib/texas-capital-packet.server");
        const db = await s.adminDb();
        const { data: p } = await db.from("texas_capital_packets").select("id, status, storage_path, link_expires_at, link_revoked_at, first_opened_at").eq("token_hash", await s.sha256Hex(token)).maybeSingle();
        if (!p || !p.storage_path || !linkUsable({ expiresAt: p.link_expires_at, revokedAt: p.link_revoked_at, status: p.status }, new Date())) return gone();
        const { data: signed } = await db.storage.from(s.PACKET_BUCKET).createSignedUrl(p.storage_path, 120, { download: "Account-Opening-Package.pdf" });
        if (!signed?.signedUrl) return gone();
        const now = new Date().toISOString();
        if (!p.first_opened_at) await db.from("texas_capital_packets").update({ first_opened_at: now, ...(p.status === "sent" ? { status: "opened" } : {}) }).eq("id", p.id);
        await s.logPacket(db, p.id, "opened", null, { agent: (request.headers.get("user-agent") ?? "").slice(0, 80) });
        return new Response(null, { status: 302, headers: { Location: signed.signedUrl, "Cache-Control": "no-store" } });
      },
    },
  },
});
