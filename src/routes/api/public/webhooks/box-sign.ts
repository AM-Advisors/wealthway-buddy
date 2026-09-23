import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

// Box Sign webhook. Box signs each delivery with HMAC-SHA256 over
// body + timestamp using the webhook's primary/secondary signature keys.
function verify(raw: string, headers: Headers): boolean {
  const primary = process.env["BOX_WEBHOOK_PRIMARY_KEY"];
  const secondary = process.env["BOX_WEBHOOK_SECONDARY_KEY"];
  const timestamp = headers.get("box-delivery-timestamp") ?? "";
  const keys = [primary, secondary].filter(Boolean) as string[];
  if (keys.length === 0) return false;

  const provided = [
    headers.get("box-signature-primary"),
    headers.get("box-signature-secondary"),
  ].filter(Boolean) as string[];
  if (provided.length === 0) return false;

  return keys.some((key) => {
    const expected = createHmac("sha256", key).update(raw).update(timestamp).digest("base64");
    return provided.some((sig) => {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    });
  });
}

export const Route = createFileRoute("/api/public/webhooks/box-sign")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),

      POST: async ({ request }) => {
        const raw = await request.text();
        if (!verify(raw, request.headers)) {
          console.error("[box-sign] webhook signature rejected");
          return new Response("invalid signature", { status: 401 });
        }

        let body: any;
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("ok");
        }

        const trigger = String(body?.trigger ?? "");
        const signRequestId: string | undefined =
          body?.source?.id ?? body?.additional_info?.sign_request?.id;
        if (!signRequestId) {
          console.error("[box-sign] webhook without sign request id", trigger);
          return new Response("ok");
        }

        // Idempotency and replay protection: Box gives every delivery its own
        // id. The unique index makes a repeat delivery a no-op, so a duplicate
        // or replayed event can never complete a signature twice.
        const deliveryId =
          request.headers.get("box-delivery-id") ??
          `${trigger}:${signRequestId}:${body?.created_at ?? ""}`;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error: dedupeError } = await supabaseAdmin
          .from("box_sign_webhook_events")
          .insert({
            provider_event_id: deliveryId,
            trigger,
            sign_request_id: signRequestId,
            delivered_at: body?.created_at ? new Date(body.created_at).toISOString() : null,
          });
        if (dedupeError) {
          console.log("[box-sign] duplicate webhook ignored", trigger, signRequestId);
          return new Response("ok");
        }

        try {
          const opts = {
            ...(body?.created_at
              ? { completedAt: new Date(body.created_at).toISOString() }
              : {}),
          };
          // Per-signer truth comes from Box itself, never from this payload.
          const { syncSignersFromBox } = await import("@/lib/document-signing.server");
          await syncSignersFromBox(supabaseAdmin, signRequestId).catch((e) =>
            console.error("[box-sign] signer sync failed", e),
          );
          const { syncBoxSignRequest } = await import("@/lib/box-sign-complete.server");
          const result = await syncBoxSignRequest(signRequestId, opts);
          if (result.status === "unknown_sign_request") {
            // Not a fund document — it may be a diligence-room NDA.
            const { syncNdaSignRequest } = await import("@/lib/nda-sign-complete.server");
            const nda = await syncNdaSignRequest(signRequestId, opts);
            console.log("[box-sign] webhook nda", trigger, signRequestId, nda.status);
          } else {
            console.log("[box-sign] webhook", trigger, signRequestId, result.status);
          }
        } catch (e) {
          console.error("[box-sign] webhook processing failed", e);
        }

        try {
          const { drainManagerAlerts } = await import("@/lib/manager-alerts.server");
          await drainManagerAlerts();
        } catch (e) {
          console.error("[box-sign] alert drain failed", e);
        }

        return new Response("ok");
      },
    },
  },
});
