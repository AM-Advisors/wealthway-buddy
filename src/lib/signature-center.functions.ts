import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";

/** Everything the signed-in person may see about agreements to sign: their own turn first, then their funds. */
export const listSignatureCenterFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((x: unknown) => z.object({ offeringId: z.string().uuid().optional(), everything: z.boolean().optional() }).parse(x ?? {}))
  .handler(async ({ data, context }) => {
    const { loadSignatureCenter } = await import("@/lib/signature-center.server");
    return loadSignatureCenter({ userId: context.userId, email: ((context.claims as any)?.email as string | undefined) ?? null }, data);
  });
