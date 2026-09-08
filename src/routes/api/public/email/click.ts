import { createFileRoute } from "@tanstack/react-router";

/**
 * Records a click on a link inside an onboarding email, then redirects the
 * recipient to the real destination. The token is HMAC-signed, so the
 * destination cannot be tampered with (no open redirect).
 */
export const Route = createFileRoute("/api/public/email/click")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("t") ?? "";
        const fallback = "https://onboard.harmonious.co/dashboard";
        if (!token) return Response.redirect(fallback, 302);

        try {
          const { decodeTrackedUrl } = await import("@/lib/email-tracking.server");
          const link = await decodeTrackedUrl(token);
          if (!link) return Response.redirect(fallback, 302);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("email_link_clicks").insert({
            recipient: link.recipient,
            template: link.template,
            link_label: link.label,
            target_url: link.url,
            investor_email_id: link.emailId,
            user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300),
          });

          return Response.redirect(link.url, 302);
        } catch (error) {
          console.error("Email click tracking failed", error);
          return Response.redirect(fallback, 302);
        }
      },
    },
  },
});
