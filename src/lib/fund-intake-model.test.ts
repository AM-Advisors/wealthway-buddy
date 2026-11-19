import { describe, expect, it } from "vitest";
import { amountToCents, groupInvestors, guessSort, investorFileDestination, investorFileKind, parseFolderLink } from "@/lib/fund-intake-model";

const blank = { firstName: null, middleName: null, lastName: null, email: null, phone: null, profileType: null, entityName: null, addressLine1: null, addressLine2: null, city: null, region: null, postalCode: null, country: null, citizenship: null, amount: null, preferredName: null, entityType: null, jurisdiction: null, trustType: null, mailingAddress: null, dateOfBirth: null, commitment: null, investmentDate: null, units: null, related: [] };

describe("folder links", () => {
  it("reads Google Drive folder links", () => {
    expect(parseFolderLink("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMn?usp=sharing")).toMatchObject({ provider: "drive", id: "1AbCdEfGhIjKlMn" });
    expect(parseFolderLink("https://drive.google.com/open?id=1AbCdEfGhIjKlMn")).toMatchObject({ provider: "drive", id: "1AbCdEfGhIjKlMn" });
  });
  it("reads Box folder and shared links", () => {
    expect(parseFolderLink("https://app.box.com/folder/123456789")).toMatchObject({ provider: "box", kind: "folder", id: "123456789" });
    expect(parseFolderLink("https://harmonious.app.box.com/s/abc123xyz789")).toMatchObject({ provider: "box", kind: "shared", id: "abc123xyz789" });
  });
  it("refuses anything else", () => {
    expect(parseFolderLink("https://dropbox.com/folder/1")).toBeNull();
    expect(parseFolderLink("http://drive.google.com/drive/folders/1AbCdEfGhIjKlMn")).toBeNull();
    expect(parseFolderLink("not a link")).toBeNull();
  });
});

describe("sorting files", () => {
  it("files in an Investors folder are investor forms", () => expect(guessSort("Smith.pdf", "Fund/Investors/Smith", "application/pdf")).toBe("investor"));
  it("formation documents are fund documents", () => expect(guessSort("Operating Agreement.pdf", "Fund", "application/pdf")).toBe("fund"));
  it("a W-9 at the top is an investor form", () => expect(guessSort("John Smith W-9.pdf", "Fund", "application/pdf")).toBe("investor"));
  it("spreadsheets and Word files are skipped because they can't be read", () => expect(guessSort("cap table.xlsx", "", null)).toBe("skip"));
});

describe("where investor files go", () => {
  it("signed subscriptions become earlier signed copies, never a new signature", () => {
    expect(investorFileDestination(investorFileKind("Subscription Agreement", "x.pdf"), false)).toEqual({ to: "prior_signed", priorKind: "subscription_agreement" });
  });
  it("a W-9 goes to review uploads on a new fund and to earlier signed copies on a migration", () => {
    expect(investorFileDestination("tax_form", false)).toEqual({ to: "upload", uploadKind: "tax_form" });
    expect(investorFileDestination("tax_form", true)).toEqual({ to: "prior_signed", priorKind: "tax_form" });
  });
  it("IDs go to uploads for Verification review", () => expect(investorFileDestination(investorFileKind("Passport", "a.jpg"), true)).toEqual({ to: "upload", uploadKind: "identification" }));
});

describe("grouping investors across files", () => {
  it("same email in two files is one investor with both files", () => {
    const g = groupInvestors([
      { fileId: "1", fileName: "W9.pdf", documentKind: "W-9", investors: [{ ...blank, firstName: "Ann", lastName: "Lee", email: "ann@x.com" }] },
      { fileId: "2", fileName: "Sub.pdf", documentKind: "Subscription", investors: [{ ...blank, firstName: "Ann", lastName: "Lee", email: "ANN@x.com", amount: "50,000" }] },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]!.files.map((f) => f.kind)).toEqual(["tax_form", "signed_subscription"]);
    expect(g[0]!.investor.amount).toBe("50,000");
  });
  it("a trust and its trustee stay separate", () => {
    const g = groupInvestors([{ fileId: "1", fileName: "a.pdf", documentKind: "Sub", investors: [{ ...blank, firstName: "Ann", lastName: "Lee" }, { ...blank, entityName: "Lee Family Trust" }] }]);
    expect(g).toHaveLength(2);
  });
  it("amounts parse to cents", () => { expect(amountToCents("$50,000")).toBe(5_000_000); expect(amountToCents("about 50k")).toBeNull(); });
});

import { investorFileDestination as dest2, investorFileKind as kind2 } from "./fund-intake-model";
describe("capital account statements in a shared folder pull", () => {
  it("are kept on the investment as earlier records on new and migration funds", () => {
    expect(kind2("Capital account statement", "Q4.pdf")).toBe("capital_account_statement");
    expect(dest2("capital_account_statement", false)).toEqual({ to: "prior_signed", priorKind: "capital_account_statement" });
    expect(dest2("capital_account_statement", true)).toEqual({ to: "prior_signed", priorKind: "capital_account_statement" });
  });
});
