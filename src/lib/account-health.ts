/** Pure client-health projection for Account Management. Display only; never gates work. */
export type HealthInput = {
  stuckFunds: number;
  overdueInvoices: number;
  unansweredMessages: number;
  openRequests: number;
  daysSinceActivity: number | null;
};
export type Health = "Healthy" | "Needs attention" | "At risk";

export function clientHealth(i: HealthInput): { health: Health; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  if (i.stuckFunds > 0) { score += 2; reasons.push(`${i.stuckFunds} stuck fund${i.stuckFunds > 1 ? "s" : ""}`); }
  if (i.overdueInvoices > 0) { score += 2; reasons.push(`${i.overdueInvoices} overdue invoice${i.overdueInvoices > 1 ? "s" : ""}`); }
  if (i.unansweredMessages > 0) { score += 1; reasons.push(`${i.unansweredMessages} message${i.unansweredMessages > 1 ? "s" : ""} waiting`); }
  if (i.openRequests > 0) { score += 1; reasons.push(`${i.openRequests} open request${i.openRequests > 1 ? "s" : ""}`); }
  if (i.daysSinceActivity != null && i.daysSinceActivity > 60) { score += 2; reasons.push(`quiet ${i.daysSinceActivity} days`); }
  else if (i.daysSinceActivity != null && i.daysSinceActivity > 30) { score += 1; reasons.push(`quiet ${i.daysSinceActivity} days`); }
  return { health: score >= 3 ? "At risk" : score >= 1 ? "Needs attention" : "Healthy", reasons };
}
