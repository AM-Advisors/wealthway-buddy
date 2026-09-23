/**
 * Normalised address comparison (pure, no I/O).
 *
 * Addresses are compared component by component, never as raw strings:
 * "100 North Main Street" and "100 N Main St" describe the same place and must
 * not be reported as a mismatch. Anything the comparison cannot settle becomes
 * a review, never a silent pass and never a silent overwrite.
 */

export type AddressComparison =
  | "match"
  | "format_only_difference"
  | "minor_difference"
  | "material_mismatch"
  | "unable_to_compare";

export const ADDRESS_COMPARISON_LABELS: Record<AddressComparison, string> = {
  match: "Match",
  format_only_difference: "Formatting difference only",
  minor_difference: "Minor difference",
  material_mismatch: "Material mismatch",
  unable_to_compare: "Unable to compare",
};

/** Comparisons that must not be accepted automatically. */
export function comparisonNeedsReview(result: AddressComparison): boolean {
  return result === "material_mismatch" || result === "unable_to_compare";
}

export interface ComparableAddress {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

const ABBREV: Record<string, string> = {
  street: "st",
  str: "st",
  avenue: "ave",
  av: "ave",
  road: "rd",
  drive: "dr",
  boulevard: "blvd",
  blvd: "blvd",
  lane: "ln",
  court: "ct",
  circle: "cir",
  place: "pl",
  square: "sq",
  terrace: "ter",
  parkway: "pkwy",
  highway: "hwy",
  suite: "ste",
  apartment: "apt",
  apartments: "apt",
  unit: "unit",
  number: "unit",
  building: "bldg",
  floor: "fl",
  north: "n",
  south: "s",
  east: "e",
  west: "w",
  northeast: "ne",
  northwest: "nw",
  southeast: "se",
  southwest: "sw",
  saint: "st",
  mount: "mt",
  fort: "ft",
};

const REGIONS: Record<string, string> = {
  alabama: "al",
  alaska: "ak",
  arizona: "az",
  arkansas: "ar",
  california: "ca",
  colorado: "co",
  connecticut: "ct",
  delaware: "de",
  florida: "fl",
  georgia: "ga",
  hawaii: "hi",
  idaho: "id",
  illinois: "il",
  indiana: "in",
  iowa: "ia",
  kansas: "ks",
  kentucky: "ky",
  louisiana: "la",
  maine: "me",
  maryland: "md",
  massachusetts: "ma",
  michigan: "mi",
  minnesota: "mn",
  mississippi: "ms",
  missouri: "mo",
  montana: "mt",
  nebraska: "ne",
  nevada: "nv",
  "new hampshire": "nh",
  "new jersey": "nj",
  "new mexico": "nm",
  "new york": "ny",
  "north carolina": "nc",
  "north dakota": "nd",
  ohio: "oh",
  oklahoma: "ok",
  oregon: "or",
  pennsylvania: "pa",
  "rhode island": "ri",
  "south carolina": "sc",
  "south dakota": "sd",
  tennessee: "tn",
  texas: "tx",
  utah: "ut",
  vermont: "vt",
  virginia: "va",
  washington: "wa",
  "west virginia": "wv",
  wisconsin: "wi",
  wyoming: "wy",
};

const UNIT_MARKERS = new Set(["apt", "ste", "unit", "bldg", "fl", "rm", "#"]);

function words(value: string | null | undefined): string[] {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9#\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ABBREV[w] ?? w);
}

export interface AddressComponents {
  streetNumber: string | null;
  route: string | null;
  unit: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
}

/** Splits free-form address lines into comparable components. */
export function componentsOf(address: ComparableAddress | null | undefined): AddressComponents {
  const line1 = words(address?.line1);
  const line2 = words(address?.line2);

  let streetNumber: string | null = null;
  const routeParts: string[] = [];
  const unitParts: string[] = [...line2];

  line1.forEach((token, index) => {
    if (index === 0 && /^\d+[a-z]?$/.test(token)) {
      streetNumber = token;
      return;
    }
    if (UNIT_MARKERS.has(token)) {
      unitParts.push(...line1.slice(index));
      return;
    }
    if (unitParts.length && line1.slice(0, index).some((t) => UNIT_MARKERS.has(t))) return;
    routeParts.push(token);
  });

  const unitTokens = unitParts.filter((t) => !UNIT_MARKERS.has(t) && t !== "#");
  const cityRaw = words(address?.city).join(" ");
  const regionRaw = words(address?.region).join(" ");
  const postal = String(address?.postalCode ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const country = String(address?.country ?? "").trim().toUpperCase() || null;

  return {
    streetNumber,
    route: routeParts.join(" ") || null,
    unit: unitTokens.join("") || null,
    city: cityRaw || null,
    region: REGIONS[regionRaw] ?? (regionRaw || null),
    postalCode: postal || null,
    country,
  };
}

function postalCore(value: string | null): string | null {
  if (!value) return null;
  // US ZIP+4 and UK/CA style spacing are compared on their leading block.
  return value.length > 5 && /^\d+$/.test(value) ? value.slice(0, 5) : value;
}

function rawString(address: ComparableAddress | null | undefined): string {
  return [
    address?.line1,
    address?.line2,
    address?.city,
    address?.region,
    address?.postalCode,
    address?.country,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export interface ComparisonDetail {
  result: AddressComparison;
  differences: string[];
  left: AddressComponents;
  right: AddressComponents;
}

/**
 * Compares two addresses component by component.
 *
 * Material differences (street number, street, town, country) are reported as
 * mismatches so they can be reviewed; formatting differences are not.
 */
export function compareAddressComponents(
  a: ComparableAddress | null | undefined,
  b: ComparableAddress | null | undefined,
): ComparisonDetail {
  const left = componentsOf(a);
  const right = componentsOf(b);

  const comparable = (c: AddressComponents) => Boolean(c.route && (c.city || c.postalCode));
  if (!a || !b || !comparable(left) || !comparable(right)) {
    return { result: "unable_to_compare", differences: ["Insufficient address detail to compare."], left, right };
  }

  const differences: string[] = [];
  let material = false;
  let minor = false;

  if (left.country && right.country && left.country !== right.country) {
    differences.push("Country differs");
    material = true;
  }
  if (left.route !== right.route) {
    differences.push("Street differs");
    material = true;
  }
  if (left.streetNumber && right.streetNumber && left.streetNumber !== right.streetNumber) {
    differences.push("Street number differs");
    material = true;
  } else if (Boolean(left.streetNumber) !== Boolean(right.streetNumber)) {
    differences.push("Street number missing on one side");
    minor = true;
  }

  const postalLeft = postalCore(left.postalCode);
  const postalRight = postalCore(right.postalCode);
  const cityEqual = left.city === right.city;
  const postalEqual = Boolean(postalLeft && postalRight && postalLeft === postalRight);

  if (postalLeft && postalRight && !postalEqual) {
    differences.push("Postal code differs");
    if (!cityEqual) material = true;
    else minor = true;
  } else if (Boolean(postalLeft) !== Boolean(postalRight)) {
    differences.push("Postal code missing on one side");
    minor = true;
  }

  if (!cityEqual) {
    differences.push("City differs");
    if (!postalEqual) material = true;
    else minor = true;
  }

  if (left.region && right.region && left.region !== right.region) {
    differences.push("State or region differs");
    if (!postalEqual) material = true;
    else minor = true;
  }

  if (left.unit && right.unit && left.unit !== right.unit) {
    differences.push("Unit differs");
    minor = true;
  } else if (Boolean(left.unit) !== Boolean(right.unit)) {
    differences.push("Unit present on one side only");
    minor = true;
  }

  if (material) return { result: "material_mismatch", differences, left, right };
  if (minor) return { result: "minor_difference", differences, left, right };
  if (rawString(a).toLowerCase() !== rawString(b).toLowerCase()) {
    return { result: "format_only_difference", differences: ["Formatting differs only."], left, right };
  }
  return { result: "match", differences: [], left, right };
}

/** Legacy three-way result used by the KYC decision rules. */
export function comparisonToMatch(
  result: AddressComparison,
): "match" | "partial" | "mismatch" | "unknown" {
  switch (result) {
    case "match":
    case "format_only_difference":
      return "match";
    case "minor_difference":
      return "partial";
    case "material_mismatch":
      return "mismatch";
    default:
      return "unknown";
  }
}
