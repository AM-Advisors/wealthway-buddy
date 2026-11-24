/** Personal accounts (individual, joint, IRA, retirement plan) use SSNs and personal names; everything else is an entity or trust. */
export const PERSONAL_PROFILE_TYPES = new Set(["individual", "joint", "ira", "retirement_plan"]);
export const isEntityProfile = (t: unknown): boolean => typeof t === "string" && t !== "" && !PERSONAL_PROFILE_TYPES.has(t);
