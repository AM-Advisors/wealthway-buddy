/**
 * Documents loaded per investor were completed outside the platform. We assume
 * so, read the signatures, and only chase the party whose signature is missing.
 * Pure model: no reads, no writes.
 */
export type SignerRole = "investor" | "fund_manager";
export type ExpectedSigner = { role: SignerRole; name: string | null };
export type ReadResult = { investorSigned: boolean | null; fundSigned: boolean | null; confidence: "high" | "medium" | "low" } | null;
export type SignatureState = "complete" | "waiting" | "needs_check";

/** Who must sign each kind of investor document. Records with no signature (K-1s, statements) are omitted. */
export const SIGNATURE_ROLES: Partial<Record<string, SignerRole[]>> = {
  subscription_agreement: ["investor", "fund_manager"],
  side_letter: ["investor", "fund_manager"],
  operating_agreement: ["investor"],
  tax_form: ["investor"],
  ppm_acknowledgment: ["investor"],
};
export const needsSignatureCheck = (kind: string) => Boolean(SIGNATURE_ROLES[kind]);

export function evaluateSignatures(input: {
  expected: ExpectedSigner[]; read: ReadResult; platformSigned?: SignerRole[]; confirmedComplete?: boolean;
}): { state: SignatureState; found: SignerRole[]; missing: ExpectedSigner[] } {
  const platform = new Set(input.platformSigned ?? []);
  const seen = (role: SignerRole) => platform.has(role) || input.confirmedComplete === true
    || (role === "investor" ? input.read?.investorSigned === true : input.read?.fundSigned === true);
  const found = input.expected.filter((e) => seen(e.role)).map((e) => e.role);
  const missing = input.expected.filter((e) => !seen(e.role));
  if (!missing.length) return { state: "complete", found, missing };
  // Unreadable or unsure scans are never treated as missing a signature: a person checks.
  const unsure = !input.read || input.read.confidence === "low"
    || missing.some((m) => (m.role === "investor" ? input.read?.investorSigned : input.read?.fundSigned) == null);
  return { state: unsure ? "needs_check" : "waiting", found, missing };
}

export function waitingLabel(missing: ExpectedSigner[]): string {
  return missing.map((m) => `Waiting on ${m.name || (m.role === "investor" ? "the investor" : "the fund manager")}${m.role === "fund_manager" ? " (fund countersignature)" : ""}`).join(" · ");
}
