import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

describe("reusing an open signing request", () => {
  it("treats a request cancelled in the signing service as closed", async () => {
    const { mapSignStatus } = await import("./box.server");
    expect(mapSignStatus("cancelled")).toBe("cancelled");
    expect(mapSignStatus("declined")).toBe("cancelled");
    expect(mapSignStatus("viewed")).toBe("out_for_signature");
  });
  it("no-sign-in links reopen only a live, current copy and replace blank ones", () => {
    const src = readFileSync("src/lib/document-signing.server.ts", "utf8");
    expect(src).toMatch(/liveSigner\?\.embedUrl && mapSignStatus\(String\(live\?\.status \?\? ""\)\) === "out_for_signature"/);
    expect(src).toMatch(/openRequestReusable\(/);
    expect(src).toMatch(/cancelSignRequest\(agreementId\)/);
  });
  it("portal and NDA signing never reopen a cancelled request", () => {
    for (const f of ["src/lib/box-sign.functions.ts", "src/lib/nda-sign.functions.ts"]) {
      expect(readFileSync(f, "utf8")).toMatch(/live\?\.signingUrl && mapSignStatus\(String\(live\.status \?\? ""\)\) === "out_for_signature"/);
    }
  });
  it("a subscription copy sent before prefill is not reusable", async () => {
    const { openRequestReusable } = await import("./signing-source-pin");
    expect(openRequestReusable({ sentAt: "2026-11-23T19:17:46Z", documentCategory: "subscription_agreement" })).toBe(false);
  });
});
