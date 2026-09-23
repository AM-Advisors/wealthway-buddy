import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { INTERNAL_PATH_PREFIXES } from "@/lib/client-navigation";
import {
  can,
  canApprove,
  capabilitiesFor,
  hasOperationsEntry,
  OPS_HOME,
  opsNavigation,
} from "@/lib/ops-capabilities";

function routeFileFor(url: string): string {
  const path = (url.split("?")[0] ?? "").replace(/^\//, "");
  const segments = path.split("/").filter(Boolean);
  const base = segments.length === 0 ? "index" : segments.join(".");
  return [
    `src/routes/_authenticated/${base}.tsx`,
    `src/routes/_authenticated/${base}.index.tsx`,
  ].find((candidate) => existsSync(candidate)) ?? `src/routes/_authenticated/${base}.tsx`;
}

describe("who may open Operations", () => {
  it("lets an active Harmonious role in", () => {
    expect(hasOperationsEntry(["operations"])).toBe(true);
    expect(hasOperationsEntry(["tax"])).toBe(true);
  });

  it("keeps everyone else out, however they signed in", () => {
    expect(hasOperationsEntry([])).toBe(false);
    expect(hasOperationsEntry(["investor", "fund_manager"])).toBe(false);
    expect(hasOperationsEntry(["harmonious.co"])).toBe(false);
  });
});

describe("capabilities by role", () => {
  it("gives finance the money steps and nobody else the execution step", () => {
    expect(can(capabilitiesFor(["finance"]), "capital", "execute")).toBe(true);
    expect(can(capabilitiesFor(["operations"]), "capital", "execute")).toBe(false);
    expect(can(capabilitiesFor(["fund_administration"]), "capital", "execute")).toBe(false);
    expect(can(capabilitiesFor(["admin"]), "capital", "execute")).toBe(false);
  });

  it("stops operations at preparing, never approving", () => {
    const c = capabilitiesFor(["operations"]);
    expect(can(c, "funds", "prepare")).toBe(true);
    expect(can(c, "funds", "approve")).toBe(false);
  });

  it("lets an executive look without touching anything", () => {
    const c = capabilitiesFor(["executive"]);
    expect(can(c, "accounting", "see")).toBe(true);
    expect(can(c, "accounting", "prepare")).toBe(false);
    expect(can(c, "administration", "execute")).toBe(false);
  });

  it("adds up several roles held by one person", () => {
    const c = capabilitiesFor(["tax", "compliance"]);
    expect(can(c, "tax", "approve")).toBe(true);
    expect(can(c, "regulatory", "approve")).toBe(true);
    expect(can(c, "capital", "execute")).toBe(false);
  });

  it("gives an unknown role nothing at all", () => {
    expect(capabilitiesFor(["not_a_role"])).toEqual([]);
  });
});

describe("nobody approves their own work", () => {
  const capabilities = capabilitiesFor(["finance"]);

  it("refuses the person who prepared the item", () => {
    expect(
      canApprove({ capabilities, area: "capital", actorUserId: "u1", preparedByUserId: "u1" }),
    ).toBe(false);
  });

  it("allows a different approver who holds the capability", () => {
    expect(
      canApprove({ capabilities, area: "capital", actorUserId: "u2", preparedByUserId: "u1" }),
    ).toBe(true);
  });

  it("still refuses someone without the capability", () => {
    expect(
      canApprove({
        capabilities: capabilitiesFor(["operations"]),
        area: "capital",
        actorUserId: "u2",
        preparedByUserId: "u1",
      }),
    ).toBe(false);
  });
});

describe("the Operations menu", () => {
  it("shows only the sections the person may see", () => {
    expect(opsNavigation(capabilitiesFor(["tax"])).map((s) => s.id)).toEqual(["tax", "reports"]);
    expect(opsNavigation(capabilitiesFor([]))).toEqual([]);
  });

  it("goes somewhere real for every section", () => {
    for (const section of [OPS_HOME, ...opsNavigation(capabilitiesFor(["super_admin"]))]) {
      const file = section.url.startsWith("/ops/areas/")
        ? "src/routes/_authenticated/ops.areas.$area.tsx"
        : routeFileFor(section.url);
      expect(existsSync(file), `${section.title} → ${section.url}`).toBe(true);
    }
  });

  it("only ever points at Harmonious-only addresses", () => {
    for (const section of opsNavigation(capabilitiesFor(["super_admin"]))) {
      expect(
        INTERNAL_PATH_PREFIXES.some((prefix) => section.url.startsWith(prefix)),
        section.url,
      ).toBe(true);
    }
  });
});
