import { describe, expect, it } from "vitest";
import { applicationSurfaceForHost, canonicalRedirect, redirectSettles, surfaceForPath, workspaceLeavesCurrentHost } from "@/lib/host-routing";
import { getNavigation } from "@/lib/navigation";

const app = "https://app.harmonious.co";
const ops = "https://ops.harmonious.co";
const mixed = {
  operations: true,
  workspaces: [
    { id: "investor", kind: "investor" as const, label: "Investments", path: "/home", surface: "client" as const },
    { id: "operations", kind: "operations" as const, label: "Operations", path: "/ops", surface: "ops" as const },
  ],
};

describe("app and staff separation", () => {
  it("classifies all staff work areas and preserves deep links", () => {
    for (const path of ["/ops/funds", "/admin/audit", "/staff", "/sales/crm", "/marketing/posts", "/account-manager/clients"]) {
      expect(surfaceForPath(path)).toBe("ops");
      expect(canonicalRedirect({ url: `${app}${path}?tab=details#record` })?.location).toBe(`${ops}${path}?tab=details#record`);
      expect(canonicalRedirect({ url: `${ops}${path}` })).toBeNull();
    }
  });
  it("keeps personal pages on either application", () => {
    for (const path of ["/profile", "/profile/security", "/inbox", "/prepared", "/sign-off", "/access", "/auth"]) {
      expect(surfaceForPath(path)).toBe("shared");
      expect(canonicalRedirect({ url: `${ops}${path}` })).toBeNull();
      expect(canonicalRedirect({ url: `${app}${path}` })).toBeNull();
    }
  });
  it("opens the correct home and never loops", () => {
    expect(canonicalRedirect({ url: `${ops}/` })?.location).toBe(`${ops}/ops`);
    expect(canonicalRedirect({ url: `${app}/` })?.location).toBe(`${app}/home`);
    for (const base of [app, ops]) for (const path of ["/", "/home", "/ops", "/sales", "/marketing", "/profile"]) {
      expect(redirectSettles(`${base}${path}`)).toBe(true);
    }
  });
  it("does not move public, unknown, white-label or preview addresses", () => {
    for (const host of ["harmonious.co", "www.harmonious.co", "app.example.harmonious.co", "localhost:8080", "id-preview--example.lovable.app"]) {
      expect(canonicalRedirect({ url: `https://${host}/` })).toBeNull();
    }
    expect(applicationSurfaceForHost("app.example.harmonious.co")).toBe("client");
    expect(applicationSurfaceForHost("ops.harmonious.co.attacker.test")).toBeNull();
  });
  it("keeps mixed staff/client accounts in the correct menu on shared pages", () => {
    const client = getNavigation(mixed, "operations", "/profile", "client");
    expect(client.shell).toBe("client");
    expect(client.primary.map((item) => item.title)).toContain("My Funds");
    const staff = getNavigation(mixed, "investor", "/inbox", "ops");
    expect(staff.shell).toBe("ops");
    expect(staff.primary).toEqual([]);
  });
  it("cannot invent staff access from the host", () => {
    expect(getNavigation({ operations: false, workspaces: mixed.workspaces.filter((workspace) => workspace.surface === "client") }, "investor", "/profile", "ops").shell).toBe("client");
    expect(getNavigation(null, null, "/ops", "ops").operations).toEqual([]);
  });
  it("leaves for both applications but keeps preview switches local", () => {
    expect(workspaceLeavesCurrentHost("ops.harmonious.co", app)).toBe(true);
    expect(workspaceLeavesCurrentHost("app.harmonious.co", ops)).toBe(true);
    expect(workspaceLeavesCurrentHost("ops.harmonious.co", ops)).toBe(false);
    expect(workspaceLeavesCurrentHost("localhost:8080", ops)).toBe(false);
  });
});