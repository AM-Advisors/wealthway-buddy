import { expect, it } from "vitest";
import { mayGenerateFundDocuments, generatedDocumentReviewError } from "./fund-document-generation-policy";
const draft = { created_by: "manager-a", version: 2, self_serve_review_state: "pending", generation_issues: [] };
it("Self Serve exact-fund managers can generate", () => expect(mayGenerateFundDocuments(false, true, "self_serve")).toBe(true));
it("another fund's manager cannot generate", () => expect(mayGenerateFundDocuments(false, false, "self_serve")).toBe(false));
it("unknown and paid levels do not grant generation", () => {
  expect(mayGenerateFundDocuments(false, true, "unknown")).toBe(false);
  expect(mayGenerateFundDocuments(false, true, "white_glove")).toBe(false);
});
it("a different reviewer may approve the exact current version", () => expect(generatedDocumentReviewError(draft, "manager-b", 2)).toBeNull());
it("preparers cannot self-approve", () => expect(generatedDocumentReviewError(draft, "manager-a", 2)).toContain("Another"));
it("stale versions cannot be approved", () => expect(generatedDocumentReviewError(draft, "manager-b", 3)).toContain("current"));
it("returned versions require a new draft", () => expect(generatedDocumentReviewError({ ...draft, self_serve_review_state: "returned" }, "manager-b", 2)).toContain("new version"));
it("unresolved legal conflicts block approval", () => expect(generatedDocumentReviewError({ ...draft, generation_issues: ["Fixed fee conflict"] }, "manager-b", 2)).toContain("conflicting"));