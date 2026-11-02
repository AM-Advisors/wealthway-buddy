import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { fundTermWords, fiscalYearEndWords } from "./fund-doc-templates.server";

describe("template fields from recorded fund details", () => {
  it("120 months reads ten-year", () => expect(fundTermWords(120)).toBe("ten-year"));
  it("18 months reads 18-month", () => expect(fundTermWords(18)).toBe("18-month"));
  it("unrecorded term stays blank for review", () => expect(fundTermWords(null)).toBeNull());
  it("12-31 reads December 31", () => expect(fiscalYearEndWords("12-31")).toBe("December 31"));
  it("unrecorded fiscal year stays blank", () => expect(fiscalYearEndWords("")).toBeNull());
});
