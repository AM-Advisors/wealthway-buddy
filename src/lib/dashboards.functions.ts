import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const range = z.enum(["30d", "90d", "12m"]).default("90d");
const srv = () => import("@/lib/dashboards.server");

export const opsDashboardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    clientId: z.string().uuid().optional(), fundId: z.string().uuid().optional(), managerId: z.string().uuid().optional(), range,
  }).parse(d ?? {}))
  .handler(async ({ context, data }) => (await srv()).opsDashboard(context.userId, data));

export const managerFundDashboardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid(), range }).parse(d ?? {}))
  .handler(async ({ context, data }) => (await srv()).managerFundDashboard(context.userId, data.offeringId, data.range));

export const investorDashboardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).investorDashboard(context.userId));
