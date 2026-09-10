import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFundConditions, type ConditionFinding } from "@/lib/fund-conditions.functions";
import { sectionState, useFundScope, type FundSection } from "@/lib/fund-scope";

/**
 * One line per fund step — onboarding, identity, screening, accreditation,
 * Form D and Blue Sky — showing whether the step is inside the client's active
 * statement of work and whether the conditions in that agreement are met.
 */

type Row = {
  key: string;
  label: string;
  note: string;
  section: FundSection;
  /** Conditions from the agreement that decide whether this step can run. */
  rules: string[];
};

const ROWS: Row[] = [
  {
    key: "onboarding",
    label: "Investor onboarding",
    note: "Taking applications and collecting investor details.",
    section: "onboarding",
    rules: ["max_beneficial_owners", "investor_count_fee_threshold", "allowed_exemptions"],
  },
  {
    key: "identity",
    label: "Identity checks (KYC)",
    note: "Identity and entity verification through the checked provider.",
    section: "identity",
    rules: [],
  },
  {
    key: "screening",
    label: "Sanctions and AML screening",
    note: "Screening results recorded for review by the client's compliance contact.",
    section: "screening",
    rules: [],
  },
  {
    key: "accreditation",
    label: "Accreditation",
    note: "",
    section: "accreditation",
    rules: ["accredited_investors_only"],
  },
  {
    key: "form_d",
    label: "Form D",
    note: "Harmonious prepares and tracks the federal notice filing.",
    section: "filings",
    rules: ["allowed_exemptions"],
  },
  {
    key: "blue_sky",
    label: "Blue Sky notices",
    note: "State notice filings tracked against each investor's state.",
    section: "filings",
    rules: ["allowed_exemptions"],
  },
];

export function FundReadinessPanel({ offeringId }: { offeringId: string }) {
  const scope = useFundScope(offeringId);
  const load = useServerFn(getFundConditions);
  const conditions = useQuery({
    queryKey: ["fund-conditions", offeringId],
    queryFn: () => load({ data: { offeringId } }),
    retry: false,
    staleTime: 60_000,
  });

  const findings: ConditionFinding[] = (conditions.data?.findings ?? []) as ConditionFinding[];
  const feeNotice = conditions.data?.feeNotice ?? null;
  const configured = conditions.data?.configured ?? scope.configured;

  const findingFor = (keys: string[]) =>
    keys
      .map((k) => findings.find((f) => f.key === k))
      .filter(Boolean)
      .filter((f) => (f as ConditionFinding).state === "attention" && !(f as ConditionFinding).clearedAt) as ConditionFinding[];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Status against the agreement</CardTitle>
        <CardDescription>
          Each step below follows the client's active statement of work. Steps outside that scope,
          or held up by a condition in the agreement, stay paused until Harmonious records the
          change.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!configured ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            No scope has been recorded for this fund yet, so onboarding and funding stay paused.
          </p>
        ) : null}

        {ROWS.map((row) => {
          const state = sectionState(scope, row.section);
          const service = scope.serviceFor(row.section);
          const blockers = findingFor(row.rules);
          const feeHeld =
            row.key === "onboarding" && !!feeNotice && !feeNotice.acknowledged
              ? `${feeNotice.investors} investors, above the ${feeNotice.threshold} in the agreement — the additional per-investor fee needs acknowledging.`
              : null;

          let tone: "secondary" | "outline" | "destructive" = "secondary";
          let status = "Active";
          let detail =
            row.key === "accreditation"
              ? scope.regType === "506b"
                ? "Self-certified accreditation, as allowed under 506(b)."
                : "Third-party verification of accredited status, as required under 506(c)."
              : row.note;

          if (state === "blocked") {
            tone = "destructive";
            status = "Not in scope";
            detail = "This service is not currently included in your active scope. Request service.";
          } else if (state === "unknown") {
            tone = "outline";
            status = "Scope not recorded";
            detail = "Confirm this step against the client's statement of work before running it.";
          } else if (blockers.length || feeHeld) {
            tone = "destructive";
            status = "Paused";
            detail = feeHeld ?? `${blockers[0]!.label}: ${blockers[0]!.detail}`;
          }

          return (
            <div key={row.key} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{row.label}</p>
                <Badge variant={tone}>{status}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
              {service?.name && state === "included" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Covered by {service.name} in the statement of work.
                </p>
              ) : null}
            </div>
          );
        })}

        {scope.clientId ? (
          <p className="text-xs text-muted-foreground">
            Scope and conditions come from the client's agreement.{" "}
            <Link to="/admin/pricing" className="underline">
              Pricing and agreements
            </Link>
            .
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
