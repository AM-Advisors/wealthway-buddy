import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const engine = () => import("@/lib/fund-integrity.server");
const uuid = z.string().uuid();

export const searchFundsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().max(200).nullish(), legalName: z.string().max(200).nullish(), excludeId: uuid.nullish() }).parse(d))
  .handler(async ({ context, data }) => (await engine()).searchFunds(context, data));

export const investorSyncStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: uuid }).parse(d))
  .handler(async ({ context, data }) => (await engine()).syncStatus(context, data.offeringId));

export const runInvestorSyncFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: uuid }).parse(d))
  .handler(async ({ context, data }) => (await engine()).runInvestorRecordsSync(context, data.offeringId));

export const resolveSyncItemFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      itemId: uuid,
      action: z.enum(["open", "create_investor", "link", "add_to_fund", "not_investor", "review_later", "create_folder", "mark_reviewed", "dismiss"]),
      note: z.string().max(500).nullish(),
      onboardingId: uuid.nullish(),
      profileId: uuid.nullish(),
      personId: uuid.nullish(),
      person: z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), email: z.string().trim().email().max(200) }).nullish(),
      profileType: z.string().max(40).nullish(),
      amountCents: z.number().int().min(0).nullish(),
    }).parse(d))
  .handler(async ({ context, data }) => (await engine()).resolveSyncItem(context, data as any));

export const renameFundFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: uuid, name: z.string().trim().min(2).max(160), reason: z.string().trim().min(3).max(500), effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish() }).parse(d))
  .handler(async ({ context, data }) => (await engine()).renameFund(context, data));
