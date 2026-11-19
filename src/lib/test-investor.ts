/**
 * Test investors: Harmonious employees (any email ending in @harmonious.co) and
 * investments staff mark as tests. They go through every step like a real
 * investor but never count in fund totals, cap tables, filings or tax reports.
 */
export const EMPLOYEE_EMAIL_DOMAIN = "harmonious.co";

export function isEmployeeEmail(email: string | null | undefined): boolean {
  const e = String(email ?? "").trim().toLowerCase();
  return e.endsWith(`@${EMPLOYEE_EMAIL_DOMAIN}`);
}

/** A Harmonious email is always a test investor; staff may change the label only for other emails. */
export function testInvestorChangeError(isTest: boolean, emails: (string | null | undefined)[]): string | null {
  if (!isTest && emails.some(isEmployeeEmail)) return "This investor uses a Harmonious email, so they always stay a test investor.";
  return null;
}
