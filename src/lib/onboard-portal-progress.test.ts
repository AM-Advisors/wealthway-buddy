import { describe, expect, it } from "vitest";
import { portalProgressPercent, type PortalStepView } from "./onboard-portal-model";
const s = (key: any, state: any): PortalStepView => ({ key, label: key, state } as PortalStepView);
describe("portal progress", () => {
  it("is 75% when documents await fund countersignature but money arrived", () => {
    expect(portalProgressPercent([s("verification","complete"),s("accreditation","complete"),s("documents","in_review")], true)).toBe(75);
  });
  it("is 100% only when every card is done", () => {
    expect(portalProgressPercent([s("verification","complete"),s("accreditation","complete"),s("documents","complete")], true)).toBe(100);
  });
});
