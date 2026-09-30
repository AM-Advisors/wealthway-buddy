import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const srv = () => import("@/lib/financial-statement-packages.server");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const listPackagesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).listPackages(context.userId));

export const savePackageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(), offeringId: z.string().uuid(), periodType: z.enum(["quarterly", "annual"]),
    periodStart: date, periodEnd: date, notes: z.string().max(10000),
  }).parse(d))
  .handler(async ({ data, context }) => (await srv()).savePackage(context.userId, data));

export const packageActionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(), action: z.enum(["submit", "review_pass", "return", "manager_approve", "manager_return"]),
    note: z.string().max(2000).nullish(),
  }).parse(d))
  .handler(async ({ data, context }) => (await srv()).packageAction(context.userId, data));

export const packageHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).packageHistory(context.userId, data.id));

export const notifyPackageManagersFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).notifyManagers(context.userId, data.id));
