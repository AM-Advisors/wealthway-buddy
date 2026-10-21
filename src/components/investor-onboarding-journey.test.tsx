import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AboutYou } from "@/components/investor-onboarding-journey";

// The About You step has to state the fund's minimum right under the amount box,
// so an investor never types a number the fund will refuse.
function renderAboutYou(minInvestmentCents: number | null) {
  const d = {
    offering: { id: "fund-1", name: "CORPS EREBOR", slug: "erebor", minInvestmentCents },
    requirements: [],
    requestedAmountCents: null,
    investmentProfileId: null,
  };
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AboutYou d={d} onboardingId="onboarding-1" done={() => {}} />
    </QueryClientProvider>,
  );
}

describe("investment amount minimum", () => {
  it("shows the fund minimum under the amount field", () => {
    const html = renderAboutYou(50_000_000);
    expect(html).toContain("Investment amount (USD)");
    expect(html).toContain("Minimum $500,000");
  });

  it("keeps the minimum next to the amount box, not elsewhere on the page", () => {
    const html = renderAboutYou(50_000_000);
    const amount = html.indexOf('for="amount"');
    const minimum = html.indexOf("Minimum $500,000");
    expect(amount).toBeGreaterThan(-1);
    expect(minimum).toBeGreaterThan(amount);
    expect(html.slice(amount, minimum).length).toBeLessThan(400);
  });

  it("says nothing when the fund sets no minimum", () => {
    const html = renderAboutYou(0);
    expect(html).not.toContain("Minimum $");
    expect(renderAboutYou(null)).not.toContain("Minimum $");
  });
});
