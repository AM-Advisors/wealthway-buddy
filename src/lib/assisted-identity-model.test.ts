import { describe, expect, it } from "vitest";
import { ASSISTED_DAILY_LIMIT, assistedCanRun, assistedOutcome, assistedTriesLeft, missingRecordDetails, namesMatch } from "./assisted-identity-model";

const rec = { firstName: "Kimberly", lastName: "Morgan", dateOfBirth: "1980-04-02" };
const id = { status: "Approved", firstName: "KIMBERLY ANN", lastName: "MORGAN", dateOfBirth: "1980-04-02", expirationDate: "2030-01-01" };
const today = "2026-11-23";

describe("helper-run identity check", () => {
  it("clears with no selfie when the ID is genuine and name and birthday match", () => {
    expect(assistedOutcome(rec, id, today)).toEqual({ cleared: true, reasons: [] });
  });
  it("does not clear when the provider did not approve the ID", () => {
    expect(assistedOutcome(rec, { ...id, status: "In Review" }, today).cleared).toBe(false);
    expect(assistedOutcome(rec, { ...id, status: "Declined" }, today).cleared).toBe(false);
  });
  it("does not clear when the birthday differs", () => {
    expect(assistedOutcome(rec, { ...id, dateOfBirth: "1980-04-03" }, today).cleared).toBe(false);
  });
  it("does not clear when the name differs", () => {
    expect(assistedOutcome(rec, { ...id, lastName: "Smith" }, today).cleared).toBe(false);
  });
  it("does not clear an expired ID", () => {
    expect(assistedOutcome(rec, { ...id, expirationDate: "2026-11-22" }, today).cleared).toBe(false);
  });
  it("ignores accents, case and extra middle names", () => {
    expect(namesMatch({ firstName: "José", lastName: "Núñez", dateOfBirth: null }, { status: null, firstName: "JOSE LUIS", lastName: "NUNEZ", dateOfBirth: null, expirationDate: null })).toBe(true);
  });
  it("needs name and birthday entered first", () => {
    expect(missingRecordDetails({ firstName: "A", lastName: "", dateOfBirth: null })).toEqual(["last name", "date of birth"]);
  });
  it("never overrides an approved or declined check", () => {
    expect(assistedCanRun("approved").ok).toBe(false);
    expect(assistedCanRun("declined").ok).toBe(false);
    expect(assistedCanRun("pending").ok).toBe(true);
    expect(assistedCanRun(null).ok).toBe(true);
  });
  it("allows three tries a day", () => {
    expect(ASSISTED_DAILY_LIMIT).toBe(3);
    expect(assistedTriesLeft(3)).toBe(0);
    expect(assistedTriesLeft(1)).toBe(2);
  });
});
