import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { serviceError } from "@/lib/service-error";

const FILES = ["box", "gmail", "hubspot-ops-tickets", "linkedin-personal", "linkedin-direct", "hubspot-deal-migration", "marketing-queue", "marketing-publish", "marketing-imports", "marketing-drive", "fund-setup-guided", "drive", "drive-intake"].map((f) => `src/lib/${f}.server.ts`).concat("src/lib/diligence-assistant.functions.ts");

describe("outside-service error messages", () => {
  it("contain only service, action and status, no response text", () => {
    const body = '{"error":"invalid_grant","access_token":"secret123","email":"a@b.co"}';
    const e = serviceError("Box", "upload", 403);
    expect(e.message).toBe("Box upload failed (status 403).");
    for (const piece of ["invalid_grant", "secret123", "a@b.co", body]) expect(e.message).not.toContain(piece);
  });
  it("no changed file puts response text into a thrown error", () => {
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/throw new Error\([^)]*\$\{[^}]*(\.text\(\)|\btext\b|\bbody\b|\bt\b|\bb\b)[^}]*\}/);
    }
  });
});
