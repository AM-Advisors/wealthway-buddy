import { describe, expect, it } from "vitest";
import { surfaceForPath } from "./host-routing";

describe("staff investor record address", () => {
  it("keeps the staff investor record on Operations so the sign-in is kept", () => {
    expect(surfaceForPath("/ops/fund/f1/investor/o1")).toBe("ops");
  });
  it("keeps the manager investor record on the client app", () => {
    expect(surfaceForPath("/manager/fund/f1/investor/o1")).toBe("client");
  });
});
