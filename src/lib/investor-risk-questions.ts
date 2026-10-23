/** V2.5 questionnaire; informational and separate from verification. */
export type RiskQuestion = {
  id: string;
  prompt: string;
  helper?: string;
  options: { value: number; label: string }[];
};

export const RISK_QUESTIONS: RiskQuestion[] = [
  {
    id: "horizon",
    prompt: "What is your primary investment horizon?",
    options: [
      { value: 1, label: "Under 3 years" },
      { value: 2, label: "3 to 7 years" },
      { value: 3, label: "7 to 15 years" },
      { value: 4, label: "15+ years / multi-generational" },
    ],
  },
  {
    id: "drawdown",
    prompt: "A 20% portfolio drawdown in a single year would make you…",
    options: [
      { value: 1, label: "Sell to cash immediately" },
      { value: 2, label: "Reduce risk materially" },
      { value: 3, label: "Hold and rebalance" },
      { value: 4, label: "Buy the dip" },
    ],
  },
  {
    id: "goal",
    prompt: "Your top objective is…",
    options: [
      { value: 1, label: "Capital preservation" },
      { value: 2, label: "Steady income" },
      { value: 3, label: "Balanced income + growth" },
      { value: 4, label: "Maximize long-term growth" },
    ],
  },
  {
    id: "liquidity",
    prompt: "How much of your portfolio must be liquid within 30 days?",
    options: [
      { value: 1, label: "More than 40%" },
      { value: 2, label: "20 to 40%" },
      { value: 3, label: "10 to 20%" },
      { value: 4, label: "Less than 10%" },
    ],
  },
  {
    id: "income",
    prompt: "Annual income required from the portfolio (as % of assets)?",
    options: [
      { value: 4, label: "Under 2%" },
      { value: 3, label: "2 to 4%" },
      { value: 2, label: "4 to 6%" },
      { value: 1, label: "Over 6%" },
    ],
  },
  {
    id: "alt",
    prompt: "Comfort with private / illiquid alternatives (PE, credit, real assets)?",
    options: [
      { value: 1, label: "None — public only" },
      { value: 2, label: "Up to 15%" },
      { value: 3, label: "15 to 35%" },
      { value: 4, label: "35%+" },
    ],
  },
  {
    id: "experience",
    prompt: "How would you describe your investment experience?",
    options: [
      { value: 1, label: "Novice" },
      { value: 2, label: "Some experience" },
      { value: 3, label: "Seasoned" },
      { value: 4, label: "Institutional / professional" },
    ],
  },
  {
    id: "concentration",
    prompt: "Comfort with a single-position or single-manager concentration above 20%?",
    options: [
      { value: 1, label: "Not comfortable" },
      { value: 2, label: "Occasionally" },
      { value: 3, label: "Regularly" },
      { value: 4, label: "Fully comfortable" },
    ],
  },
  {
    id: "leverage",
    prompt: "Use of leverage or structured products?",
    options: [
      { value: 1, label: "Never" },
      { value: 2, label: "Sparingly" },
      { value: 3, label: "Strategically" },
      { value: 4, label: "Actively" },
    ],
  },
  {
    id: "esg",
    prompt: "ESG / values-based screening priority?",
    options: [
      { value: 1, label: "Not a factor" },
      { value: 2, label: "Nice-to-have" },
      { value: 3, label: "Important" },
      { value: 4, label: "Required" },
    ],
  },
];

