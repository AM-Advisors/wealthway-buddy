import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cell, humanise } from "./ops-record";

const html = (v: unknown) => renderToStaticMarkup(<>{v as any}</>);

describe("ops record labels", () => {
  it("shows status codes as readable labels", () => {
    expect(html(cell("status", "in_progress"))).toContain("In progress");
    expect(html(cell("accreditation", "not_started"))).toContain("Not started");
    expect(html(cell("kyc", "approved"))).toContain("Approved");
    expect(html(cell("status", "in_progress"))).not.toContain("in_progress");
  });
  it("capitalizes compliance acronyms in headings", () => {
    expect(humanise("kyc")).toBe("KYC");
    expect(humanise("aml")).toBe("AML");
    expect(humanise("legal_name")).toBe("Legal name");
  });
});
