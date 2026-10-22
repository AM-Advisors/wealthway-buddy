import { describe, expect, it } from "vitest";
import { parseCommitmentCents } from "./invite-amount";

describe("parseCommitmentCents", () => {
  it("parses formatted dollars", () => expect(parseCommitmentCents("$250,000")).toBe(25_000_000));
  it("blank is optional", () => expect(parseCommitmentCents("  ")).toBeNull());
  it("rejects text", () => expect(parseCommitmentCents("abc")).toBe("invalid"));
  it("rejects zero", () => expect(parseCommitmentCents("0")).toBe("invalid"));
});
