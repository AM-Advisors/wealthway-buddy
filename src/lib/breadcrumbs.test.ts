import { describe, expect, it } from "vitest";

import { breadcrumbsFor, parentPath } from "./breadcrumbs";

describe("breadcrumbs", () => {
  it("labels known segments and collapses fund ids", () => {
    const c = breadcrumbsFor("/manager/fund/4590531e-197e-4e0d-b1df-81bafb17c2ae/investors");
    expect(c.map((x) => x.label)).toEqual(["Fund manager", "Fund", "Investors"]);
    expect(c[1]!.url).toBe("/manager/fund/4590531e-197e-4e0d-b1df-81bafb17c2ae");
  });
  it("gives the parent for back", () => {
    expect(parentPath("/ops/fund-setup")).toBe("/ops");
    expect(parentPath("/ops")).toBeNull();
  });
});
