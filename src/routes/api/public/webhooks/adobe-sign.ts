import { createFileRoute } from "@tanstack/react-router";

// Adobe Acrobat Sign webhook. Adobe verifies ownership by requiring the
// X-AdobeSign-ClientId header to be echoed back on both GET and POST.
function clientIdResponse(request: Request) {
  const clientId = request.headers.get("x-adobesign-clientid");
  const expected = process.env["ADOBE_SIGN_CLIENT_ID"];
  if (!clientId || (expected && clientId !== expected)) {
    return new Response("invalid client id", { status: 401 });
  }
  return new Response(JSON.stringify({ xAdobeSignClientId: clientId }), {
    status: 200,
    headers: { "content-type": "application/json", "x-adobesign-clientid": clientId },
  });
}

export const Route = createFileRoute("/api/public/webhooks/adobe-sign")({
  server: {
    handlers: {
      // Adobe's verification handshake when the webhook is registered.
      GET: async ({ request }) => clientIdResponse(request),

      POST: async ({ request }) => {
        const ack = clientIdResponse(request);
        if (ack.status !== 200) return ack;

        const raw = await request.text();
        let body: any;
        try {
          body = JSON.parse(raw);
        } catch {
          return ack;
        }

        const agreementId: string | undefined = body?.agreement?.id;
        const status: string | undefined = body?.agreement?.status;
        const event: string = String(body?.event ?? "");

        if (!agreementId) {
          console.error("[adobe-sign] webhook without agreement id", raw.slice(0, 500));
          return ack;
        }

        try {
          const { syncAdobeAgreement } = await import("@/lib/adobe-sign-complete.server");
          const result = await syncAdobeAgreement(agreementId, {
            status: status ?? undefined,
            completedAt: body?.event_date ? new Date(body.event_date).toISOString() : undefined,
          });
          console.log("[adobe-sign] webhook", event, agreementId, result.status);
        } catch (e) {
          console.error("[adobe-sign] webhook processing failed", e);
        }

        // Always acknowledge; Adobe disables webhooks that return errors.
        return ack;
      },
    },
  },
});
