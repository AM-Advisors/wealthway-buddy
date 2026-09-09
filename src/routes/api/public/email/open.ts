import { createFileRoute } from "@tanstack/react-router";

/** Transparent 1x1 GIF. */
const PIXEL = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
);

function pixelResponse() {
  return new Response(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Content-Length": String(PIXEL.byteLength),
    },
  });
}

/**
 * Records that an onboarding email was opened, then returns a tracking pixel.
 * The token is HMAC-signed so opens cannot be forged for arbitrary recipients.
 */
export const Route = createFileRoute("/api/public/email/open")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("t") ?? "";
        if (!token) return pixelResponse();

        try {
          const { decodeOpenPixel } = await import("@/lib/email-tracking.server");
          const pixel = await decodeOpenPixel(token);
          if (!pixel) return pixelResponse();

          const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 300);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("email_opens").insert({
            recipient: pixel.recipient,
            template: pixel.template,
            investor_email_id: pixel.emailId,
            application_id: pixel.applicationId,
            user_agent: userAgent,
          });
        } catch (error) {
          console.error("Email open tracking failed", error);
        }

        return pixelResponse();
      },
    },
  },
});
