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

describe("batched contacts for recording lists", () => {
  it("names an investor with no profile row from their verified legal name", async () => {
    const { loadUserContacts } = await import("@/lib/user-contact.server");
    const q = (rows: any[]) => { const b: any = { select: () => b, in: () => b, is: () => b, then: (f: any) => Promise.resolve({ data: rows }).then(f) }; return b; };
    const db = {
      from: (t: string) => q(t === "persons" ? [{ user_id: "u1", legal_first_name: "Dinesh", legal_last_name: "Kanawade", email: null }] : [{ user_id: "u2", legal_name: "Jenner Smith", email: "jenner@harmonious.co" }]),
      auth: { admin: { getUserById: async () => ({ data: { user: { email: "kanawade_d@yahoo.com" } } }) } },
    };
    const m = await loadUserContacts(db, ["u1", "u2", "u1"]);
    expect(m.get("u1")).toEqual({ name: "Dinesh Kanawade", email: "kanawade_d@yahoo.com" });
    expect(m.get("u2")).toEqual({ name: "Jenner Smith", email: "jenner@harmonious.co" });
  });
});
