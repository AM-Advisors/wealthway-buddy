import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

/** Staff or the exact fund's Self Serve manager generates the 506(c) circular. */
export const generate506cCircularFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) =>
    (await import("./offering-circular-506c.server")).generate506cCircular(context.userId, data.offeringId),
  );
