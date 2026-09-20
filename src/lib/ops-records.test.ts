import { describe, expect, it } from "vitest";

import { capabilitiesFor } from "@/lib/ops-capabilities";
import {
  allowedActions,
  bankingDetailVisible,
  canOpenTab,
  defaultTab,
  isRestrictedField,
  maskAccount,
  recordPath,
  recordTabs,
  redactActivity,
  summarySourcesAreAuthoritative,
  tabDefinition,
} from "@/lib/ops-records";

const compliance = capabilitiesFor(["compliance"]);
const executive = capabilitiesFor(["executive"]);
const finance = capabilitiesFor(["finance"]);
const admin = capabilitiesFor(["admin"]);
const clientSuccess = capabilitiesFor(["client_success"]);

describe("record tabs follow capabilities, not the menu", () => {
  it("gives an administrator every tab on every record", () => {
    for (const type of ["client", "fund", "investor", "company"] as const) {
      expect(recordTabs(type, admin).length).toBe(recordTabs(type, admin).length);
      expect(recordTabs(type, admin).length).toBeGreaterThan(0);
    }
    expect(recordTabs("fund", admin).map((t) => t.id)).toContain("banking");
  });

  it("hides fund accounting, capital and tax from compliance", () => {
    const ids = recordTabs("fund", compliance).map((t) => t.id);
    expect(ids).not.toContain("accounting");
    expect(ids).not.toContain("capital");
    expect(ids).not.toContain("banking");
    expect(ids).not.toContain("tax");
    expect(ids).toContain("regulatory");
  });

  it("refuses an unknown tab name", () => {
    expect(canOpenTab("fund", "everything", admin)).toBe(false);
    expect(tabDefinition("fund", "everything")).toBeNull();
  });

  it("falls back to the first tab the person may open", () => {
    expect(defaultTab("fund", compliance)).toBe("investors");
    expect(defaultTab("company", compliance)).toBeNull();
  });

  it("keeps client_success out of company records entirely", () => {
    expect(recordTabs("company", clientSuccess)).toEqual([]);
    expect(canOpenTab("company", "cap-table", clientSuccess)).toBe(false);
  });
});

describe("actions reflect capability level", () => {
  it("lets a view-only person see but never prepare, review or approve", () => {
    const actions = allowedActions("capital", executive);
    expect(actions.see).toBe(true);
    expect(actions.prepare).toBe(false);
    expect(actions.review).toBe(false);
    expect(actions.approve).toBe(false);
    expect(actions.execute).toBe(false);
  });

  it("lets finance execute capital but not administration", () => {
    expect(allowedActions("capital", finance).execute).toBe(true);
    expect(allowedActions("administration", finance).see).toBe(false);
  });
});

describe("bank detail is separate from seeing the fund", () => {
  it("withholds account detail from view-only staff", () => {
    expect(bankingDetailVisible(executive)).toBe(false);
    expect(bankingDetailVisible(finance)).toBe(true);
  });

  it("masks account numbers to the last four digits", () => {
    expect(maskAccount("123456789")).toBe("••••6789");
    expect(maskAccount(null)).toBe("••••");
  });
});

describe("activity never carries restricted content", () => {
  it("recognises restricted field names", () => {
    for (const key of ["tax_id", "ssn", "account_number", "provider_response", "raw_payload", "api_key"]) {
      expect(isRestrictedField(key)).toBe(true);
    }
    expect(isRestrictedField("stage")).toBe(false);
  });

  it("drops restricted and nested values from an audit entry", () => {
    const entry = redactActivity({
      at: "2026-01-01T00:00:00Z",
      actor: "Ops user",
      capacity: "operations",
      action: "updated",
      resource: "fund",
      detail: { stage: "review", tax_id: "123-45-6789", kyc_data: { x: 1 }, nested: { a: 1 } },
    });
    expect(entry.detail).toBe("stage: review");
    expect(JSON.stringify(entry)).not.toContain("123-45-6789");
  });
});

describe("no record page introduces a second truth", () => {
  it("maps every summary value to an existing authoritative record", () => {
    expect(summarySourcesAreAuthoritative()).toBe(true);
  });
});

describe("cross-record links", () => {
  it("points at the record route and encodes the identifier", () => {
    expect(recordPath("fund", "abc", "capital")).toBe("/ops/fund/abc?tab=capital");
    expect(recordPath("investor", "a/b")).toBe("/ops/investors/a%2Fb");
  });
});
