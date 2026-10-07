import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const eng = () => import("@/lib/fund-manager-submissions.server");
const uuid = z.string().uuid();
const short = z.union([z.string().max(500), z.number()]).nullish();

export const listFundSubmissionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: uuid }).parse)
  .handler(async ({ data, context }) => (await eng()).listSubmissions(context.userId, data.offeringId));

export const submitFundInfoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      offeringId: uuid,
      section: z.enum(["fund_details", "fees_team", "bank", "document"]),
      docKind: z.enum(["ein_letter", "signed_w9", "operating_agreement", "ppm", "subscription_agreement", "other"]).nullish(),
      payload: z.record(z.string().max(40), short).refine((r) => Object.keys(r).length <= 30),
      file: z.object({ name: z.string().min(1).max(200), base64: z.string().max(14_500_000) }).nullish(),
    }).parse,
  )
  .handler(async ({ data, context }) => (await eng()).submit(context.userId, data as any));

export const submissionFileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid }).parse)
  .handler(async ({ data, context }) => (await eng()).fileLink(context.userId, data.id));

export const reviewFundSubmissionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid, decision: z.enum(["approve", "return"]), note: z.string().max(1000).nullish() }).parse)
  .handler(async ({ data, context }) => (await eng()).review(context.supabase, context.userId, data));
