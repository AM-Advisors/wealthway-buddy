import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin access required.");
}

const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  legal_name: z.string().trim().max(120).optional().or(z.literal("")),
  offeringId: z.string().uuid("Choose a fund"),
  kind: z.enum(["manager", "investor"]),
});

/**
 * Invite (or reuse) a person by email and give them access to a fund,
 * either as a fund manager or as an investor who can see the offering.
 */
export const inviteFundAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inviteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let targetUserId: string | null = null;

    const { data: profileRow } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .ilike("email", email)
      .maybeSingle();
    if (profileRow) targetUserId = (profileRow as any).user_id as string;

    if (!targetUserId) {
      const { data: listed } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const match = (listed?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);
      if (match) targetUserId = match.id;
    }

    let created = false;
    if (!targetUserId) {
      const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: data.legal_name ? { legal_name: data.legal_name } : {},
      });
      if (createError || !createdUser?.user) {
        throw new Error(createError?.message ?? "Could not create that account.");
      }
      targetUserId = createdUser.user.id;
      created = true;
    }

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, legal_name")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (existingProfile) {
      await supabaseAdmin
        .from("profiles")
        .update({
          email,
          legal_name: data.legal_name || (existingProfile as any).legal_name || null,
        })
        .eq("id", (existingProfile as any).id);
    } else {
      await supabaseAdmin.from("profiles").insert({
        user_id: targetUserId,
        email,
        legal_name: data.legal_name || null,
      });
    }

    const table = data.kind === "manager" ? "fund_managers" : "investor_fund_access";
    const { error: assignError } = await supabase
      .from(table)
      .upsert(
        { user_id: targetUserId, offering_id: data.offeringId, granted_by: userId },
        { onConflict: "user_id,offering_id" },
      );
    if (assignError) throw new Error(assignError.message);

    if (data.kind === "manager") {
      const { data: role } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", targetUserId)
        .eq("role", "fund_manager")
        .maybeSingle();
      if (!role) {
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({ user_id: targetUserId, role: "fund_manager" as any });
        if (roleError) throw new Error(roleError.message);
      }
    }

    return { userId: targetUserId, created, email };
  });
