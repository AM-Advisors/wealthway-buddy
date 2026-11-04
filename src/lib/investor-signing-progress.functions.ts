import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/require-auth";

/** Staff-only: questionnaire, tax form and signature status for every open investment. */
export const getInvestorSigningProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await import("@/lib/investor-signing-progress.server")).signingProgress(context as any));
