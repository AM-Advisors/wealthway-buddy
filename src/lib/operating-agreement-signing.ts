/** Validate a new ceremony only; completed documents are never rebuilt here. */
export function operatingAgreementSignaturePage(input: {
  title: string;
  fundName: string;
  signerName: string;
  signatoryTitle: string | null | undefined;
  body: string;
}) {
  const title = input.signatoryTitle?.trim();
  if (!title) throw new Error("Record the fund signatory's title, then generate and review a corrected document version before sending it to sign.");
  if (/\{\{[^{}]+\}\}/.test(input.body)) {
    throw new Error("This agreement still has unfilled template fields. Generate and review a corrected version before sending it to sign.");
  }
  return [
    "SIGNATURE PAGE", input.title, input.fundName, "", "FUND MANAGER",
    `Fund: ${input.fundName}`, `Signed by: ${input.signerName}`, `Title: ${title}`,
    "Signature: ____________________", "Date: ____________________",
  ].join("\n");
}