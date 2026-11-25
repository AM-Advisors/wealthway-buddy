import { describe, expect, it } from "vitest";
import { consolidateOpsMenus, dedupeNav, navUrlIsActive, type NavEntry, type NavGroup } from "./ops-nav-registry";

const entry = (id: string, url: string): NavEntry => ({ id, url, title: id, icon: "tasks" });
const urls = (groups: NavGroup[]) => new Set(groups.flatMap((g) => g.items.flatMap((i) => [i.url, ...(i.sub ?? []).map((s) => s.url)])));
const fixture = (): NavGroup[] => [
  { id: "operations", label: "Operations", items: [
    entry("ops-command", "/ops/command-center"), entry("dash-ops", "/ops/dashboards/operations"),
    entry("approvals", "/ops/approvals"), entry("queue", "/ops/queue"), entry("stalled", "/ops/stalled"),
    entry("investor-progress", "/ops/investor-progress"), entry("verifications", "/ops/verifications"), entry("investors", "/ops/investors"),
  ] },
  { id: "team", label: "Team", items: [entry("tasks", "/ops/tasks"), entry("tech", "/ops/tech"), entry("software-issues", "/ops/software-issues"), entry("client-approvals", "/ops/client-approvals")] },
];

describe("Operations menu consolidation", () => {
  it("preserves every existing entitled destination while reducing top-level choices", () => {
    const original = fixture();
    const result = dedupeNav(consolidateOpsMenus(original));
    expect(urls(result)).toEqual(urls(original));
    expect(result.flatMap((g) => g.items)).toHaveLength(5);
    expect(original[0]?.items).toHaveLength(8);
  });
  it("never adds investor or review destinations absent from the caller's menu", () => {
    const original = [{ id: "operations", label: "Operations", items: [entry("verifications", "/ops/verifications")] }];
    expect(urls(consolidateOpsMenus(original))).toEqual(new Set(["/ops/verifications"]));
  });
  it("keeps ordinary tasks separate from review and software work", () => {
    const result = consolidateOpsMenus(fixture());
    expect(result.find((g) => g.id === "team")?.items.map((i) => i.id)).toEqual(["tasks", "software-work"]);
  });
  it("keeps outstanding alerts on a combined menu", () => {
    const result = consolidateOpsMenus([{ id: "team", label: "Team", items: [entry("tech", "/ops/tech"), { ...entry("software-issues", "/ops/software-issues"), badge: 3 }] }]);
    expect(result[0]?.items[0]?.badge).toBe(3);
  });
  it("removes duplicate parent links without losing unique child destinations", () => {
    const result = dedupeNav([{ id: "a", label: "a", items: [entry("a", "/ops/security-compliance")] },
      { id: "b", label: "b", items: [{ ...entry("b", "/ops/security-compliance"), sub: [{ title: "Security", url: "/ops/security-compliance" }, { title: "Audit", url: "/admin/audit" }] }] }]);
    expect(result[1]?.items[0]?.url).toBe("/admin/audit");
    expect(result[1]?.items[0]?.sub).toEqual([{ title: "Audit", url: "/admin/audit" }]);
  });
  it("distinguishes command-center views and exact child paths", () => {
    expect(navUrlIsActive("/ops/command-center?view=approvals", "/ops/command-center", "?view=approvals")).toBe(true);
    expect(navUrlIsActive("/ops/command-center?view=requests", "/ops/command-center", "?view=approvals")).toBe(false);
    expect(navUrlIsActive("/ops/investors", "/ops/investors/fictional")).toBe(true);
    expect(navUrlIsActive("/ops/investors", "/ops/investor-progress")).toBe(false);
  });
});