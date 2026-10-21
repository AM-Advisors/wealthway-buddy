import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";

export const listSideLetterNeedsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await import("@/lib/side-letter-fee.server")).listSideLetterNeeds(context.userId, data.offeringId));

export const sideLetterDocumentUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sideLetterId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await import("@/lib/side-letter-fee.server")).sideLetterDocumentUrl(context.userId, data.sideLetterId));
