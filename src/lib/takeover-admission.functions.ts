import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/takeover-admission.server");

export const takeoverOverviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await srv()).takeoverOverview(context.userId, data.offeringId) as Promise<any>);

export const decideTakeoverAdmissionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ admissionId: z.string().uuid(), approve: z.boolean(), reason: z.string().max(2000).nullable() }).parse)
  .handler(async ({ data, context }) => (await srv()).decideTakeoverAdmission(context.userId, data));
