import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/standard-forms.server");
const key = z.enum(["subscription_agreement", "operating_agreement", "ppm"]);

export const standardFormsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ fundId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { assertFund } = await import("@/lib/fund-tabs.server");
    await assertFund(context.userId, data.fundId);
    return (await srv()).overview(context.userId, data.fundId);
  });

export const uploadStandardFormFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ key, body: z.string().min(20).max(400000), note: z.string().max(300) }).parse)
  .handler(async ({ data, context }) => (await srv()).uploadForm(context.userId, data.key, data.body, data.note));

export const generateStandardFormFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ fundId: z.string().uuid(), key }).parse)
  .handler(async ({ data, context }) => {
    const { assertFund } = await import("@/lib/fund-tabs.server");
    await assertFund(context.userId, data.fundId);
    return (await srv()).generate(context.userId, data.fundId, data.key);
  });
