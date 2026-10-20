/** Tabs of the investor's per-investment workspace (/investment/$onboardingId). */
export const INVESTMENT_TABS = [
  { id: "overview", title: "Overview" },
  { id: "onboarding", title: "Onboarding steps" },
  { id: "capital", title: "Capital" },
  { id: "activity", title: "Activity" },
  { id: "performance", title: "Performance" },
  { id: "reports", title: "Reports" },
  { id: "documents", title: "Documents" },
  { id: "tax", title: "Tax" },
] as const;

export type InvestmentTab = (typeof INVESTMENT_TABS)[number]["id"];

/** Unknown tabs fall back to Overview; a requested onboarding step always opens Onboarding steps. */
export function normalizeInvestmentTab(tab: string | undefined, step?: string): InvestmentTab {
  if (step && !tab) return "onboarding";
  return (INVESTMENT_TABS.some((t) => t.id === tab) ? tab : "overview") as InvestmentTab;
}
