import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { activeApplicationId } from "@/lib/active-application";
import {
  evaluateHarmoniousDecision,
  investorProgress,
  normalizeDiditDecision,
  type CheckStatus,
} from "@/lib/kyc-verification";

/**
 * Creates (or resumes) the investor's Didit verification session. The provider
 * key stays on the server, the session is correlated by an opaque Harmonious
 * reference, and results arrive on /api/public/webhooks/didit — with
 * reconciliation as the backstop when a webhook is missed.
 */
export const startIdentityCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: application, error: appError } = await supabase
      .from("investor_applications")
      .select("id, kyc_status")
      .eq("user_id", userId)
      .eq("id", await activeApplicationId(supabase, userId))
      .maybeSingle();
    if (appError) throw new Error(appError.message);
    if (!application) throw new Error("No application found. Reload and try again.");

    let origin = "https://app.harmonious.co";
    try {
      const request = getRequest();
      if (request?.url) origin = new URL(request.url).origin;
    } catch {
      /* fall back to the production origin */
    }

    const { startVerificationSession } = await import("@/lib/kyc-verification.server");
    const result = await startVerificationSession({
      applicationId: application.id,
      userId,
      origin,
    });
    return { url: result.url, resumed: result.resumed };
  });

/**
 * The investor-facing progression. Nothing here exposes risk scores,
 * provider payloads or compliance notes.
 */
export const identityVerificationProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const applicationId = await activeApplicationId(supabase, userId);
    if (!applicationId) {
      return { started: false, summary: "Verification not started", steps: [], message: null };
    }

    const { data: verification } = await supabase
      .from("kyc_verifications")
      .select("id, status, session_url, decision, harmonious_decision, document_expired, person_id")
      .eq("application_id", applicationId)
      .maybeSingle();

    if (!verification) {
      return { started: false, summary: "Verification not started", steps: [], message: null };
    }

    const { data: checks } = await supabase
      .from("identity_check_results")
      .select("check_kind, harmonious_status, provider_status")
      .eq("verification_id", verification.id);

    const started = verification.status !== "not_started";
    const decisionRecord = (verification as any).decision;
    const normalized = normalizeDiditDecision(decisionRecord ?? {});
    const decision = (checks ?? []).length
      ? {
          providerDecision: null,
          kyc: ((verification as any).harmonious_decision ?? verification.status) as CheckStatus,
          aml: "not_started" as CheckStatus,
          reasons: [],
          investorMessage: null,
          documentExpired: Boolean((verification as any).document_expired),
          reviewRequired: false,
          checks: (checks ?? []).map((c: any) => ({
            kind: c.check_kind,
            providerStatus: c.provider_status,
            harmoniousStatus: c.harmonious_status,
            warnings: [],
            detail: {},
          })),
        }
      : evaluateHarmoniousDecision({
          normalized,
          verificationDate: new Date(),
          proofOfAddressRequired: false,
        });

    const progress = investorProgress({ decision: decision as any, started });
    return {
      started,
      summary: progress.summary,
      steps: progress.steps,
      message: progress.steps.find((s) => s.message)?.message ?? null,
    };
  });

/**
 * Staff-only recovery for a missed webhook: re-reads the outstanding session
 * from the provider. It never creates a new verification session.
 */
export const reconcileIdentityVerifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { verificationId?: string | null } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const list = ((roles ?? []) as any[]).map((r) => String(r.role));
    const allowed = ["admin", "super_admin", "operations", "compliance", "fund_administration"];
    if (!list.some((r) => allowed.includes(r))) throw new Error("Forbidden");

    const { reconcileOutstandingVerifications } = await import("@/lib/kyc-verification.server");
    return await reconcileOutstandingVerifications({
      verificationId: data.verificationId ?? null,
      actorUserId: userId,
    });
  });
