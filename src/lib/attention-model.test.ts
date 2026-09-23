/**
 * Rules for the Action Center: grouping, ordering, safe wording and the
 * refusal to invent a status or a deadline.
 */
import { describe, expect, it } from "vitest";

import {
  ATTENTION_GAPS,
  ATTENTION_GROUPS,
  DUE_DATE_SOURCES,
  attentionIsSafe,
  buildAttentionItem,
  groupAttention,
  hasPlainStatus,
  plainStatus,
  safeItems,
  sortAttention,
  type AttentionItem,
} from "@/lib/attention-model";

function item(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return buildAttentionItem({
    id: overrides.id ?? "a",
    source: "investor.identity",
    workspace: "investor",
    group: "needs_you",
    severity: "action",
    title: "Identity verification",
    workflowState: "kyc_required",
    sourceTable: "investor_applications",
    sourceId: "app-1",
    href: "/onboarding/kyc",
    at: "2026-09-01T00:00:00Z",
    ...overrides,
  } as any);
}

describe("plain status wording", () => {
  it("translates an internal state into client language", () => {
    expect(plainStatus("kyc_pending")).toBe("Harmonious is reviewing your identity verification");
  });

  it("describes a detected transfer without claiming it is settled", () => {
    expect(plainStatus("processing")).toBe("Transfer detected — Harmonious is confirming it");
  });

  it("shows an unmapped state rather than hiding it", () => {
    expect(plainStatus("some_new_state")).toBe("Some new state");
    expect(hasPlainStatus("some_new_state")).toBe(false);
  });

  it("says the status is not available when there is none", () => {
    expect(plainStatus("")).toBe("Status not available");
  });

  it("never replaces the stored state on the item", () => {
    const built = item({ workflowState: "kyc_pending" });
    expect(built.workflowState).toBe("kyc_pending");
    expect(built.status).not.toBe("kyc_pending");
  });
});

describe("due dates", () => {
  it("keeps a due date when a source column is named", () => {
    const built = item({
      dueDate: "2026-10-01",
      dueDateSource: "capital_call_lines.due_date",
    } as any);
    expect(built.dueDate).toBe("2026-10-01");
  });

  it("drops a due date that no authoritative column supplied", () => {
    const built = item({ dueDate: "2026-10-01" } as any);
    expect(built.dueDate).toBeNull();
    expect(built.dueDateSource).toBeNull();
  });

  it("names a real column for every due date it may show", () => {
    for (const source of Object.values(DUE_DATE_SOURCES)) {
      expect(source).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });
});

describe("grouping and ordering", () => {
  it("places every item in exactly one of the four groups", () => {
    const groups = groupAttention([
      item({ id: "1", group: "needs_you" }),
      item({ id: "2", group: "harmonious_working" }),
      item({ id: "3", group: "waiting_third_party" }),
      item({ id: "4", group: "recently_completed" }),
    ]);
    expect(ATTENTION_GROUPS.map((g) => groups[g].length)).toEqual([1, 1, 1, 1]);
  });

  it("never shows the same source record twice", () => {
    const groups = groupAttention([item({ id: "dup" }), item({ id: "dup" })]);
    expect(groups.needs_you).toHaveLength(1);
  });

  it("puts urgent items first, then the nearest real deadline", () => {
    const sorted = sortAttention([
      item({ id: "later", severity: "action", dueDate: "2026-12-01", dueDateSource: "x.y" } as any),
      item({ id: "urgent", severity: "critical" }),
      item({ id: "soon", severity: "action", dueDate: "2026-10-01", dueDateSource: "x.y" } as any),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["urgent", "soon", "later"]);
  });
});

describe("safety", () => {
  it("rejects an item carrying an account number field", () => {
    const unsafe = { ...item(), account_number: "12345678" } as any;
    expect(attentionIsSafe(unsafe)).toBe(false);
  });

  it("rejects wording containing a long reference or a social security number", () => {
    expect(attentionIsSafe(item({ title: "Wire 998877665544" }))).toBe(false);
    expect(attentionIsSafe(item({ status: "ID 123-45-6789" }))).toBe(false);
  });

  it("rejects a link that leaves the application", () => {
    expect(attentionIsSafe(item({ href: "https://example.com" }))).toBe(false);
    expect(attentionIsSafe(item({ href: "//example.com" }))).toBe(false);
  });

  it("filters unsafe items out before anything leaves the server", () => {
    const kept = safeItems([item({ id: "ok" }), item({ id: "bad", href: "https://x.test" })]);
    expect(kept.map((i) => i.id)).toEqual(["ok"]);
  });
});

describe("gaps", () => {
  it("says an unconfigured area is unconfigured instead of showing a clear state", () => {
    expect(ATTENTION_GAPS["tax_operations"]!.message).toMatch(/not been configured/i);
    expect(ATTENTION_GAPS["regulatory"]!.message).toMatch(/not been configured/i);
  });
});
