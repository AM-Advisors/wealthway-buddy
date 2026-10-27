import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenSchema = z.object({ token: z.string().min(10).max(100) });

/** Public: anyone holding the link may see that it's valid; no email or account data is returned. */
export const previewInviteLinkFn = createServerFn({ method: "POST" })
  .validator((d) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return (await import("@/lib/account-invite.server")).previewInviteLink(supabaseAdmin, data.token);
  });

/** Public: uses the single-use link and returns a short-lived sign-in link for that exact account. */
export const redeemInviteLinkFn = createServerFn({ method: "POST" })
  .validator((d) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const url = await (await import("@/lib/account-invite.server")).redeemInviteLink(supabaseAdmin, data.token);
    return { url };
  });
