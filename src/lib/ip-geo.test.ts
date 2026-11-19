import { describe, expect, it } from "vitest";
import { ipAt, isPublicIp, localTime, locate, placeLabel } from "./ip-geo";

describe("ip-geo", () => {
  it("never locates private or loopback addresses", () => {
    expect(isPublicIp("10.1.2.3")).toBe(false);
    expect(isPublicIp("192.168.0.4")).toBe(false);
    expect(isPublicIp("127.0.0.1")).toBe(false);
    expect(isPublicIp("::1")).toBe(false);
    expect(isPublicIp("8.8.8.8")).toBe(true);
  });
  it("gives a click the latest IP recorded at or before it, within 12 hours", () => {
    const pts = [{ at: "2026-11-19T01:00:00Z", ip: "1.1.1.1" }, { at: "2026-11-19T03:00:00Z", ip: "8.8.8.8" }];
    expect(ipAt(pts, "2026-11-19T02:00:00Z")?.ip).toBe("1.1.1.1");
    expect(ipAt(pts, "2026-11-19T04:00:00Z")?.ip).toBe("8.8.8.8");
    expect(ipAt(pts, "2026-11-19T00:30:00Z")).toBeNull();
    expect(ipAt(pts, "2026-11-20T04:00:00Z")).toBeNull();
  });
  it("shows the time in the person's own time zone", () => {
    expect(localTime("2026-11-19T06:11:00Z", "America/New_York")).toBe("Nov 19, 2026, 1:11 AM EST");
    expect(localTime("2026-11-19T06:11:00Z", "Not/AZone")).toBeNull();
  });
  it("builds the address and local time for a row", () => {
    const places = new Map([["8.8.8.8", { ip: "8.8.8.8", city: "Fort Lauderdale", region: "Florida", postal: "33301", country: "United States", timeZone: "America/New_York" }]]);
    expect(placeLabel(places.get("8.8.8.8"))).toBe("Fort Lauderdale, Florida 33301, United States");
    expect(locate("2026-11-19T06:11:00Z", "8.8.8.8", places)).toEqual({ ip: "8.8.8.8", place: "Fort Lauderdale, Florida 33301, United States", timeZone: "America/New_York", localWhen: "Nov 19, 2026, 1:11 AM EST" });
    expect(locate("2026-11-19T06:11:00Z", null, places).localWhen).toBeNull();
  });
});
