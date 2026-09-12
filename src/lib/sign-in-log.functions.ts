import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Records that a signed-in user reached the portal. Called once per browser
 *  session from the portal layout so Google sign-ins are logged too — the
 *  password form already logs its own attempts. Duplicate entries inside a
 *  short window are skipped so a password sign-in isn't counted twice. */
export const recordPortalSignIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = String((context.claims as any)?.email ?? "").toLowerCase();

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("login_attempts")
      .select("id")
      .eq("user_id", context.userId)
      .eq("success", true)
      .gte("created_at", fifteenMinutesAgo)
      .limit(1);
    if ((recent ?? []).length > 0) return { recorded: false };

    await supabaseAdmin.from("login_attempts").insert({
      email: email || "unknown",
      user_id: context.userId,
      success: true,
      failure_reason: null,
    });
    return { recorded: true };
  });
