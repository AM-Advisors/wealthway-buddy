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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-y bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2.5 font-medium">Investor</th><th className="px-3 py-2.5 font-medium">Commitment</th><th className="px-3 py-2.5 font-medium">Progress</th><th className="px-3 py-2.5 font-medium">Documents</th><th className="px-3 py-2.5 font-medium">Funding</th><th className="px-3 py-2.5" /></tr></thead>
              <tbody className="divide-y">
                {rows.map((row: any) => <tr key={row.applicationId} className="hover:bg-muted/30"><td className="px-3 py-3"><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.email ?? prettyStatus(row.accountLabel)}</p></td><td className="px-3 py-3">{money(row.commitmentCents)}</td><Status value={row.stage} /><Status value={row.documentsStatus} /><Status value={row.fundingStatus} /><td className="px-3 py-3 text-right"><Button asChild size="sm" variant="outline"><Link to="/manager/$applicationId" params={{ applicationId: row.applicationId }}>Review</Link></Button></td></tr>)}
                {rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">No investors match these filters.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function Status({ value }: { value: string }) { return <td className="px-3 py-3"><Badge variant={statusTone(value)}>{prettyStatus(value)}</Badge></td>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="border-l-2 border-primary bg-card px-3 py-2"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-medium">{value}</p></div>; }