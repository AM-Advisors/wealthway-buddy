import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const srv = () => import("@/lib/fund-manager-profile.server");

export const fundManagerProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fundId: z.string().uuid(), key: z.string().max(80).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await srv();
    await s.assertOpsStaff(context.userId);
    return s.managerProfile(data.fundId, data.key);
  });

export const messageFundManagerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      fundId: z.string().uuid(),
      key: z.string().max(80),
      subject: z.string().trim().min(2).max(200),
      body: z.string().trim().min(1).max(5000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const s = await srv();
    await s.assertOpsStaff(context.userId);
    return s.staffMessageManager(context.userId, data);
  });
