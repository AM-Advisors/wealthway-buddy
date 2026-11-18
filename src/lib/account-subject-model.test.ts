import { describe, expect, it } from "vitest";
import { resolveAccountSubject } from "./account-subject-model";

describe("resolveAccountSubject", () => {
  it("keeps a login account id as is", () => {
    expect(resolveAccountSubject("u1", { loginExists: true, person: null })).toEqual({ kind: "account", userId: "u1" });
  });
  it("sends a person record id to that person's login account", () => {
    expect(resolveAccountSubject("p1", { loginExists: false, person: { user_id: "u9" } })).toEqual({ kind: "person_with_login", userId: "u9" });
  });
  it("reports a person who has never created a login", () => {
    expect(resolveAccountSubject("p1", { loginExists: false, person: { user_id: null, legal_first_name: "Ana", legal_last_name: "Ruiz", email: "a@x.com" } })).toEqual({ kind: "person_without_login", name: "Ana Ruiz", email: "a@x.com" });
  });
  it("reports an id that matches nothing", () => {
    expect(resolveAccountSubject("x", { loginExists: false, person: null })).toEqual({ kind: "unknown" });
  });
});
