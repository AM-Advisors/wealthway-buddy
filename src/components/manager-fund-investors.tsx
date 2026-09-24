import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { BulkAddInvestors } from "@/components/bulk-add-investors";
import { FundOnboardingSettings } from "@/components/fund-onboarding-settings";
import { FundEligibilitySetup } from "@/components/fund-eligibility-setup";
import { FundInvestorProgress, ManagerAddInvestor } from "@/components/manager-add-investor";
import { PrepareInvestor } from "@/components/prepare-investor";
import { getManagerFundHome } from "@/lib/manager-fund.functions";
import { managerSafeRow } from "@/lib/prepared-investor-workflow";
import { money, prettyStatus, statusTone } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const stages = ["all", "identity", "accreditation", "documents", "funding", "complete"] as const;

export function ManagerFundInvestors({ fundId }: { fundId: string }) {
  const load = useServerFn(getManagerFundHome);
  const { data, isLoading } = useQuery({
    queryKey: ["manager-fund-home", fundId],
    queryFn: () => load({ data: { offeringId: fundId } }),
  });
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
  const [panel, setPanel] = useState<"one" | "prep" | "many" | null>(null);
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.applications ?? []).filter((row: any) =>
      (stage === "all" || row.stage === stage) &&
      (!term || String(row.name).toLowerCase().includes(term) || String(row.email ?? "").toLowerCase().includes(term)),
    );
  }, [data, search, stage]);

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading investors…</p>;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl">Investors</h2><p className="mt-1 text-sm text-muted-foreground">Identity, eligibility, signing, and funding for this fund.</p></div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button size="sm" onClick={() => setPanel(panel === "one" ? null : "one")}>+ Quick Invite</Button>
          <Button size="sm" variant="secondary" onClick={() => setPanel(panel === "prep" ? null : "prep")}>Prepare Investor</Button>
          <Button size="sm" variant="outline" onClick={() => setPanel(panel === "many" ? null : "many")}>Add Multiple Investors</Button>
        </div>
      </div>
      {panel === "one" && <div className="mt-5"><ManagerAddInvestor fundId={fundId} /></div>}
      {panel === "prep" && <div className="mt-5"><PrepareInvestor fundId={fundId} /></div>}
      {panel === "many" && <div className="mt-5"><BulkAddInvestors fundId={fundId} existingEmails={(data?.applications ?? []).map((a: any) => String(a.email ?? "")).filter(Boolean)} /></div>}
      <div className="mt-5"><FundOnboardingSettings fundId={fundId} /></div>
      <div className="mt-5"><FundEligibilitySetup fundId={fundId} /></div>
      <div className="mt-5"><FundInvestorProgress fundId={fundId} /></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Object.entries(data.counts).map(([label, value]) => <Stat key={label} label={prettyStatus(label)} value={String(value)} />)}
      </div>
      <Card className="mt-5">
        <CardHeader><CardTitle className="text-base">Investor register</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search investors" />
            <Select value={stage} onValueChange={setStage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{stages.map((value) => <SelectItem key={value} value={value}>{value === "all" ? "Every stage" : prettyStatus(value)}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="divide-y rounded-md border md:hidden">
            {rows.map((row: any) => { const r = safe(row); return (
              <Link key={row.applicationId} to="/manager/$applicationId" params={{ applicationId: row.applicationId }} className="block p-3 hover:bg-muted/30">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-medium">{r.investor}</p><p className="text-xs text-muted-foreground">{prettyStatus(r.investingAs)} · {money(r.commitmentCents)}</p></div><Badge variant="secondary" className="shrink-0">{r.nextAction}</Badge></div>
                <p className="mt-1 text-xs text-muted-foreground">Verification: {r.verification} · Accreditation: {r.accreditation} · Documents: {r.documents} · Funding: {r.funding}</p>
              </Link>); })}
            {rows.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No investors match these filters.</p> : null}
          </div>
          <div className="hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-y bg-muted/50 text-xs text-muted-foreground"><tr>{["Investor", "Investing As", "Commitment", "Onboarding", "Verification", "Accreditation / Eligibility", "Documents", "Funding", "Next Action"].map((h) => <th key={h} className="px-2 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y">
                {rows.map((row: any) => { const r = safe(row); return <tr key={row.applicationId} className="hover:bg-muted/30"><td className="px-2 py-3"><Link to="/manager/$applicationId" params={{ applicationId: row.applicationId }} className="font-medium hover:underline">{r.investor}</Link></td><td className="px-2 py-3">{prettyStatus(r.investingAs)}</td><td className="px-2 py-3">{money(r.commitmentCents)}</td><td className="px-2 py-3">{prettyStatus(row.stage)}</td><td className="px-2 py-3">{r.verification}</td><td className="px-2 py-3">{r.accreditation}</td><td className="px-2 py-3">{r.documents}</td><td className="px-2 py-3">{r.funding}</td><td className="px-2 py-3"><Badge variant="secondary">{r.nextAction}</Badge></td></tr>; })}
                {rows.length === 0 ? <tr><td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">No investors match these filters.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function safe(row: any) {
  return managerSafeRow({
    name: row.name, investingAs: row.accountLabel, commitmentCents: row.commitmentCents ?? 0,
    kycStatus: row.kycStatus, amlStatus: row.amlStatus, accreditationStatus: row.accreditationStatus,
    documentsStatus: row.documentsStatus, fundingStatus: row.fundingStatus, stage: row.stage,
    investorSigned: (row.signedCount ?? 0) > 0, fullyExecuted: row.documentsStatus === "approved",
    managerSignatureRequired: false, approvedToFund: row.stage === "funding",
    harmoniousReview: row.managerReviewStatus === "in_review",
  });
}

function Status({ value }: { value: string }) { return <td className="px-3 py-3"><Badge variant={statusTone(value)}>{prettyStatus(value)}</Badge></td>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="border-l-2 border-primary bg-card px-3 py-2"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-medium">{value}</p></div>; }