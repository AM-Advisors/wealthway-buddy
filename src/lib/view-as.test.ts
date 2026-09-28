import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sessionIsLive, subjectAllowed, reasonRequired, VIEW_AS_COPY } from "./view-as";

const server = readFileSync("src/lib/view-as.server.ts", "utf8");
const fns = readFileSync("src/lib/view-as.functions.ts", "utf8");
const ui = readFileSync("src/components/view-as.tsx", "utf8");
const fnBody = (name: string) => {
  const s = server.indexOf(`export async function ${name}(`);
  const e = server.indexOf("\nexport async function ", s + 10);
  return server.slice(s, e === -1 ? undefined : e);
};
const row = { staff_user_id: "s1", auth_session_id: "sess", ended_at: null, expires_at: new Date(Date.now() + 60000).toISOString() };

describe("session safety", () => {
  it("live only for same staff, same sign-in, not ended, not expired", () => {
    expect(sessionIsLive(row, "s1", "sess")).toBe(true);
    expect(sessionIsLive(row, "s2", "sess")).toBe(false);
    expect(sessionIsLive(row, "s1", "other-signin")).toBe(false); // sign-out/in ends it
    expect(sessionIsLive({ ...row, ended_at: new Date().toISOString() }, "s1", "sess")).toBe(false);
    expect(sessionIsLive({ ...row, expires_at: new Date(Date.now() - 1).toISOString() }, "s1", "sess")).toBe(false);
    expect(sessionIsLive(null, "s1", "sess")).toBe(false);
  });
  it("starting a perspective ends any previous one (switching clears context)", () => {
    expect(fnBody("startViewAs")).toMatch(/end_reason: "switched"/);
  });
  it("sign-in session id comes from validated token claims, never request data", () => {
    expect(fns).toContain("claims?.session_id");
    expect(fns).not.toMatch(/authSessionId: z\./);
  });
});

describe("authorization", () => {
  it("staff can never view as another staff account", () => {
    expect(subjectAllowed({ isStaff: true })).toBe(false);
    expect(subjectAllowed({ isStaff: false })).toBe(true);
  });
  for (const f of ["listPerspectives", "startViewAs"]) {
    it(`${f} requires Harmonious staff`, () => expect(fnBody(f)).toContain("assertStaff(staffUserId)"));
  }
  it("resolve re-checks staff and canonical relationship on every call", () => {
    const b = fnBody("resolvePerspective");
    expect(b).toContain("actor.isStaff");
    expect(b).toContain("relationshipHolds");
  });
  it("fund manager perspective is fund-scoped; investor perspective is investment-scoped", () => {
    expect(server).toContain("subject.managedOfferingIds.includes(p.offeringId)");
    expect(server).toContain("data.investor_user_id === p.subjectUserId && data.offering_id === p.offeringId");
  });
  it("relationships never come from email, domain or name", () => {
    expect(server).not.toMatch(/email|ilike|domain/i);
  });
  it("tampered starts are refused and audited as denied", () => {
    expect(fnBody("startViewAs")).toContain('outcome: "denied"');
  });
  it("view screens take no client-supplied IDs", () => {
    for (const n of ["viewAsInvestmentFn", "viewAsFundFn", "activeViewAsFn"]) {
      const s = fns.indexOf(`export const ${n}`);
      const e = fns.indexOf("export const", s + 5);
      expect(fns.slice(s, e === -1 ? undefined : e)).not.toContain("inputValidator");
    }
  });
});

describe("read-only and no elevation", () => {
  it("client screens run through the subject's own server authorization and role-safe view", () => {
    expect(fnBody("viewAsInvestment")).toContain("investmentReadiness(p!.subjectUserId");
    expect(fnBody("viewAsFund")).toContain("fundReadiness(p!.subjectUserId");
  });
  for (const f of ["resolvePerspective", "activeViewAs", "viewAsInvestment", "viewAsFund"]) {
    it(`${f} performs no writes`, () => expect(fnBody(f)).not.toMatch(/\.(insert|update|upsert|delete)\(|recordAccessEvent/));
  }
  it("never touches authentication, tokens or client sign-in history", () => {
    expect(server).not.toMatch(/auth\.admin|generateLink|signIn|last_sign_in|setSession|access_token/);
  });
  it("the banner states the staff member is still signed in as staff and is read-only", () => {
    expect(ui).toContain("VIEW_AS_COPY.signedInAs");
    expect(VIEW_AS_COPY.signedInAs).toBe("You are signed in as Harmonious staff.");
    expect(ui).toContain("Exit Client View");
    expect(ui).toContain("Return to Harmonious Operations");
  });
});

describe("Edit as Harmonious", () => {
  it("is explicit, ends the read-only view and records staff attribution with the viewed perspective", () => {
    const b = fnBody("beginEditAsHarmonious");
    expect(b).toContain('attributed_to: "staff"');
    expect(b).toContain("actorUserId: staffUserId");
    expect(b).toContain("perspective: p!.perspective");
    expect(b).toContain('endViewAs(staffUserId, "edit_as_harmonious")');
  });
  it("never attributes to the client", () => {
    expect(server).not.toMatch(/actorUserId: p!?\.subjectUserId/);
  });
  it("material fields require a reason; trivial ones don't", () => {
    expect(reasonRequired("legal_name")).toBe(true);
    expect(reasonRequired("accepted_amount")).toBe(true);
    expect(reasonRequired("theme")).toBe(false);
  });
});
