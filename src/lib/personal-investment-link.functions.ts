import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const s = () => import("@/lib/investor-onboarding.server");
const id = (d: unknown) => z.object({ onboardingId: z.string().uuid() }).parse(d);
export const getPersonalInvestmentLink = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(id).handler(async ({ data, context }) => (await s()).getPersonalLink(context.userId, data.onboardingId));
export const createPersonalInvestmentLink = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(id).handler(async ({ data, context }) => (await s()).createPersonalLink(context.userId, data.onboardingId));
export const sendPersonalInvestmentLink = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(id).handler(async ({ data, context }) => (await s()).sendPersonalLink(context.userId, data.onboardingId));
export const recordPersonalInvestmentLinkCopy = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(id).handler(async ({ data, context }) => (await s()).recordPersonalLinkCopy(context.userId, data.onboardingId));
export const getMyPersonalInvestmentLinks = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => (await s()).myPersonalLinks(context.userId));
