/** Shared address parsing/composition. The fund record stores the principal address as one line; the setup form edits it as separate fields. */
export type AddressParts = {
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
};

const EMPTY: AddressParts = { addressLine1: "", addressLine2: "", addressCity: "", addressState: "", addressZip: "" };

const STATE_ZIP = /^([A-Za-z .#\-]{2,})\s+(\d{5}(?:-\d{4})?)$/;

export function parseAddressParts(addr: string | null | undefined): AddressParts {
  const a = String(addr ?? "").replace(/\s+/g, " ").trim();
  if (!a) return { ...EMPTY };
  const tokens = a.split(",").map((t) => t.trim()).filter(Boolean);
  const last = tokens[tokens.length - 1] ?? "";
  const m = last.match(STATE_ZIP);
  if (m && tokens.length >= 2) {
    const state = m[1]!.trim();
    const zip = m[2]!;
    const street = tokens.slice(0, tokens.length - 2);
    const city = tokens.length >= 3 ? tokens[tokens.length - 2]! : "";
    const [line1, line2] = street.length >= 2 ? [street[0]!, street.slice(1).join(", ")] : [street[0] ?? "", ""];
    if (street.length === 0 && !city) return { ...EMPTY, addressState: state, addressZip: zip };
    return { addressLine1: line1, addressLine2: line2, addressCity: city, addressState: state, addressZip: zip };
  }
  if (tokens.length >= 2) return { ...EMPTY, addressLine1: tokens[0]!, addressLine2: tokens.slice(1).join(", ") };
  return { ...EMPTY, addressLine1: a };
}

export function composeAddress(p: Partial<AddressParts>): string {
  const lines = [p.addressLine1, p.addressLine2].map((x) => (x ?? "").trim()).filter(Boolean);
  const tail = [
    (p.addressCity ?? "").trim(),
    [(p.addressState ?? "").trim(), (p.addressZip ?? "").trim()].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
  return [...lines, tail].filter(Boolean).join(", ");
}
