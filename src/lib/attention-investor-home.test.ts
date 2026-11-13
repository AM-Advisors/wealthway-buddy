import { describe, expect, it } from "vitest";
import { buildAttentionItem, emptyGroups, showStartFundPromo, withoutCoveredInvestments } from "@/lib/attention-model";

const item = (id: string, href: string) =>
  buildAttentionItem({ id, source: "investor.investment", workspace: "investor", group: "needs_you", severity: "action", title: "Tell us who is investing", workflowState: "profile_selected", sourceTable: "investor_onboardings", sourceId: id, href, at: null });

describe("investor home de-duplication", () => {
  it("drops Needs you rows for investments the investment card already shows", () => {
    const groups = { ...emptyGroups(), needs_you: [item("a", "/investment/onb-1?step=about"), item("b", "/investment/onb-2?step=sign"), item("c", "/tax/forms")] };
    const out = withoutCoveredInvestments(groups, ["onb-1"]);
    expect(out.needs_you.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("hides the Start your own fund promo while any investment is in progress", () => {
    expect(showStartFundPromo([{ complete: false }])).toBe(false);
    expect(showStartFundPromo([{ complete: true }, { complete: false }])).toBe(false);
    expect(showStartFundPromo([{ complete: true }])).toBe(true);
    expect(showStartFundPromo([])).toBe(true);
  });
});
