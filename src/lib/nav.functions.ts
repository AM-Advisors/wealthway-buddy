import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { activeApplicationId } from "@/lib/active-application";

export type NavStep = {
  key: "kyc" | "aml" | "accreditation" | "documents" | "funding";
  label: string;
  state: "done" | "current" | "todo";
};

/** Small read for the sidebar: who the person is and where they are in onboarding. */
export const getNavState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: profile }, { data: application }] = await Promise.all([
      supabase.from("profiles").select("legal_name, email").eq("user_id", userId).maybeSingle(),
      supabase
        .from("investor_applications")
        .select(
          "id, status, current_step, kyc_status, aml_status, accreditation_status, documents_status, funding_status",
        )
        .eq("user_id", userId)
        .eq("id", await activeApplicationId(supabase, userId))
        .maybeSingle(),
    ]);

    if (!application) {
      return { profile, hasApplication: false, complete: false, steps: [] as NavStep[] };
    }

    const done = (value: string | null) => value === "approved" || value === "settled";
    const raw: { key: NavStep["key"]; label: string; finished: boolean }[] = [
      { key: "kyc", label: "Identity", finished: done(application.kyc_status) },
      { key: "aml", label: "Screening", finished: done(application.aml_status) },
      {
        key: "accreditation",
        label: "Accreditation",
        finished: done(application.accreditation_status),
      },
      { key: "documents", label: "Documents", finished: done(application.documents_status) },
      { key: "funding", label: "Funding", finished: done(application.funding_status) },
    ];

    const steps: NavStep[] = raw.map((s) => ({
      key: s.key,
      label: s.label,
      state: s.finished ? "done" : application.current_step === s.key ? "current" : "todo",
    }));

    return {
      profile,
      hasApplication: true,
      complete: raw.every((s) => s.finished),
      steps,
    };
  });
