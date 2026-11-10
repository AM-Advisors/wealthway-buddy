import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/marketing-approvals.server");

export const getMarketingApprovals = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).approvalQueue(context.userId));

export const checkMarketingDuplicates = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((d) => z.object({ kind: z.enum(["post", "email"]), title: z.string().max(300), at: z.string().nullable(), selfId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).openDuplicates(context.userId, data.kind, data.title, data.at, data.selfId));
