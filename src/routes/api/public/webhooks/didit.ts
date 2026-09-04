import { createFileRoute } from "@tanstack/react-router";
import {
  amlStatusFromDecision,
  collectDecisionWarnings,
  mapDiditStatus,
  verifyDiditWebhook,
} from "@/lib/didit.server";

const SESSION_EVENTS = new Set(["status.updated", "data.updated"]);
const KNOWN_EVENTS = new Set([
  "status.updated",
  "data.updated",
  "user.status.updated",
  "user.data.updated",
  "business.status.updated",
  "business.data.updated",
  "activity.created",
  "transaction.created",
  "transaction.status.updated",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/webhooks/didit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["DIDIT_WEBHOOK_SECRET"];
        const rawBody = await request.text();

        const verified = verifyDiditWebhook({
          secret: secret ?? "",
          rawBody,
          timestampHeader: request.headers.get("x-timestamp"),
          signatureV2: request.headers.get("x-signature-v2"),
          signature: request.headers.get("x-signature"),
          signatureSimple: request.headers.get("x-signature-simple"),
        });

        if (!verified.ok) {
          console.error("[didit] rejected webhook", verified.reason, rawBody.slice(0, 1000));
          const status = verified.reason === "missing_secret" ? 500 : 401;
          return new Response(JSON.stringify({ error: verified.reason }), {
            status,
            headers: { "content-type": "application/json" },
          });
        }

        const body = verified.body;
        const webhookType = String(body["webhook_type"] ?? "");
        const eventId = String(
          body["event_id"] ??
            `${body["session_id"] ?? "unknown"}:${body["status"] ?? ""}:${webhookType}:${body["timestamp"] ?? ""}`,
        );
        const sessionId = body["session_id"] ? String(body["session_id"]) : null;
        const status = body["status"] ? String(body["status"]) : null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency: first writer wins, duplicates short-circuit with 200.
        const { error: insertError } = await supabaseAdmin.from("didit_webhook_events").insert({
          event_id: eventId,
          webhook_type: webhookType,
          session_id: sessionId,
          status,
          payload: body,
        });
        if (insertError) {
          if (insertError.code === "23505") {
            return Response.json({ ok: true, duplicate: true });
          }
          console.error("[didit] failed to record event", insertError.message);
          return new Response("storage error", { status: 500 });
        }

        let applicationId: string | null = null;
        let processingError: string | null = null;

        try {
          applicationId = await resolveApplicationId(supabaseAdmin, body, sessionId);

          if (applicationId && SESSION_EVENTS.has(webhookType)) {
            await applySessionEvent(supabaseAdmin, applicationId, body, sessionId, status);
          } else if (!KNOWN_EVENTS.has(webhookType)) {
            processingError = `unhandled webhook_type: ${webhookType}`;
          } else if (!applicationId) {
            processingError = "no matching application";
          }
        } catch (e) {
          processingError = e instanceof Error ? e.message : String(e);
          console.error("[didit] processing failed", processingError);
        }

        await supabaseAdmin
          .from("didit_webhook_events")
          .update({
            application_id: applicationId,
            processed_at: new Date().toISOString(),
            error: processingError,
          })
          .eq("event_id", eventId);

        return Response.json({ ok: true });
      },
    },
  },
});

async function resolveApplicationId(
  admin: any,
  body: Record<string, any>,
  sessionId: string | null,
): Promise<string | null> {
  const vendorData = body["vendor_data"] ? String(body["vendor_data"]) : null;
  if (vendorData && UUID_RE.test(vendorData)) {
    const { data } = await admin
      .from("investor_applications")
      .select("id")
      .eq("id", vendorData)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }

  const candidates = [sessionId, body["business_session_id"], body["inquiry_id"]]
    .filter(Boolean)
    .map(String);
  for (const candidate of candidates) {
    const { data } = await admin
      .from("kyc_verifications")
      .select("application_id")
      .or(`session_id.eq.${candidate},inquiry_id.eq.${candidate}`)
      .maybeSingle();
    if (data?.application_id) return data.application_id as string;
  }
  return null;
}

async function applySessionEvent(
  admin: any,
  applicationId: string,
  body: Record<string, any>,
  sessionId: string | null,
  status: string | null,
) {
  const mapping = mapDiditStatus(status ?? undefined);
  if (!mapping) return;

  const decision = body["decision"] ?? {};
  const now = new Date().toISOString();

  const kycRow: Record<string, any> = {
    application_id: applicationId,
    provider: "didit",
    session_id: sessionId,
    vendor_data: body["vendor_data"] ? String(body["vendor_data"]) : null,
    status: mapping.kyc,
    decision,
    result: decision,
    updated_at: now,
    completed_at: mapping.completed ? now : null,
    expired_at: mapping.expired ? now : null,
  };
  if (sessionId) kycRow["inquiry_id"] = sessionId;

  const { data: existing } = await admin
    .from("kyc_verifications")
    .select("id")
    .eq("application_id", applicationId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin.from("kyc_verifications").update(kycRow).eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("kyc_verifications").insert(kycRow);
    if (error) throw new Error(error.message);
  }

  if (mapping.kyc === "declined") {
    const warnings = collectDecisionWarnings(decision);
    if (warnings.length) console.warn("[didit] declined", applicationId, warnings.join("; "));
  }

  const appUpdate: Record<string, any> = { kyc_status: mapping.kyc, updated_at: now };

  const aml = amlStatusFromDecision(decision);
  if (aml) {
    const { data: amlRow } = await admin
      .from("aml_screenings")
      .select("id")
      .eq("application_id", applicationId)
      .maybeSingle();
    const amlPayload = {
      application_id: applicationId,
      provider: "didit",
      report_id: sessionId,
      status: aml.status,
      matches: aml.matches,
      completed_at: aml.status === "approved" || aml.status === "declined" ? now : null,
      updated_at: now,
    };
    if (amlRow?.id) await admin.from("aml_screenings").update(amlPayload).eq("id", amlRow.id);
    else await admin.from("aml_screenings").insert(amlPayload);
    appUpdate["aml_status"] = aml.status;
  }

  const { error: appError } = await admin
    .from("investor_applications")
    .update(appUpdate)
    .eq("id", applicationId);
  if (appError) throw new Error(appError.message);
}
