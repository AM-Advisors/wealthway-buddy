import { describe, expect, it } from "vitest";
import { accountSessionStatus } from "./account-session-status";
const early = "2026-10-17T10:00:00Z", late = "2026-10-17T11:00:00Z";
describe("account session evidence", () => {
  it("reports unknown without evidence", () => expect(accountSessionStatus([], null, null).state).toBe("unknown"));
  it("records sign out", () => expect(accountSessionStatus([{event_type:"sign_out",created_at:late}],null,early)).toEqual({state:"sign_out_recorded",at:late}));
  it("new login supersedes old sign out", () => expect(accountSessionStatus([{event_type:"sign_out",created_at:early}],null,late).state).toBe("sign_in_recorded"));
  it("signing out other sessions is not this session signing out", () => expect(accountSessionStatus([{event_type:"sign_out",action:"signed out other sessions",created_at:late}],null,early).state).toBe("sign_in_recorded"));
  it("revocation supersedes old login", () => expect(accountSessionStatus([],late,early).state).toBe("revoked"));
  it("new login supersedes old revocation", () => expect(accountSessionStatus([],early,late).state).toBe("sign_in_recorded"));
  it("records timeout", () => expect(accountSessionStatus([{event_type:"session_timeout",created_at:late}],null,early).state).toBe("timeout_recorded"));
  it("page activity does not prove login", () => expect(accountSessionStatus([{event_type:"page_view",created_at:late}],null,null).state).toBe("unknown"));
});
