import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuthUnverified as requireSupabaseAuth } from "@/lib/require-auth";

const va = () => import("@/lib/view-as.server");
/** The sign-in session id comes from the validated token, never from request data. */
const sid = (claims: any) => (claims?.session_id ? String(claims.session_id) : null);

export const listPerspectivesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: z.string().uuid().nullish(), offeringId: z.string().uuid().nullish() }).parse)
  .handler(async ({ data, context }) => (await va()).listPerspectives(context.userId, { onboardingId: data.onboardingId ?? null, offeringId: data.offeringId ?? null }));

export const startViewAsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    perspective: z.enum(["investor", "fund_manager"]),
    subjectUserId: z.string().uuid(),
    offeringId: z.string().uuid(),
    onboardingId: z.string().uuid().nullable(),
    preview: z.boolean().optional(),
  }).parse)
  .handler(async ({ data, context }) => (await va()).startViewAs(context.userId, sid(context.claims), data));

export const endViewAsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await va()).endViewAs(context.userId, "exit"));

export const activeViewAsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await va()).activeViewAs(context.userId, sid(context.claims)));

export const viewAsInvestmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await va()).viewAsInvestment(context.userId, sid(context.claims)));

export const viewAsFundFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await va()).viewAsFund(context.userId, sid(context.claims)));

export const beginEditAsHarmoniousFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await va()).beginEditAsHarmonious(context.userId, sid(context.claims)));

export const activeEditContextFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await va()).activeEditContext(context.userId, sid(context.claims)));

export const exitEditContextFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await va()).exitEditContext(context.userId));

export const returnToClientViewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await va()).returnToClientView(context.userId, sid(context.claims)));
