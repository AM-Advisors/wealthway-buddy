import { describe, expect, it } from "vitest";
import { autofillGuardProps } from "./autofill-guard";

describe("autofillGuardProps", () => {
  it("tells password managers to ignore plain data-entry boxes", () => {
    expect(autofillGuardProps(undefined, undefined)).toMatchObject({ "data-lpignore": "true", "data-1p-ignore": "true", autoComplete: "off" });
  });
  it("ignores boxes already marked autocomplete off", () => {
    expect(autofillGuardProps("text", "off")["data-lpignore"]).toBe("true");
  });
  it("keeps autofill for password boxes", () => {
    expect(autofillGuardProps("password", undefined)).toEqual({});
  });
  it("keeps autofill for sign-in email and one-time codes", () => {
    expect(autofillGuardProps("email", "email")).toEqual({});
    expect(autofillGuardProps("text", "one-time-code")).toEqual({});
  });
});
