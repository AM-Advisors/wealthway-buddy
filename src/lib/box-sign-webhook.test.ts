import { describe, expect, it } from "vitest";
import { signRequestIdFromWebhook } from "@/lib/box-sign-webhook";

describe("signRequestIdFromWebhook", () => {
  it("reads the request id from additional_info, not the signed file in source", () => {
    expect(signRequestIdFromWebhook({
      trigger: "SIGN_REQUEST.COMPLETED",
      source: { id: "2610779108791", type: "file" },
      additional_info: { sign_request_id: "a6cb4bd3-1550-46cd-8838-118788a0eb75" },
    })).toBe("a6cb4bd3-1550-46cd-8838-118788a0eb75");
  });
  it("never treats a file id as a request id", () => {
    expect(signRequestIdFromWebhook({ source: { id: "2610779108791", type: "file" } })).toBeNull();
  });
  it("accepts a nested sign_request object", () => {
    expect(signRequestIdFromWebhook({ additional_info: { sign_request: { id: "abc" } } })).toBe("abc");
  });
});
