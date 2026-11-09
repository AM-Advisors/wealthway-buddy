import { describe, expect, it } from "vitest";
import { pickUserContact } from "@/lib/user-contact.server";

describe("user contact for notices and reminders", () => {
  it("uses the investor's legal name when there is no profile row", () => {
    const c = pickUserContact(null, { legal_first_name: "Dinesh", legal_last_name: "Kanawade", email: null }, "kanawade_d@yahoo.com");
    expect(c).toEqual({ name: "Dinesh Kanawade", email: "kanawade_d@yahoo.com" });
  });
  it("falls back to the profile name and email for staff accounts", () => {
    expect(pickUserContact({ legal_name: "Jenner Smith", email: "jenner@harmonious.co" }, null)).toEqual({ name: "Jenner Smith", email: "jenner@harmonious.co" });
  });
  it("returns nothing when no record has a name or email", () => {
    expect(pickUserContact(null, null, null)).toEqual({ name: null, email: null });
  });
});
