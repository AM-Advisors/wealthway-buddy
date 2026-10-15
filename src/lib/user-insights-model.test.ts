import { describe, expect, it } from "vitest";
import { emailOutcome, parseEmailAttempt, setupGaps, type EmailAttempt } from "./user-insights-model";
const attempt: EmailAttempt = { id: "a", at: "2026-10-15T00:00:00Z", status: "sent", messageId: "new", actorId: "staff", kind: "Invitation" };
describe("invitation email truth", () => {
  it("does not label uncorrelated history delivered", () => expect(emailOutcome(null, []).status).toBe("Confirmation unavailable"));
  it("API acceptance is sent, not delivered", () => expect(emailOutcome(attempt, []).status).toBe("Sent"));
  it("matches the exact send, not an old resend", () => expect(emailOutcome(attempt, [{ messageId: "old", event: "delivered", date: attempt.at }]).status).toBe("Sent"));
  it("accepts explicit delivered proof", () => expect(emailOutcome(attempt, [{ messageId: "new", event: "delivered", date: attempt.at }]).status).toBe("Delivered"));
  it("a bounce overrides earlier delivery", () => expect(emailOutcome(attempt, [{ messageId: "new", event: "delivered", date: attempt.at }, { messageId: "new", event: "hardBounces", date: "2026-10-15T01:00:00Z" }]).status).toBe("Bounced"));
  it("provider unavailable never implies delivery", () => expect(emailOutcome(attempt, [{ messageId: "new", event: "delivered", date: attempt.at }], true).status).toBe("Sent"));
  it("a failed send stays failed", () => expect(emailOutcome({ ...attempt, status: "failed" }, []).status).toBe("Failed"));
  it("handles blocked sends", () => expect(emailOutcome(attempt, [{ messageId: "new", event: "blocked", date: attempt.at }]).status).toBe("Blocked"));
  it("does not infer delivery from opens", () => expect(emailOutcome(attempt, [{ messageId: "new", event: "opened", date: attempt.at }]).status).toBe("Sent"));
  it("ignores old free-form audit reasons", () => expect(parseEmailAttempt({ action: "invite_resent", reason: "old note" })).toBeNull());
  it("parses safe audit metadata", () => expect(parseEmailAttempt({ action: "email_sent", id: "1", created_at: attempt.at, actor_id: "2", reason: JSON.stringify({ version: 1, provider: "brevo", messageId: "new" }) })?.messageId).toBe("new"));
  it("staff have no investor-only gaps", () => expect(setupGaps({ legal_first_name: "QA", legal_last_name: "Staff", email: "staff@example.test", phone: "123" }, true)).toEqual([]));
  it("uses authoritative verification state", () => expect(setupGaps({ legal_first_name: "QA", legal_last_name: "Person", email: "qa@example.test", phone: "123", address_line1: "Address", city: "City", region: "ST", postal_code: "12345", kyc_status: "in_review", aml_status: "approved" })).toEqual(["KYC"]));
});