import type { QueryClient } from "@tanstack/react-query";

/** Refresh every fund screen after any change to a fund fact (details, banking, team, fees, legal name). */
export function invalidateFund(qc: QueryClient, fundId: string) {
  return Promise.all([
    qc.invalidateQueries({ predicate: (q) => (q.queryKey as unknown[]).some((k) => k === fundId || (k && typeof k === "object" && Object.values(k as object).includes(fundId))) }),
    qc.invalidateQueries({ queryKey: ["managed-wire-instructions"] }),
    qc.invalidateQueries({ queryKey: ["staff-funds"] }),
    qc.invalidateQueries({ queryKey: ["fund-setup-list"] }),
  ]);
}
