import { canonicalVerificationStatus } from "@/lib/verification-status";

export type GovernmentIdReviewItem = {
  applicationId: string;
  documentType: string | null;
  issuingCountry: string | null;
  expiration: string | null;
  last4: string | null;
  providedByVerification: boolean;
  providerStatus: string | null;
  reviewStatus: string | null;
};

/** Display only. The server's canonical fund status must independently agree. */
export function projectGovernmentIdReview<T extends GovernmentIdReviewItem>(items: T[]) {
  const login = items.find((item) => item.applicationId.startsWith("login:"));
  return items.map((item) => {
    const usesLogin = Boolean(
      login &&
      !item.applicationId.startsWith("login:") &&
      canonicalVerificationStatus(login.reviewStatus) === "approved" &&
      canonicalVerificationStatus(item.reviewStatus) === "approved",
    );
    if (!usesLogin || !login) return { ...item, usesLogin: false, originalProviderStatus: null };
    return {
      ...item,
      documentType: login.documentType,
      issuingCountry: login.issuingCountry,
      expiration: login.expiration,
      last4: login.last4,
      providedByVerification: login.providedByVerification,
      providerStatus: login.providerStatus,
      usesLogin: true,
      originalProviderStatus: item.providerStatus,
    };
  });
}