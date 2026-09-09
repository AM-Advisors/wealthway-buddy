import { createFileRoute } from "@tanstack/react-router";
import {
  amlStatusFromDecision,
  collectDecisionWarnings,
  collectEmails,
  fetchDiditSessionDecision,
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
          console.error(
            "[didit] rejected webhook",
            verified.reason,
            "debug" in verified ? JSON.stringify(verified.debug) : "",
            rawBody.slice(0, 1000),
          );
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
          const resolved = await resolveApplication(supabaseAdmin, body, sessionId);
          applicationId = resolved.applicationId;

          if (!KNOWN_EVENTS.has(webhookType)) {
            processingError = `unhandled webhook_type: ${webhookType}`;
          } else if (!applicationId) {
            processingError = "no matching application";
          } else if (SESSION_EVENTS.has(webhookType)) {
            await applySessionEvent(
              supabaseAdmin,
              applicationId,
              body,
              resolved.sessionId ?? sessionId,
              status,
              resolved.decision,
            );
          } else {
            // user.*/business.* events carry no session status: re-read the
            // investor's latest session from Didit so the console stays current.
            await resyncFromProvider(supabaseAdmin, applicationId, resolved.sessionId);
          }

          if (applicationId) {
            await backfillRelatedEvents(supabaseAdmin, applicationId, resolved.sessionId, resolved.diditUserId);
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

        try {
          const { drainManagerAlerts } = await import("@/lib/manager-alerts.server");
          await drainManagerAlerts();
        } catch (e) {
          console.error("[didit] alert drain failed", e);
        }

        return Response.json({ ok: true });
      },
    },
  },
});

interface Resolved {
  applicationId: string | null;
  sessionId: string | null;
  diditUserId: string | null;
  decision: Record<string, any> | null;
}

async function resolveApplication(
  admin: any,
  body: Record<string, any>,
  sessionId: string | null,
): Promise<Resolved> {
  const diditUserId = body["vendor_user_id"] ? String(body["vendor_user_id"]) : null;
  const out: Resolved = { applicationId: null, sessionId, diditUserId, decision: null };

  const byVendorData = async (value: unknown) => {
    const vendorData = value ? String(value) : null;
    if (!vendorData || !UUID_RE.test(vendorData)) return null;
    const { data } = await admin
      .from("investor_applications")
      .select("id")
      .eq("id", vendorData)
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };

  out.applicationId = await byVendorData(body["vendor_data"]);
  if (out.applicationId) return await tagUser(admin, out);

  // Known session recorded when the investor started the check in the portal.
  const candidates = [sessionId, body["session_id"], body["business_session_id"], body["inquiry_id"]]
    .filter(Boolean)
    .map(String);
  for (const candidate of candidates) {
    const { data } = await admin
      .from("kyc_verifications")
      .select("application_id, session_id")
      .or(`session_id.eq.${candidate},inquiry_id.eq.${candidate}`)
      .maybeSingle();
    if (data?.application_id) {
      out.applicationId = data.application_id as string;
      out.sessionId = out.sessionId ?? (data.session_id as string | null);
      return await tagUser(admin, out);
    }
  }

  // Same investor, a later session created outside the portal.
  if (diditUserId) {
    const { data } = await admin
      .from("kyc_verifications")
      .select("application_id, session_id")
      .eq("didit_user_id", diditUserId)
      .maybeSingle();
    if (data?.application_id) {
      out.applicationId = data.application_id as string;
      out.sessionId = out.sessionId ?? (data.session_id as string | null);
      return out;
    }
  }

  // Last resort: ask Didit for the session decision and match on vendor_data
  // or the verified email address.
  if (sessionId) {
    const decision = await fetchDiditSessionDecision(sessionId);
    if (decision) {
      out.decision = decision;
      out.applicationId = await byVendorData(decision["vendor_data"]);
      if (out.applicationId) return await tagUser(admin, out);

      for (const email of Array.from(new Set(collectEmails(decision)))) {
        const { data: profile } = await admin
          .from("profiles")
          .select("id")
          .ilike("email", email)
          .maybeSingle();
        if (!profile?.id) continue;
        const { data: app } = await admin
          .from("investor_applications")
          .select("id")
          .eq("user_id", profile.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (app?.id) {
          out.applicationId = app.id as string;
          return await tagUser(admin, out);
        }
      }
    }
  }

  return out;
}

/** Remembers the provider's user id so later account-level events match instantly. */
async function tagUser(admin: any, resolved: Resolved): Promise<Resolved> {
  if (!resolved.applicationId || !resolved.diditUserId) return resolved;
  await admin
    .from("kyc_verifications")
    .update({ didit_user_id: resolved.diditUserId })
    .eq("application_id", resolved.applicationId)
    .is("didit_user_id", null);
  return resolved;
}

/** Pulls the current session decision from Didit and applies it. */
async function resyncFromProvider(admin: any, applicationId: string, sessionId: string | null) {
  let id = sessionId;
  if (!id) {
    const { data } = await admin
      .from("kyc_verifications")
      .select("session_id")
      .eq("application_id", applicationId)
      .maybeSingle();
    id = (data?.session_id as string | null) ?? null;
  }
  if (!id) return;
  const decision = await fetchDiditSessionDecision(id);
  if (!decision) return;
  const status = decision["status"] ? String(decision["status"]) : null;
  if (!status) return;
  await applySessionEvent(admin, applicationId, decision, id, status, decision);
}

/** Links earlier unmatched events for the same session/user to the application. */
async function backfillRelatedEvents(
  admin: any,
  applicationId: string,
  sessionId: string | null,
  diditUserId: string | null,
) {
  if (sessionId) {
    await admin
      .from("didit_webhook_events")
      .update({ application_id: applicationId })
      .is("application_id", null)
      .eq("session_id", sessionId);
  }
  if (diditUserId) {
    await admin
      .from("didit_webhook_events")
      .update({ application_id: applicationId })
      .is("application_id", null)
      .contains("payload", { vendor_user_id: diditUserId });
  }
}



async function applySessionEvent(
  admin: any,
  applicationId: string,
  body: Record<string, any>,
  sessionId: string | null,
  status: string | null,
  fetchedDecision?: Record<string, any> | null,
) {
  const mapping = mapDiditStatus(status ?? undefined);
  if (!mapping) return;

  const decision = body["decision"] ?? fetchedDecision ?? {};
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
  if (body["vendor_user_id"]) kycRow["didit_user_id"] = String(body["vendor_user_id"]);


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
