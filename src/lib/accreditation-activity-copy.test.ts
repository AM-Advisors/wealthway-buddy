import { describe, expect, it } from "vitest";
import { accreditationActivityCopy, accreditationActivityRef, type AccreditationActivity } from "@/lib/accreditation-activity-copy";

const investor = "Kimberly Girardi";
const fund = "ROAS Hedge LP";

describe("accreditationActivityCopy", () => {
  it("describes an investor proof upload with the file name", () => {
    const copy = accreditationActivityCopy(
      { kind: "evidence_uploaded", fileName: "w2-2025.pdf", docKind: "tax_return", documentId: "doc-1" },
      investor,
      fund,
    );
    expect(copy.headline).toContain("Accreditation proof uploaded");
    expect(copy.headline).toContain(fund);
    expect(copy.intro).toContain(investor);
    expect(copy.intro).toContain("waiting for review");
    expect(copy.details).toContainEqual({ label: "File", value: "w2-2025.pdf" });
  });

  it("describes a verification-letter request with the professional and role", () => {
    const copy = accreditationActivityCopy(
      { kind: "professional_request_sent", professionalName: "Pat Reyes", professionalRole: "cpa", requestId: "req-1", resent: false },
      investor,
      fund,
    );
    expect(copy.headline).toContain("Verification letter requested");
    expect(copy.intro).toContain("Pat Reyes");
    expect(copy.intro).toContain("certified public accountant");
    expect(copy.intro).not.toContain("sent again");
    expect(copy.details).toContainEqual({ label: "Role", value: "Certified public accountant" });
  });

  it("notes when a request link was sent again", () => {
    const copy = accreditationActivityCopy(
      { kind: "professional_request_sent", professionalName: "Pat Reyes", professionalRole: "attorney", requestId: "req-1", resent: true },
      investor,
      fund,
    );
    expect(copy.intro).toContain("sent again");
    expect(copy.intro).toContain("attorney");
  });

  it("describes a letter uploaded by the professional", () => {
    const copy = accreditationActivityCopy(
      { kind: "professional_letter_uploaded", professionalName: "Pat Reyes", documentId: "doc-9", requestId: "req-1" },
      investor,
      fund,
    );
    expect(copy.headline).toContain("Verification letter received");
    expect(copy.intro).toContain("Pat Reyes");
    expect(copy.intro).toContain(investor);
    expect(copy.intro).toContain("waiting for review");
  });

  it("falls back to a neutral role label for unknown roles", () => {
    const copy = accreditationActivityCopy(
      { kind: "professional_request_sent", professionalName: "Pat Reyes", professionalRole: "other", requestId: "req-2", resent: false },
      investor,
      fund,
    );
    expect(copy.details).toContainEqual({ label: "Role", value: "Professional" });
  });
});

describe("accreditationActivityRef", () => {
  it("keys evidence uploads by document id", () => {
    const event: AccreditationActivity = { kind: "evidence_uploaded", fileName: "a.pdf", docKind: "tax_return", documentId: "doc-1" };
    expect(accreditationActivityRef(event)).toBe("accreditation:evidence:doc-1");
  });

  it("distinguishes a first send from a resend of the same request", () => {
    const sent: AccreditationActivity = { kind: "professional_request_sent", professionalName: "P", professionalRole: "cpa", requestId: "req-1", resent: false };
    const resent: AccreditationActivity = { ...sent, resent: true };
    expect(accreditationActivityRef(sent)).not.toBe(accreditationActivityRef(resent));
  });

  it("keys professional letters by request id", () => {
    const event: AccreditationActivity = { kind: "professional_letter_uploaded", professionalName: "P", documentId: "doc-9", requestId: "req-1" };
    expect(accreditationActivityRef(event)).toBe("accreditation:letter:req-1");
  });
});
