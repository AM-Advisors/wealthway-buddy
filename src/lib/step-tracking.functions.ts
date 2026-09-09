import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { activeApplicationId } from "@/lib/active-application";

export const STEP_KEYS = ["kyc", "aml", "accreditation", "documents", "funding"] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export const STEP_LABELS: Record<StepKey, string> = {
  kyc: "Identity check",
  aml: "Screening",
  accreditation: "Accreditation",
  documents: "Documents",
  funding: "Funding",
};

const viewSchema = z.object({ step: z.enum(STEP_KEYS) });

/** Records that the signed-in investor opened an onboarding step (first and latest time). */
export const recordStepView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => viewSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: app } = await supabase
      .from("investor_applications")
      .select("id, offering_id")
      .eq("user_id", userId)
      .eq("id", await activeApplicationId(supabase, userId))
      .maybeSingle();

    if (!app) return { recorded: false };

    const { data: existing } = await supabase
      .from("onboarding_step_views")
      .select("id, view_count")
      .eq("application_id", app.id)
      .eq("step", data.step)
      .maybeSingle();

    const now = new Date().toISOString();
    if (existing) {
      await supabase
        .from("onboarding_step_views")
        .update({ view_count: (existing.view_count ?? 1) + 1, last_viewed_at: now })
        .eq("id", existing.id);
    } else {
      await supabase.from("onboarding_step_views").insert({
        application_id: app.id,
        user_id: userId,
        offering_id: app.offering_id,
        step: data.step,
        view_count: 1,
        first_viewed_at: now,
        last_viewed_at: now,
      });
    }

    return { recorded: true };
  });

const reportSchema = z.object({
  offeringId: z.string().uuid().optional(),
  days: z.number().int().min(1).max(365).optional(),
});

async function assertReviewer(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "fund_manager"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: reviewer access required.");
}

function isDone(step: StepKey, app: any) {
  switch (step) {
    case "kyc":
      return app.kyc_status === "approved";
    case "aml":
      return app.aml_status === "approved";
    case "accreditation":
      return app.accreditation_status === "approved";
    case "documents":
      return app.documents_status === "approved";
    case "funding":
      return app.funding_status === "settled";
  }
}

/** Per-step open rate and completion across investor applications. */
export const getStepEngagement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => reportSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReviewer(supabase, userId);

    const days = data.days ?? 90;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let appQuery = supabase
      .from("investor_applications")
      .select(
        "id, user_id, offering_id, kyc_status, aml_status, accreditation_status, documents_status, funding_status, created_at",
      )
      .gte("created_at", since)
      .limit(1000);
    if (data.offeringId) appQuery = appQuery.eq("offering_id", data.offeringId);

    const { data: appRows, error: appError } = await appQuery;
    if (appError) throw new Error(appError.message);
    const applications = (appRows ?? []) as any[];
    const appIds = applications.map((a) => a.id as string);

    const [{ data: viewRows }, { data: profileRows }] = await Promise.all([
      appIds.length
        ? supabase
            .from("onboarding_step_views")
            .select("application_id, step, view_count, first_viewed_at, last_viewed_at")
            .in("application_id", appIds)
        : Promise.resolve({ data: [] as any[] }),
      applications.length
        ? supabase
            .from("profiles")
            .select("user_id, legal_name, email")
            .in("user_id", [...new Set(applications.map((a) => a.user_id as string))])
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const views = (viewRows ?? []) as any[];
    const profileMap = new Map(((profileRows ?? []) as any[]).map((p) => [p.user_id, p]));
    const viewMap = new Map(views.map((v) => [`${v.application_id}:${v.step}`, v]));

    const total = applications.length;

    const steps = STEP_KEYS.map((step) => {
      const opened = applications.filter((a) => viewMap.has(`${a.id}:${step}`));
      const completed = applications.filter((a) => isDone(step, a));
      const openedNotDone = opened.filter((a) => !isDone(step, a));
      const totalOpens = opened.reduce(
        (sum, a) => sum + Number(viewMap.get(`${a.id}:${step}`)?.view_count ?? 0),
        0,
      );
      return {
        key: step,
        label: STEP_LABELS[step],
        opened: opened.length,
        completed: completed.length,
        totalOpens,
        openRate: total ? Math.round((opened.length / total) * 100) : 0,
        completionRate: opened.length ? Math.round((completed.length / opened.length) * 100) : 0,
        stuck: openedNotDone.slice(0, 25).map((a) => {
          const p = profileMap.get(a.user_id);
          const v = viewMap.get(`${a.id}:${step}`);
          return {
            applicationId: a.id as string,
            name: (p?.legal_name as string) ?? null,
            email: (p?.email as string) ?? null,
            firstViewedAt: (v?.first_viewed_at as string) ?? null,
            lastViewedAt: (v?.last_viewed_at as string) ?? null,
            opens: Number(v?.view_count ?? 0),
          };
        }),
        stuckCount: openedNotDone.length,
        neverOpened: total - opened.length,
      };
    });

    return { total, steps, days };
  });
