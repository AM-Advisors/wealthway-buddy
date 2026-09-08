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

        try {
          const { syncBoxSignRequest } = await import("@/lib/box-sign-complete.server");
          const result = await syncBoxSignRequest(signRequestId, {
            ...(body?.created_at
              ? { completedAt: new Date(body.created_at).toISOString() }
              : {}),
          });
          console.log("[box-sign] webhook", trigger, signRequestId, result.status);
        } catch (e) {
          console.error("[box-sign] webhook processing failed", e);
        }

        return new Response("ok");
      },
    },
  },
});
