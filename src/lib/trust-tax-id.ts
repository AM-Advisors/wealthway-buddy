import { isEntityProfile } from "./profile-kind";

export type ProfileTaxIdType = "ssn" | "itin" | "ein";

/** Trusts explicitly choose SSN or EIN; never infer an SSN from an EIN's digits. */
export function profileTaxIdType(profileType: unknown, requested: ProfileTaxIdType | undefined, current: unknown, digits: string): ProfileTaxIdType {
  if (profileType === "trust") {
    if (requested === "itin") throw new Error("Choose a trustee's SSN or a separate EIN for this trust.");
    return requested ?? (current === "ssn" ? "ssn" : "ein");
  }
  if (isEntityProfile(profileType)) {
    if (requested && requested !== "ein") throw new Error("This entity needs an EIN.");
    return "ein";
  }
  return requested ?? (digits.startsWith("9") ? "itin" : "ssn");
}