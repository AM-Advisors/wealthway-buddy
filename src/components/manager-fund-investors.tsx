import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

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
        <Button asChild size="sm"><Link to="/manager/investors">Invite or manage investors</Link></Button>
      </div>
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
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-y bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2.5 font-medium">Investor</th><th className="px-3 py-2.5 font-medium">Commitment</th><th className="px-3 py-2.5 font-medium">KYC / AML</th><th className="px-3 py-2.5 font-medium">Accreditation</th><th className="px-3 py-2.5 font-medium">Documents</th><th className="px-3 py-2.5 font-medium">Funding</th><th className="px-3 py-2.5 font-medium">Review</th><th className="px-3 py-2.5" /></tr></thead>
              <tbody className="divide-y">
                {rows.map((row: any) => <tr key={row.applicationId} className="hover:bg-muted/30"><td className="px-3 py-3"><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.email ?? prettyStatus(row.accountLabel)}</p></td><td className="px-3 py-3">{money(row.commitmentCents)}</td><Status value={row.kycStatus === "approved" && row.amlStatus === "approved" ? "approved" : row.stage === "identity" ? "review" : row.kycStatus} /><Status value={row.accreditationStatus} /><Status value={row.documentsStatus} /><Status value={row.fundingStatus} /><Status value={row.managerReviewStatus} /><td className="px-3 py-3 text-right"><Button asChild size="sm" variant="outline"><Link to="/manager/$applicationId" params={{ applicationId: row.applicationId }}>Review</Link></Button></td></tr>)}
                {rows.length === 0 ? <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">No investors match these filters.</td></tr> : null}
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