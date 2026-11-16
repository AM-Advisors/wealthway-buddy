import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/require-auth";

/**
 * Retired. Opening old-style applications outside a fund's investor records
 * created duplicates next to the fund's investment records. Kept only so an
 * older open browser tab gets a clear message; it never writes anything.
 * Add investors from the fund's Investors tab instead.
 */
export const createInvestorApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    throw new Error("This screen has been retired. Open the fund, go to Investors and choose Add investor.");
  });
