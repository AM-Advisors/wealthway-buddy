import { describe, expect, it } from "vitest";
import { initialContactProblem } from "./fund-initial-contact";

describe("initial contact", () => {
  it("needs a name", () => expect(initialContactProblem({ fullName: " ", email: "a@b.co" })).toBe("Enter the contact's name."));
  it("needs a way to reach them", () => expect(initialContactProblem({ fullName: "Hal Lambert" })).toBe("Add an email or phone so we can reach them."));
  it("accepts a phone with no email", () => expect(initialContactProblem({ fullName: "Hal Lambert", phone: "555-0100" })).toBeNull());
  it("accepts a client email", () => expect(initialContactProblem({ fullName: "Hal Lambert", email: "hal@fund.com" })).toBeNull());
  it("rejects Harmonious staff", () => expect(initialContactProblem({ fullName: "Alyssa", email: "Alyssa@Harmonious.co" })).toMatch(/Harmonious staff/));
  it("rejects a malformed email", () => expect(initialContactProblem({ fullName: "Hal", email: "hal@" })).toBe("That email doesn't look right."));
});
