import { CloseRequestCard } from "@/components/close-request-review";
import { closeInvestorTerms } from "@/lib/close-investor-terms";

const QA_CLOSE_REQUEST = {
  id: "qa-close-request",
  offering_id: "qa-fund",
  status: "submitted",
  created_at: "2026-11-20T15:00:00.000Z",
  target_date: "2026-12-15",
  onboarding_ids: ["qa-investor-one", "qa-investor-two"],
  notes: "Fictional request used to compare the manager and Operations screens.",
  staff_note: "Fictional review note visible in both views.",
  details: {
    investorTerms: [{ id: "qa-investor-one", name: "Fictional Family Trust", terms: closeInvestorTerms("qa-fund", "qa-investor-one", [{ id: "qa-letter", offering_id: "qa-fund", onboarding_id: "qa-investor-one", status: "active", effective_date: null, expiry_date: null, current_version: 2, terms: [{ category: "fee_discount", value: "0%", description: "Management fee" }, { category: "carry_reduction", value: "0%", description: "Carried interest" }, { category: "information_rights", value: "Quarterly", description: "Reporting" }] }]) }],
    assetMode: "new",
    asset: { name: "Juniper House", issuer: "Juniper House LLC", type: "Real estate", amountCents: 75000000, notes: "Fictional asset details." },
    managementFeePct: 2,
    managementFeeCents: 1500000,
    feeConfirmed: true,
    wire: { method: "wire", amountCents: 1516000, beneficiary: "Example Fund Manager LLC", bankName: "Fictional Bank", routingLast4: "1234", accountLast4: "6789", reference: "Close 2026-12" },
    investorStates: ["CO", "TX"],
    purchaseAgreementName: "fictional-purchase-agreement.pdf",
    purchaseAgreementSigned: true,
    wireInstructionsName: "fictional-wire-instructions.pdf",
    legalFeesCents: 250000,
    legalFeesDetail: "Fictional legal review",
    brokerDealerFeesCents: null,
    brokerDealerDetail: "",
    formDFeeCents: 16000,
    sideLetterCount: 1,
    sideLetterUnitCents: 150000,
    sideLetterPaidCount: 0,
    sideLetterFeeCents: 150000,
  },
};

/** Fictional side-by-side proof that Operations adds controls without replacing the manager's close details. */
export function QaCloseComparison() {
  return (
    <section className="space-y-4" aria-label="Shared Close screen comparison">
      <div>
        <h2 className="text-lg font-semibold">Shared Close screen</h2>
        <p className="text-sm text-muted-foreground">The same fictional request is rendered through the real shared card. No real record or server call is used.</p>
      </div>
      <div aria-label="Fund manager Close view">
        <h3 className="mb-2 text-sm font-medium">Fund manager view</h3>
        <CloseRequestCard r={QA_CLOSE_REQUEST} />
      </div>
      <div aria-label="Operations Close view">
        <h3 className="mb-2 text-sm font-medium">Operations view</h3>
        <CloseRequestCard r={QA_CLOSE_REQUEST} operations />
      </div>
    </section>
  );
}
