import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  applicationId: z.string().uuid(),
  status: z.enum(["Approved", "Declined", "In Review"]),
});

/**
 * Admin-only diagnostic: posts a correctly signed `status.updated` event to the
 * live Didit webhook so the exact production code path (signature verification
 * included) can be exercised without waiting on the hosted flow.
 */
export const sendTestDiditEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin");
    if (rolesError) throw new Error(rolesError.message);
    if (!roles || roles.length === 0) throw new Error("Forbidden: admin access required.");

    const secret = process.env["DIDIT_WEBHOOK_SECRET"];
    if (!secret) throw new Error("Identity webhook secret is not configured.");

    const { data: kyc, error: kycError } = await context.supabase
      .from("kyc_verifications")
      .select("session_id")
      .eq("application_id", data.applicationId)
      .maybeSingle();
    if (kycError) throw new Error(kycError.message);

    const sessionId = kyc?.session_id ?? `test-session-${data.applicationId.slice(0, 8)}`;
    const timestamp = Math.floor(Date.now() / 1000);

    const payload: Record<string, unknown> = {
      event_id: `admin-test-${timestamp}-${data.applicationId.slice(0, 8)}`,
      webhook_type: "status.updated",
      session_id: sessionId,
      status: data.status,
      timestamp,
      vendor_data: data.applicationId,
      is_test_event: true,
      decision: {
        kyc: { status: data.status },
        aml: { status: data.status === "Approved" ? "Approved" : "In Review", total_hits: 0 },
      },
    };

    const { canonicalJson } = await import("@/lib/didit.server");
    const { createHmac } = await import("crypto");
    const rawBody = canonicalJson(payload);
    const signature = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

    const origin = process.env["PUBLIC_SITE_ORIGIN"] ?? "https://onboard.harmonious.co";
    const res = await fetch(`${origin}/api/public/webhooks/didit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-timestamp": String(timestamp),
        "x-signature": signature,
        "x-signature-v2": signature,
        "x-didit-test-webhook": "true",
      },
      body: rawBody,
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`Webhook rejected the test event (${res.status}): ${text.slice(0, 200)}`);
    return { ok: true, status: data.status, sessionId, response: text.slice(0, 200) };
  });
