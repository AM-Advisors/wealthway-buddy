import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NavCounts = {
  applications: number;
  unpaidInvoices: number;
  serviceRequests: number;
  myClients: number;
};

const EMPTY: NavCounts = {
  applications: 0,
  unpaidInvoices: 0,
  serviceRequests: 0,
  myClients: 0,
};

/**
 * Small counts for the menu badges. Everything is best effort: if a read is not
 * permitted for this person the count simply stays at zero, so the menu never breaks.
 */
export const getNavCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NavCounts> => {
    const { supabase, userId } = context;

    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = (roleRows ?? []).map((r: any) => String(r.role));
    const staff = roles.some((r) =>
      ["admin", "fund_manager", "operations", "legal", "finance", "executive", "client_success"].includes(r),
    );
    if (!staff) return EMPTY;

    const safe = async (run: () => Promise<number>) => {
      try {
        return await run();
      } catch {
        return 0;
      }
    };

    const [applications, unpaidInvoices, serviceRequests, myClients] = await Promise.all([
      safe(async () => {
        const { count } = await supabase
          .from("investor_applications")
          .select("id", { count: "exact", head: true })
          .in("status", ["submitted", "in_review", "pending_review"]);
        return count ?? 0;
      }),
      safe(async () => {
        const { count } = await supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .in("status", ["issued", "approved", "partially_paid", "overdue"]);
        return count ?? 0;
      }),
      safe(async () => {
        const { count } = await supabase
          .from("service_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["requested", "in_review", "quoted", "signed"]);
        return count ?? 0;
      }),
      safe(async () => {
        const { count } = await supabase
          .from("client_assignments")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);
        return count ?? 0;
      }),
    ]);

    return { applications, unpaidInvoices, serviceRequests, myClients };
  });
