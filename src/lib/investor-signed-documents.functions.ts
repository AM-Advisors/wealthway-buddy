import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

export const investorSignedDocumentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: z.string().uuid() }).parse)
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { investorSignedDocuments } = await import("./investor-signed-documents.server");
    return investorSignedDocuments(supabaseAdmin, context.userId, data.onboardingId);
  });

export const investorSignedCopyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: z.string().uuid(), signatureId: z.string().uuid() }).parse)
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { investorSignedCopy } = await import("./investor-signed-documents.server");
    return investorSignedCopy(supabaseAdmin, context.userId, data);
  });