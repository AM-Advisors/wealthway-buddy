import { linkExpiry } from "@/lib/signing-access-link";

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Issues a fresh link, replacing any earlier active link for the same investor and document. */
export async function issueSigningLink(admin: any, input: { onboardingId: string; offeringId: string; documentId: string; email: string; createdBy: string }) {
  const now = new Date().toISOString();
  await admin.from("signing_access_links").update({ revoked_at: now })
    .eq("onboarding_id", input.onboardingId).eq("offering_document_id", input.documentId).is("revoked_at", null).is("used_at", null);
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const { error } = await admin.from("signing_access_links").insert({
    token_hash: await hashToken(token), onboarding_id: input.onboardingId, offering_id: input.offeringId,
    offering_document_id: input.documentId, signer_email: input.email.trim().toLowerCase(), expires_at: linkExpiry(), created_by: input.createdBy,
  });
  if (error) throw new Error("The signing link could not be created. Please try again.");
  return token;
}
