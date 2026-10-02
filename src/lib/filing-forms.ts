/**
 * Pure builders that lay out Form D (SEC Items 1-16) and state notice filing
 * fields from Harmonious records, in the order they appear on EDGAR / NASAA EFD.
 * Fields with no data on file are flagged needsEntry; nothing is guessed and
 * nothing is submitted. Staff copy these into EDGAR or EFD and file by hand.
 */
export type FormField = { label: string; value: string; needsEntry?: boolean };
export type FormSection = { title: string; fields: FormField[] };
export type FilingForm = { title: string; subtitle: string; where: string; sections: FormSection[]; notices: string[] };

export type FormInput = {
  filing: { filing_type: string; jurisdiction: string; is_amendment: boolean; investor_count: number; amount_cents: number; fee_cents: number | null; fee_needs_review: boolean; packet: any };
  offering: any;
  related: { name: string; role: string; address?: string | null }[];
  firstSaleDate: string | null;
};

const usd = (c: number | null | undefined) => (c == null ? "" : `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);
const f = (label: string, v: unknown): FormField => {
  const value = v == null ? "" : String(v).trim();
  return value ? { label, value } : { label, value: "", needsEntry: true };
};

const EXEMPTION: Record<string, string> = {
  "506b": "Rule 506(b)",
  "506c": "Rule 506(c)",
  regcf: "Not a Form D offering (Regulation Crowdfunding)",
  rega: "Not a Form D offering (Regulation A)",
  regaplus: "Not a Form D offering (Regulation A)",
};

export function buildFormD({ filing, offering: o, related, firstSaleDate }: FormInput): FilingForm {
  const p = filing.packet ?? {};
  const d = p.closeDetails ?? {};
  const year = o?.date_formed ? String(o.date_formed).slice(0, 4) : null;
  const sections: FormSection[] = [
    { title: "Item 1. Issuer's identity", fields: [
      f("Name of issuer", o?.legal_entity_name),
      f("Jurisdiction of incorporation / organization", o?.state_formed),
      f("Entity type", o?.entity_type),
      f("Year of incorporation / organization", year),
      { label: "Previous names", value: "None" },
    ] },
    { title: "Item 2. Principal place of business and contact information", fields: [
      f("Street address, city, state, ZIP", o?.principal_address),
      f("Issuer phone number", null),
    ] },
    { title: "Item 3. Related persons", fields: related.length
      ? related.flatMap((r, i) => [f(`Person ${i + 1} name`, r.name), f(`Person ${i + 1} relationship`, r.role), f(`Person ${i + 1} address`, r.address)])
      : [f("Related persons (executive officers, directors, promoters)", null)] },
    { title: "Item 4. Industry group", fields: [
      { label: "Industry group", value: "Pooled Investment Fund" },
      f("Fund type (hedge, private equity, venture capital, other)", o?.fund_type === "other" ? o?.fund_type_other : o?.fund_type ? String(o.fund_type).replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : null),
      f("Is the issuer registered as an investment company under the Investment Company Act of 1940?", "No"),
    ] },
    { title: "Item 5. Issuer size", fields: [{ label: "Aggregate net asset value range", value: "Decline to disclose" }] },
    { title: "Item 6. Federal exemptions and exclusions claimed", fields: [
      f("Securities Act exemption", EXEMPTION[o?.reg_type] ?? null),
      f("Investment Company Act exclusion (e.g. Section 3(c)(1) or 3(c)(7))", null),
    ] },
    { title: "Item 7. Type of filing", fields: [
      { label: "Type", value: filing.is_amendment ? "Amendment" : "New notice" },
      f("Date of first sale", firstSaleDate),
    ] },
    { title: "Item 8. Duration of offering", fields: [{ label: "Does the issuer intend this offering to last more than one year?", value: o?.rolling_closes ? "Yes" : "No" }] },
    { title: "Item 9. Type(s) of securities offered", fields: [{ label: "Securities", value: "Pooled Investment Fund Interests" }] },
    { title: "Item 10. Business combination transaction", fields: [{ label: "Is this offering made in connection with a business combination?", value: "No" }] },
    { title: "Item 11. Minimum investment", fields: [f("Minimum investment accepted from any outside investor", usd(o?.min_investment_cents))] },
    { title: "Item 12. Sales compensation", fields: d.brokerDealerFeesCents
      ? [f("Recipient (broker-dealer) name and CRD number", d.brokerDealerFeesDetail), f("States of solicitation", (p.states ?? []).join(", "))]
      : [{ label: "Recipient", value: "None" }] },
    { title: "Item 13. Offering and sales amounts", fields: [
      { label: "Total offering amount", value: o?.max_offering_cents ? usd(o.max_offering_cents) : "Indefinite" },
      { label: "Total amount sold", value: usd(filing.amount_cents) },
      { label: "Total remaining to be sold", value: o?.max_offering_cents ? usd(Math.max(0, o.max_offering_cents - filing.amount_cents)) : "Indefinite" },
    ] },
    { title: "Item 14. Investors", fields: [
      { label: "Number of investors who have already invested", value: String(filing.investor_count) },
      f("Number of non-accredited investors", o?.reg_type === "506c" ? "0" : null),
    ] },
    { title: "Item 15. Sales commissions and finders' fees", fields: [
      { label: "Sales commissions", value: usd(d.brokerDealerFeesCents ?? 0) },
      { label: "Finders' fees", value: "$0" },
    ] },
    { title: "Item 16. Use of proceeds", fields: [
      f("Amount paid to executive officers, directors or promoters", d.managementFeeCents != null ? usd(d.managementFeeCents) : null),
      { label: "Clarification", value: d.managementFeeCents != null ? "Management fee per the fund's operating agreement." : "" },
    ] },
    { title: "Signature and submission", fields: [
      f("Issuer", o?.legal_entity_name),
      f("Signer name", o?.signatory_entity_name ?? related[0]?.name),
      f("Signer title", o?.signatory_title),
      { label: "Date", value: "Date filed on EDGAR" },
    ] },
  ];
  return {
    title: `Form D${filing.is_amendment ? "/A" : ""} Notice of Exempt Offering of Securities`,
    subtitle: o?.legal_entity_name ?? o?.name ?? "",
    where: "File on SEC EDGAR (Form D online filing) using the issuer's EDGAR access codes. Due 15 days after the date of first sale.",
    sections,
    notices: ["Prepared by Harmonious for manual filing. Review every field before submitting. Fields marked NEEDS ENTRY have no data on file."],
  };
}

export function buildStateNotice({ filing, offering: o, firstSaleDate }: FormInput): FilingForm {
  const p = filing.packet ?? {};
  const st = filing.jurisdiction;
  const investors: any[] = p.investors ?? [];
  return {
    title: `${st} Rule 506 Notice Filing`,
    subtitle: o?.legal_entity_name ?? o?.name ?? "",
    where: `File through NASAA's Electronic Filing Depository (EFD) for ${st}, attaching the filed Form D. Most states require it within 15 days after the first sale in the state; confirm ${st}'s current rules on EFD.`,
    sections: [
      { title: "Issuer", fields: [f("Issuer name", o?.legal_entity_name), f("Jurisdiction of organization", o?.state_formed), f("Principal address", o?.principal_address), f("SEC file number / CIK (from EDGAR)", null)] },
      { title: "Offering in this state", fields: [
        { label: "State", value: st },
        f("Exemption", EXEMPTION[o?.reg_type] ?? null),
        { label: "Filing type", value: filing.is_amendment ? "Amendment" : "Initial notice" },
        f("Date of first sale in this state", firstSaleDate),
        { label: "Number of investors in this state", value: String(filing.investor_count) },
        { label: "Amount sold in this state", value: usd(filing.amount_cents) },
      ] },
      { title: "Investors in this state", fields: investors.length
        ? investors.map((i, n) => ({ label: `${n + 1}. ${i.name ?? "Unnamed investor"}${i.type ? ` (${i.type})` : ""}`, value: usd(i.amountCents) }))
        : [f("Investors", null)] },
      { title: "Fee and attachments", fields: [
        filing.fee_needs_review ? { label: "State filing fee", value: "", needsEntry: true } : { label: "State filing fee", value: usd(filing.fee_cents) },
        { label: "Attachments", value: "Copy of filed Form D; Form U-2 consent to service of process if the state requires it" },
      ] },
    ],
    notices: ["Prepared by Harmonious for manual filing. The state fee must be checked against the current NASAA fee table before paying."],
  };
}

export const buildFilingForm = (i: FormInput) => (i.filing.filing_type === "form_d" ? buildFormD(i) : buildStateNotice(i));
