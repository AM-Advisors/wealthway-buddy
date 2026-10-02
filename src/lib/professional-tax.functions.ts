import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";

const kind = z.enum(["1065", "1042", "1099"]);
const engine = () => import("@/lib/professional-tax.server");

export const getProfessionalTax = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await engine()).professionalTaxWorkspace(context.userId));

export const professionalTaxActionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind,
        id: z.string().uuid(),
        action: z.enum(["mark_prepared", "submit", "approve", "return"]),
        note: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => (await engine()).professionalTaxAction(context.userId, data));

export const getProfessionalTaxHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind, id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await engine()).professionalTaxHistory(context.userId, data));

export const getStaffTax = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await engine()).staffTaxWorkspace(context.userId));

export const staffTaxActionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ kind, id: z.string().uuid(), action: z.enum(["mark_prepared", "submit", "approve", "return"]), note: z.string().max(2000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => (await engine()).staffTaxAction(context.userId, data));

export const getStaffTaxHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ kind, id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await engine()).staffTaxHistory(context.userId, data));
