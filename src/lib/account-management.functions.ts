import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/require-auth";

/** Read-only Account Management dashboard (hand-offs and renewals included). */
export const getAmDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await import("@/lib/account-management.server")).amDashboard(context.userId));
