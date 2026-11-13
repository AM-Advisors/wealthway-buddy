/**
 * Fund details that a fund document is still waiting on. Template documents record the
 * blanks they could not fill (generation_issues); each blank that maps to a fund setup
 * detail becomes a setup to-do until that detail is recorded. Purely a projection: it never
 * edits documents or approves anything.
 */
export type SetupNeedKey = "fundTerm" | "contactPhone" | "arbitrationCity" | "arbitrationState" | "principalAddress" | "signatoryTitle";
export type SetupNeed = { key: SetupNeedKey; label: string };

const norm = (k: string) => k.toLowerCase().replace(/[’']s\b/g, "").replace(/[^a-z0-9]/g, "");

const LABEL: Record<SetupNeedKey, string> = {
  fundTerm: "Fund term",
  contactPhone: "Fund phone number",
  arbitrationCity: "Arbitration city",
  arbitrationState: "Arbitration state",
  principalAddress: "Principal business address",
  signatoryTitle: "Fund signatory title",
};

const BLANK_TO_NEED: Record<string, SetupNeedKey> = {
  fundterm: "fundTerm",
  managerphone: "contactPhone", phone: "contactPhone", tel: "contactPhone", telephone: "contactPhone", fundphone: "contactPhone",
  arbitrationcity: "arbitrationCity",
  arbitrationstate: "arbitrationState",
  address: "principalAddress", manageraddress: "principalAddress", principalofficeaddress: "principalAddress",
  addressline1: "principalAddress", addresscity: "principalAddress", addressstate: "principalAddress", addresszip: "principalAddress",
  signatorytitle: "signatoryTitle", fundmanagersignatorytitle: "signatoryTitle",
};

/** The setup detail a document blank needs, or null when it is not a fund setup detail. */
export function setupNeedForBlank(blank: string): SetupNeedKey | null {
  return BLANK_TO_NEED[norm(blank.replace(/^\{\{|\}\}$/g, ""))] ?? null;
}

/** Setup details current fund documents still need and the fund has not recorded yet. */
export function documentSetupNeeds(issues: string[], recorded: Partial<Record<SetupNeedKey, unknown>>): SetupNeed[] {
  const out: SetupNeed[] = [];
  for (const issue of issues) {
    const key = setupNeedForBlank(issue);
    if (!key || out.some((n) => n.key === key)) continue;
    const v = recorded[key];
    if (v != null && String(v).trim() !== "") continue;
    out.push({ key, label: LABEL[key] });
  }
  return out;
}

/** "Add the fund term and fund phone number: a fund document needs them." */
export function documentNeedsMessage(needs: SetupNeed[]): string | null {
  if (!needs.length) return null;
  const names = needs.map((n) => n.label.toLowerCase());
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Add the ${list}: a fund document needs ${names.length === 1 ? "it" : "them"}`;
}
