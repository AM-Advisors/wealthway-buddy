import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DIDIT_SESSION_URL = "https://verification.didit.me/v2/session/";

/** Statuses where an existing Didit session can still be resumed by the investor. */
const RESUMABLE = new Set(["not_started", "pending"]);

/**
 * Creates (or resumes) a Didit verification session for the signed-in investor's
 * application. Results arrive asynchronously on /api/public/webhooks/didit, which
 * writes kyc_verifications + investor_applications, so the portal simply polls.
 */
export const startIdentityCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const apiKey = process.env["DIDIT_API_KEY"];
    const workflowId = process.env["DIDIT_WORKFLOW_ID"];
    if (!apiKey || !workflowId) {
      throw new Error(
        "Identity verification is not configured yet. Please contact the fund administrator.",
      );
    }

    const { data: application, error: appError } = await supabase
      .from("investor_applications")
      .select("id, kyc_status")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (appError) throw new Error(appError.message);
    if (!application) throw new Error("No application found. Reload and try again.");

    const { data: existing } = await supabase
      .from("kyc_verifications")
      .select("id, session_url, session_id, status")
      .eq("application_id", application.id)
      .maybeSingle();

    if (existing?.session_url && RESUMABLE.has(existing.status)) {
      return { url: existing.session_url, resumed: true };
    }

    let origin = "https://onboard.harmonious.co";
    try {
      const request = getRequest();
      if (request?.url) origin = new URL(request.url).origin;
    } catch {
      /* fall back to the production origin */
    }

    const response = await fetch(DIDIT_SESSION_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        workflow_id: workflowId,
        vendor_data: application.id,
        callback: `${origin}/portal`,
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      console.error("[didit] session create failed", response.status, text.slice(0, 500));
      throw new Error("Could not start identity verification. Please try again shortly.");
    }

    let payload: Record<string, any>;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("Identity provider returned an unreadable response.");
    }

    const sessionId = payload["session_id"] ? String(payload["session_id"]) : null;
    const url = payload["url"] ?? payload["session_url"] ?? payload["verification_url"];
    if (!url) throw new Error("Identity provider did not return a verification link.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const row = {
      application_id: application.id,
      provider: "didit",
      session_id: sessionId,
      inquiry_id: sessionId,
      session_url: String(url),
      vendor_data: application.id,
      status: "pending" as const,
      updated_at: now,
    };

    if (existing?.id) {
      const { error } = await supabaseAdmin.from("kyc_verifications").update(row).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("kyc_verifications").insert(row);
      if (error) throw new Error(error.message);
    }

    if (application.kyc_status === "not_started") {
      await supabase
        .from("investor_applications")
        .update({ kyc_status: "pending", updated_at: now })
        .eq("id", application.id);
    }

    return { url: String(url), resumed: false };
  });
