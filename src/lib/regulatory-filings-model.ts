/**
 * Pure Form D / Blue Sky status projection. Reads recorded facts only
 * (first sale date, funded investors' states, prepared and recorded filings)
 * and never files, pays or guesses a legal requirement: a state can only be
 * cleared by a recorded filing or a staff "Not required" with a reason.
 */

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  PR: "Puerto Rico", GU: "Guam", VI: "U.S. Virgin Islands",
};

const BY_NAME = new Map(Object.entries(US_STATES).map(([code, name]) => [name.toUpperCase().replace(/[^A-Z ]/g, ""), code]));
BY_NAME.set("US VIRGIN ISLANDS", "VI");
BY_NAME.set("WASHINGTON DC", "DC");

/** Two-letter code from a recorded state/region, or null when it can't be read with certainty. */
export function normalizeUsState(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").toUpperCase().replace(/\./g, "").replace(/[^A-Z ,]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (US_STATES[s]) return s;
  const plain = s.replace(/,/g, "").trim();
  if (BY_NAME.has(plain)) return BY_NAME.get(plain)!;
  // "Austin, TX" or "Shelley Idaho": the last part names the state.
  const words = plain.split(" ");
  for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
    const tail = words.slice(-n).join(" ");
    if (BY_NAME.has(tail)) return BY_NAME.get(tail)!;
  }
  const last = s.split(",").pop()!.trim();
  if (s.includes(",") && US_STATES[last]) return last;
  return null;
}

export const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const formDDueDate = (firstSale: string) => addDays(firstSale, 15);

export type Responsibility = "not_applicable" | "required" | "harmonious" | "client_counsel" | null;
export type FilingRecord = { kind: "form_d" | "blue_sky"; jurisdiction: string; status: "prepared" | "filed" | "not_required"; filedOn: string | null; isAmendment?: boolean };
export type FundedInvestor = { region: string | null; amountCents: number };

export type FilingStage = "not_needed" | "needs_first_sale" | "not_started" | "prepared" | "filed";
export type FundFilingStatus = {
  formD: { stage: FilingStage; dueOn: string | null; overdue: boolean; filedOn: string | null; annualAmendmentDue: string | null };
  blueSky: { required: string[]; filed: string[]; notRequired: string[]; prepared: string[]; outstanding: string[] };
  investorsMissingState: number;
  fundedInvestors: number;
  fundedCents: number;
  harmoniousFiles: boolean;
  responsibilityLabel: string;
  nextStep: string;
  urgency: "overdue" | "due_soon" | "open" | "done" | "not_needed";
};

const RESP: Record<string, string> = { harmonious: "Harmonious files", client_counsel: "Client or counsel files", not_applicable: "Not applicable", required: "Required, not assigned" };

export function fundFilingStatus(i: {
  regType: string | null; formD: Responsibility; blueSky: Responsibility; firstSaleOn: string | null;
  investors: FundedInvestor[]; filings: FilingRecord[]; today: string;
}): FundFilingStatus {
  const exempt = i.regType === "506b" || i.regType === "506c";
  const formDNeeded = exempt && i.formD !== "not_applicable";
  const states = new Set<string>(); let missing = 0;
  for (const v of i.investors) { const c = normalizeUsState(v.region); if (c) states.add(c); else missing++; }
  const fds = i.filings.filter((f) => f.kind === "form_d");
  const filedD = fds.filter((f) => f.status === "filed").map((f) => f.filedOn).filter(Boolean).sort() as string[];
  const firstFiled = filedD[0] ?? null; const lastFiled = filedD[filedD.length - 1] ?? null;
  const dNotRequired = fds.some((f) => f.status === "not_required");
  const dPrepared = fds.some((f) => f.status === "prepared");
  const dueOn = i.firstSaleOn ? formDDueDate(i.firstSaleOn) : null;
  let stage: FilingStage = !formDNeeded || dNotRequired ? "not_needed" : firstFiled ? "filed" : dPrepared ? "prepared" : !i.investors.length && !i.firstSaleOn ? "not_needed" : !i.firstSaleOn ? "needs_first_sale" : "not_started";
  if (firstFiled && dPrepared) stage = "prepared"; // amendment in progress
  const overdue = !!dueOn && !firstFiled && stage !== "not_needed" && dueOn < i.today;
  const annualAmendmentDue = lastFiled ? addDays(lastFiled, 365) : null;

  const bsNeeded = exempt && i.blueSky !== "not_applicable";
  const by = (s: FilingRecord["status"]) => new Set(i.filings.filter((f) => f.kind === "blue_sky" && f.status === s).map((f) => normalizeUsState(f.jurisdiction) ?? f.jurisdiction));
  const filed = by("filed"), notReq = by("not_required"), prep = by("prepared");
  const required = bsNeeded ? [...states].sort() : [];
  const outstanding = required.filter((s) => !filed.has(s) && !notReq.has(s));

  const harmoniousFiles = i.formD === "harmonious" || i.blueSky === "harmonious";
  const responsibilityLabel = i.formD === i.blueSky ? (RESP[i.formD ?? ""] ?? "Who files not set") : `Form D: ${RESP[i.formD ?? ""] ?? "not set"} · Blue Sky: ${RESP[i.blueSky ?? ""] ?? "not set"}`;

  let nextStep = "Nothing to file";
  if (stage === "needs_first_sale") nextStep = "Record the date of first sale";
  else if (stage === "not_started") nextStep = "Prepare the Form D";
  else if (stage === "prepared") nextStep = "File the Form D on EDGAR, then record it";
  else if (outstanding.some((s) => !prep.has(s))) nextStep = `Prepare state notices: ${outstanding.filter((s) => !prep.has(s)).join(", ")}`;
  else if (outstanding.length) nextStep = `File and record state notices: ${outstanding.join(", ")}`;
  else if (missing && required.length + missing > 0 && formDNeeded) nextStep = `Add the state for ${missing} investor${missing === 1 ? "" : "s"}`;
  else if (annualAmendmentDue) nextStep = "Annual Form D amendment";
  if (stage !== "not_needed" && stage !== "filed" && missing && nextStep.startsWith("Prepare")) nextStep += ` · ${missing} investor${missing === 1 ? "" : "s"} missing a state`;
  if (!i.formD && formDNeeded && (i.investors.length || i.firstSaleOn)) nextStep = `Set who files · ${nextStep}`;

  const openWork = stage === "needs_first_sale" || stage === "not_started" || stage === "prepared" || outstanding.length > 0 || (missing > 0 && formDNeeded && i.investors.length > 0);
  const soon = !!dueOn && !firstFiled && dueOn <= addDays(i.today, 7);
  const urgency: FundFilingStatus["urgency"] = overdue ? "overdue" : soon && openWork ? "due_soon" : openWork ? "open" : stage === "not_needed" && !required.length ? "not_needed" : "done";

  return {
    formD: { stage, dueOn, overdue, filedOn: firstFiled, annualAmendmentDue },
    blueSky: { required, filed: [...filed].sort(), notRequired: [...notReq].sort(), prepared: [...prep].filter((s) => !filed.has(s)).sort(), outstanding },
    investorsMissingState: missing,
    fundedInvestors: i.investors.length,
    fundedCents: i.investors.reduce((a, v) => a + (v.amountCents || 0), 0),
    harmoniousFiles, responsibilityLabel, nextStep, urgency,
  };
}

export type FundFilingOverview = {
  firstSaleOn: string | null; suggestedFirstSaleOn: string | null; regType: string | null;
  formDResponsibility: Responsibility; blueSkyResponsibility: Responsibility; status: FundFilingStatus;
};
