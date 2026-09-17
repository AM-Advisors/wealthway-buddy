import { createFileRoute } from "@tanstack/react-router";

/**
 * Plaid webhook receiver.
 *
 * Every delivery must carry a valid `Plaid-Verification` JWT signed by Plaid
 * over the exact raw body. Nothing is parsed, stored or acted on until that
 * signature, its freshness and its body hash all check out.
 *
 * Deliveries are recorded once (unique on the body hash), so a replay is a
 * no-op rather than a double-sync, and the processor re-fetches authoritative
 * balances from Plaid instead of trusting anything in the payload.
 */
export const Route = createFileRoute("/api/public/plaid-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Keep the raw body: re-serialising JSON would break the signed hash.
        const rawBody = await request.text();

        const { verifyPlaidWebhook } = await import("@/lib/plaid-webhook-verify.server");
        const verification = await verifyPlaidWebhook(rawBody, request.headers);
        if (!verification.ok) {
          console.error("[plaid-webhook] rejected:", verification.reason);
          return new Response("unauthorized", {
            status: 401,
            headers: { "cache-control": "no-store" },
          });
        }

        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("bad request", { status: 400 });
        }

        const itemId = String(payload?.item_id ?? "");
        const webhookType = String(payload?.webhook_type ?? "");
        const webhookCode = String(payload?.webhook_code ?? "");
        if (!itemId || !webhookType) return new Response("bad request", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency: the unique body hash makes a replayed delivery a no-op.
        const { data: inserted, error: insertError } = await supabaseAdmin
          .from("plaid_webhook_deliveries")
          .insert({
            item_id: itemId,
            webhook_type: webhookType,
            webhook_code: webhookCode,
            body_sha256: verification.bodySha256,
            key_id: verification.keyId,
            payload,
            status: "received",
            attempts: 1,
          })
          .select("id")
          .maybeSingle();

        if (insertError) {
          if (String(insertError.code) === "23505") {
            return Response.json({ ok: true, duplicate: true });
          }
          console.error("[plaid-webhook] could not record delivery", insertError.message);
          return new Response("error", { status: 500 });
        }

        const deliveryId = (inserted as any)?.id as string | undefined;

        try {
          const { processPlaidWebhook } = await import("@/lib/plaid-webhook-process.server");
          const result = await processPlaidWebhook({ itemId, webhookType, webhookCode });

          if (deliveryId) {
            await supabaseAdmin
              .from("plaid_webhook_deliveries")
              .update({
                status: result.status,
                detail: result.detail,
                offering_id: result.offeringId ?? null,
                processed_at: new Date().toISOString(),
              })
              .eq("id", deliveryId);
          }
          return Response.json({ ok: true, status: result.status });
        } catch (error) {
          console.error("[plaid-webhook] processing failed", error);
          if (deliveryId) {
            await supabaseAdmin
              .from("plaid_webhook_deliveries")
              .update({
                status: "error",
                detail: error instanceof Error ? error.message.slice(0, 300) : "unknown error",
              })
              .eq("id", deliveryId);
          }
          // Plaid retries on a non-2xx, and the dead-letter row stays queryable.
          return new Response("processing failed", { status: 500 });
        }
      },
    },
  },
});
