import { describe, expect, it } from "vitest";
import { mergeTrustPeople, ssnLabel } from "./trust-people-model";

const base = { roles: ["beneficial owner"], ownershipPercent: 50, signer: true, email: null, login: "Invited", accessLabel: "x", kyc: "not_started", aml: "not_started", idCards: 0, documents: [], activity: [] };

describe("trust people", () => {
  it("shows one SSN status per person", () => {
    expect(ssnLabel(false, null)).toBe("Needed");
    expect(ssnLabel(true, null)).toBe("On file");
    expect(ssnLabel(true, "4376")).toBe("On file, ending 4376");
  });
  it("identity reader's last four wins over a stale party flag", () => {
    const [p] = mergeTrustPeople([{ ...base, personId: "a", name: "Kim", ssnOnFile: false }], [{ personId: "a", ssnLast4: "1234", cards: [{}] }]);
    expect(p?.ssnLabel).toBe("On file, ending 1234");
    expect(p?.idCardCount).toBe(1);
  });
  it("without identity access, SSN stays a yes/no", () => {
    const [p] = mergeTrustPeople([{ ...base, personId: "a", name: "Joe", ssnOnFile: true }], null);
    expect(p?.ssnLabel).toBe("On file");
    expect(p?.hasIdentity).toBe(false);
  });
});
