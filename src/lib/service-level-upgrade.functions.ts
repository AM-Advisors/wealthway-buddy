import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

export const upgradeFundServiceLevel = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fundId: z.string().uuid(), level: z.enum(["core", "plus", "white_glove", "institutional"]), reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ data, context }) => (await import("@/lib/service-level-upgrade.server")).upgradeServiceLevel(context.userId, data));
