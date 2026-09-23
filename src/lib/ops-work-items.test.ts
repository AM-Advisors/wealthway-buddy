import { describe, expect, it } from "vitest";

import {
  ASSIGNMENT_SOURCES,
  DUE_DATE_SOURCES,
  UNCONFIGURED_AREAS,
  applyFilters,
  destinationFor,
  filterByCapability,
  groupBySection,
  isUnconfigured,
  mayReceive,
  paginate,
  priorityFor,
  requiredCapability,
  sectionOf,
  sortItems,
  summaryIsSafe,
  type WorkItem,
} from "@/lib/ops-work-items";
import { capabilitiesFor } from "@/lib/ops-capabilities";

const NOW = new Date("2026-03-10T00:00:00Z");

const item = (over: Partial<WorkItem> = {}): WorkItem => ({
  id: "i1",
  source: "onboarding.review",
  area: "onboarding",
  recordType: "investor",
  recordId: "inv-1",
  recordTab: "identity",
  title: "Investor One — identity check",
  reason: "Submitted for review",
  workflowState: "review",
  requiredAction: "review",
  priority: "normal",
  at: "2026-03-01T00:00:00Z",
  ...over,
});

describe("a work item says which capability it needs", () => {
  it("names the area and the step", () => {
    expect(requiredCapability(item())).toBe("onboarding:review");
  });

  it("is withheld from someone who may only look at the area", () => {
    const executive = capabilitiesFor(["executive"]); // see-only everywhere
    expect(mayReceive(item(), executive)).toBe(false);
    expect(mayReceive(item({ requiredAction: "see" }), executive)).toBe(true);
  });

  it("is withheld entirely from an area the person cannot see", () => {
    const tax = capabilitiesFor(["tax"]);
    expect(mayReceive(item({ area: "onboarding" }), tax)).toBe(false);
  });

  it("filters a list server-side rather than hiding rows later", () => {
    const compliance = capabilitiesFor(["compliance"]);
    const items = [
      item({ id: "a", area: "onboarding", requiredAction: "review" }),
      item({ id: "b", area: "accounting", requiredAction: "review" }),
      item({ id: "c", area: "capital", requiredAction: "approve" }),
    ];
    expect(filterByCapability(items, compliance).map((i) => i.id)).toEqual(["a"]);
  });
});

describe("priority comes from conditions, never from a guess", () => {
  it("treats a passed deadline as critical", () => {
    expect(priorityFor({ area: "capital", requiredAction: "review", dueDate: "2026-03-01" }, NOW)).toBe(
      "critical",
    );
  });

  it("treats a blocked financial item as critical", () => {
    expect(priorityFor({ area: "accounting", requiredAction: "review", blocked: true }, NOW)).toBe(
      "critical",
    );
  });

  it("treats a near deadline and an approval as high", () => {
    expect(priorityFor({ area: "capital", requiredAction: "review", dueDate: "2026-03-14" }, NOW)).toBe(
      "high",
    );
    expect(priorityFor({ area: "accounting", requiredAction: "approve" }, NOW)).toBe("high");
  });

  it("falls back to neutral when nothing authoritative is known", () => {
    expect(priorityFor({ area: "documents", requiredAction: "review" }, NOW)).toBe("normal");
  });

  it("ignores an unreadable date instead of inventing urgency", () => {
    expect(priorityFor({ area: "documents", requiredAction: "review", dueDate: "soon" }, NOW)).toBe(
      "normal",
    );
  });
});

describe("sections", () => {
  it("routes each item by what it is waiting for", () => {
    expect(sectionOf(item({ requiredAction: "prepare" }), NOW)).toBe("preparation");
    expect(sectionOf(item({ requiredAction: "review" }), NOW)).toBe("review");
    expect(sectionOf(item({ requiredAction: "approve" }), NOW)).toBe("approval");
    expect(sectionOf(item({ blocked: true, requiredAction: "approve" }), NOW)).toBe("blocked");
    expect(sectionOf(item({ dueDate: "2026-03-12" }), NOW)).toBe("due_soon");
  });

  it("keeps Due soon to real dates only", () => {
    const grouped = groupBySection([item({ id: "x" }), item({ id: "y", dueDate: "2026-03-11" })], NOW);
    expect(grouped.due_soon.map((i) => i.id)).toEqual(["y"]);
    expect(grouped.due_soon.every((i) => Boolean(i.dueDate))).toBe(true);
  });

  it("puts the most urgent work first", () => {
    const sorted = sortItems([
      item({ id: "low", priority: "low" }),
      item({ id: "crit", priority: "critical" }),
      item({ id: "norm", priority: "normal" }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["crit", "norm", "low"]);
  });
});

describe("filters narrow and never widen", () => {
  const items = [
    item({ id: "a", fundId: "fund-a", clientId: "client-a", assignedTo: "me" }),
    item({ id: "b", fundId: "fund-b", clientId: "client-b" }),
    item({ id: "c", fundId: "fund-a", clientId: "client-a", blocked: true, priority: "critical" }),
  ];

  it("narrows by fund, client, priority and blocked", () => {
    expect(applyFilters(items, { fundId: "fund-a" }, "me", NOW).map((i) => i.id)).toEqual(["a", "c"]);
    expect(applyFilters(items, { clientId: "client-b" }, "me", NOW).map((i) => i.id)).toEqual(["b"]);
    expect(applyFilters(items, { blocked: true }, "me", NOW).map((i) => i.id)).toEqual(["c"]);
    expect(applyFilters(items, { priority: "critical" }, "me", NOW).map((i) => i.id)).toEqual(["c"]);
  });

  it("separates my work from everything I am allowed to see", () => {
    expect(applyFilters(items, { scope: "mine" }, "me", NOW).map((i) => i.id)).toEqual(["a"]);
    expect(applyFilters(items, { scope: "all" }, "me", NOW)).toHaveLength(3);
  });

  it("cannot add an item that was not already in the list", () => {
    const narrowed = applyFilters(items, { fundId: "fund-z" }, "me", NOW);
    expect(narrowed).toHaveLength(0);
  });
});

describe("queue summaries carry nothing restricted", () => {
  it("accepts an ordinary summary", () => {
    expect(summaryIsSafe(item())).toBe(true);
  });

  it("rejects an account number or a tax identifier in the words shown", () => {
    expect(summaryIsSafe(item({ reason: "Wire to account 123456789" }))).toBe(false);
    expect(summaryIsSafe(item({ blockReason: "Mismatch for 123-45-6789" }))).toBe(false);
  });
});

describe("items open the record where the work is done", () => {
  it("deep links to the right tab", () => {
    expect(destinationFor(item())).toBe("/ops/investors/inv-1?tab=identity");
    expect(
      destinationFor(item({ recordType: "fund", recordId: "fund-a", recordTab: "banking" })),
    ).toBe("/ops/fund/fund-a?tab=banking");
    expect(
      destinationFor(item({ recordType: "company", recordId: "co-1", recordTab: "cap-table" })),
    ).toBe("/ops/companies/co-1?tab=cap-table");
  });
});

describe("areas without authoritative workflow say so", () => {
  it("names tax and regulatory, and no longer distributions", () => {
    expect(UNCONFIGURED_AREAS.map((a) => a.area).sort()).toEqual(["regulatory", "tax"]);
    expect(isUnconfigured("distributions")).toBe(false);

    expect(isUnconfigured("tax")).toBe(true);
    expect(isUnconfigured("onboarding")).toBe(false);
    for (const entry of UNCONFIGURED_AREAS) expect(entry.message).toMatch(/not been configured/);
  });
});

describe("assignment and due dates are only read from real columns", () => {
  it("names a table and column for each", () => {
    for (const source of Object.values(ASSIGNMENT_SOURCES)) expect(source).toMatch(/^[a-z_]+\.[a-z_]+$/);
    for (const source of Object.values(DUE_DATE_SOURCES)) expect(source).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });
});

describe("paging happens before anything reaches the browser", () => {
  it("returns one page and the true total", () => {
    const many = Array.from({ length: 25 }, (_, i) => item({ id: `i${i}` }));
    const page = paginate(many, 2, 10);
    expect(page.rows).toHaveLength(10);
    expect(page.total).toBe(25);
    expect(page.pages).toBe(3);
  });
});
