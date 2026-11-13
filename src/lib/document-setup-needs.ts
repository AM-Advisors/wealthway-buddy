/**
 * Fund details that the fund's documents need. A fund using Harmonious templates must record
 * every fund detail those templates fill in; template documents also record the blanks they
 * could not fill (generation_issues). Each blank maps to the setup detail that fills it and
 * stays a setup to-do until that detail is recorded. Purely a projection: it never edits
 * documents or approves anything.
 */
export type SetupNeedKey =
  | "legalName" | "gpName" | "minInvestment" | "entityType" | "stateFormed" | "registeredAgent"
  | "principalAddress" | "contactPhone" | "arbitrationCity" | "arbitrationState" | "fundTerm" | "fiscalYearEnd"
  | "signatoryName" | "signatoryTitle" | "contactEmail"
  | "managementFee" | "carry" | "hurdle" | "feeBasis";
/** Where the detail is entered: Fund details, the fund signatory, or the fees and carry. */
export type SetupNeedStep = "fund_details" | "signatory" | "economics";
export type SetupNeed = { key: SetupNeedKey; label: string; step: SetupNeedStep };

export const norm = (k: string) => k.toLowerCase().replace(/[’']s\b/g, "").replace(/[^a-z0-9]/g, "");

const NEED: Record<SetupNeedKey, { label: string; step: SetupNeedStep }> = {
  legalName: { label: "Legal fund name", step: "fund_details" },
  gpName: { label: "Fund manager / GP name", step: "fund_details" },
  minInvestment: { label: "Minimum investment", step: "fund_details" },
  entityType: { label: "Entity type", step: "fund_details" },
  stateFormed: { label: "Formation state", step: "fund_details" },
  registeredAgent: { label: "Registered agent", step: "fund_details" },
  principalAddress: { label: "Principal business address", step: "fund_details" },
  contactPhone: { label: "Fund phone number", step: "fund_details" },
  arbitrationCity: { label: "Arbitration city", step: "fund_details" },
  arbitrationState: { label: "Arbitration state", step: "fund_details" },
  fundTerm: { label: "Fund term", step: "fund_details" },
  fiscalYearEnd: { label: "Fiscal year end", step: "fund_details" },
  signatoryName: { label: "Fund signatory", step: "signatory" },
  signatoryTitle: { label: "Fund signatory title", step: "signatory" },
  contactEmail: { label: "Fund signatory email", step: "signatory" },
  managementFee: { label: "Management fee", step: "economics" },
  carry: { label: "Carried interest", step: "economics" },
  hurdle: { label: "Preferred return", step: "economics" },
  feeBasis: { label: "Management fee basis", step: "economics" },
};

/** Every fund-level placeholder spelling the Harmonious templates use (see fundTemplateValues). */
const BLANK_TO_NEED: Record<string, SetupNeedKey> = {
  fundname: "legalName", fundlegalname: "legalName", legalfundname: "legalName", legalname: "legalName",
  fundmanager: "gpName", fundmanagername: "gpName", managername: "gpName", fundadvisername: "gpName", organizer: "gpName",
  generalpartnername: "gpName", specialmanagerentities: "gpName",
  minimumsubscriptionamount: "minInvestment", minimuminvestment: "minInvestment", subscriptionamount: "minInvestment",
  entitytype: "entityType",
  state: "stateFormed", stateformed: "stateFormed",
  registeredagent: "registeredAgent",
  address: "principalAddress", manageraddress: "principalAddress", principalofficeaddress: "principalAddress",
  addressline1: "principalAddress", addresscity: "principalAddress", addressstate: "principalAddress", addresszip: "principalAddress",
  managerphone: "contactPhone", phone: "contactPhone", tel: "contactPhone", telephone: "contactPhone", fundphone: "contactPhone",
  arbitrationcity: "arbitrationCity",
  arbitrationstate: "arbitrationState",
  fundterm: "fundTerm",
  fiscalyearend: "fiscalYearEnd",
  signatorylegalname: "signatoryName", fundmanagersignatory: "signatoryName", fundmanagersignatoryname: "signatoryName",
  signatorytitle: "signatoryTitle", fundmanagersignatorytitle: "signatoryTitle",
  email: "contactEmail", manageremail: "contactEmail",
  managementfee: "managementFee",
  carrypercent: "carry", carryamount: "carry",
  hurdlepercent: "hurdle", preferredreturn: "hurdle",
  managementfeebasis: "feeBasis",
};

/** The setup detail a document blank needs, or null when it is not a fund setup detail. */
export function setupNeedForBlank(blank: string): SetupNeedKey | null {
  return BLANK_TO_NEED[norm(blank.replace(/^\{\{|\}\}$/g, ""))] ?? null;
}

/**
 * Setup details the fund's documents need and the fund has not recorded yet. `values` are the
 * fund's template values keyed by placeholder spelling (fundTemplateValues), so a detail is
 * required exactly when the template would otherwise be left blank.
 */
export function documentSetupNeeds(blanks: string[], values: Record<string, unknown>): SetupNeed[] {
  const filled = new Map<string, boolean>();
  for (const [k, v] of Object.entries(values)) if (v != null && String(v).trim() !== "") filled.set(norm(k), true);
  const out: SetupNeed[] = [];
  for (const blank of blanks) {
    const key = setupNeedForBlank(blank);
    if (!key || out.some((n) => n.key === key)) continue;
    if (filled.get(norm(blank.replace(/^\{\{|\}\}$/g, "")))) continue;
    out.push({ key, ...NEED[key] });
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
