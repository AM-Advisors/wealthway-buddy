import type { PdfDocSpec } from "@/lib/pdf-render";

/**
 * 506(c) offering circular with a signature page. Pure content builder: every
 * fact comes from canonical fund records, never typed in by hand at render time.
 * The circular summarizes the offering; the PPM, LPA and Subscription Agreement
 * always control.
 */
export type OfferingCircular506cSeries = {
  name: string;
  /** Who the series is for, e.g. "At least $50,000 and less than $100,000". */
  range: string;
  preferredReturn: string;
  notes?: string | null;
};

export type OfferingCircular506cFacts = {
  fundName: string;
  gpName: string;
  stateOfFormation: string;
  formedDate: string;
  principalAddress: string;
  targetRaise: string;
  minimumInvestment: string;
  signatoryTitle: string;
  arbitrationCity: string;
  arbitrationState: string;
  circularDate: string;
  series: OfferingCircular506cSeries[];
};

export function offeringCircular506cSpec(f: OfferingCircular506cFacts): PdfDocSpec {
  const entity = `${f.fundName}, a ${f.stateOfFormation} limited partnership`;
  return {
    kicker: "Confidential private offering",
    title: "Offering Circular",
    subtitle: `${f.fundName} · Offered under Rule 506(c) of Regulation D`,
    meta: [
      { label: "Fund", value: f.fundName },
      { label: "General Partner", value: f.gpName },
      { label: "Formed", value: `${f.stateOfFormation}, ${f.formedDate}` },
      { label: "Minimum investment", value: f.minimumInvestment },
      { label: "Target raise", value: f.targetRaise },
      { label: "Circular date", value: f.circularDate },
    ],
    sections: [
      {
        heading: "Important notices",
        text:
          `This offering circular relates to ${entity} (the "Fund"). The interests described here are offered only under Rule 506(c) of Regulation D of the Securities Act of 1933 and are not registered with the Securities and Exchange Commission or any state securities regulator. ` +
          `Only investors who are accredited investors, and whose accredited status has been verified as required by Rule 506(c), may invest. Verification must be completed before any investment is accepted. ` +
          `This circular is a summary only. The Fund's Private Placement Memorandum, Limited Partnership Agreement and Subscription Agreement control in every case, and nothing here changes them. ` +
          `This is not an offer to sell or a solicitation of an offer to buy in any place where that offer or solicitation would be unlawful. Investing in the Fund involves risk, including the possible loss of the entire investment.`,
      },
      {
        heading: "The offering",
        text:
          `The Fund is ${entity}, formed on ${f.formedDate}. ${f.gpName} serves as the general partner and manager of the Fund. The Fund's principal address is ${f.principalAddress}. ` +
          `The Fund is offering preferred interests with a target raise of ${f.targetRaise}. The minimum investment is ${f.minimumInvestment}. Closings are held on a rolling basis at the general partner's discretion.`,
      },
      {
        heading: "Series of preferred interests",
        text: "The Fund offers the following series. The series that applies to an investor is determined by the investor's subscription amount, as recorded in the Subscription Agreement.",
        rows: f.series.map((s) => ({
          label: `${s.name} · ${s.range}`,
          value: s.notes ? `${s.preferredReturn} · ${s.notes}` : s.preferredReturn,
        })),
      },
      {
        heading: "Investor eligibility and verification",
        text:
          `Because this offering is made under Rule 506(c), the Fund must take reasonable steps to verify that every investor is an accredited investor before admission. Each investor completes identity and accreditation verification through the Fund's onboarding process and provides supporting evidence, such as tax returns, account statements or a confirmation letter from a qualified professional. ` +
          `An investment is not accepted, and no funds may be sent, until verification is complete and the Fund has approved the investor's admission.`,
      },
      {
        heading: "How to subscribe",
        text:
          `To invest, complete the Fund's onboarding steps, finish accreditation verification, and sign the Subscription Agreement together with this offering circular. The Private Placement Memorandum describes the offering in full, and the Limited Partnership Agreement governs the rights and obligations of the partners. ` +
          `Any dispute is resolved by arbitration in ${f.arbitrationCity}, ${f.arbitrationState}, as provided in the governing documents.`,
      },
      {
        heading: "Acknowledgment and signature",
        text:
          `By signing below, the investor acknowledges receiving the Fund's Private Placement Memorandum and Limited Partnership Agreement, represents that the investor is an accredited investor, agrees to complete the verification required by Rule 506(c) before admission, and understands that an investment in the Fund involves risk, including the possible loss of the entire investment. ` +
          `This signature page forms part of the investor's Subscription Agreement with the Fund.`,
      },
      {
        heading: "Investor signature",
        text: "Signature: ______________________________    Date: ______________\nPrinted name: ______________________________",
      },
      {
        heading: "Entity investors",
        text: "Entity name: ______________________________\nAuthorized signer: ______________________________    Title: ______________________________\nSignature: ______________________________    Date: ______________",
      },
    ],
    notes: [
      `The interests have not been approved or disapproved by the Securities and Exchange Commission or any state securities authority, and no authority has passed on the accuracy of this document.`,
      `This circular does not change, replace or summarize completely the Fund's governing documents. If anything here conflicts with the Private Placement Memorandum, the Limited Partnership Agreement or the Subscription Agreement, those documents control.`,
    ],
    fileName: `${f.fundName.replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "")}-506c-Offering-Circular.pdf`,
  };
}
