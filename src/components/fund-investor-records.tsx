import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { fundInvestorRecordsFn, removeFromFundFn } from "@/lib/investor-record.functions";
import { SOURCE_LABELS, type EntrySource, type RecordStatus } from "@/lib/investor-record-model";
import { money, prettyStatus } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const statusTone: Record<RecordStatus, "default" | "secondary" | "outline" | "destructive"> = {
  complete: "default", missing_information: "outline", investor_confirmation_needed: "secondary", conflict_detected: "destructive", needs_harmonious_review: "secondary",
};

/** Canonical investment records for this Fund, with Record Status (separate from Readiness). */
export function FundInvestorRecords({ fundId }: { fundId: string }) {
  const load = useServerFn(fundInvestorRecordsFn);
  const remove = useServerFn(removeFromFundFn);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["fund-investor-records", fundId], queryFn: () => load({ data: { offeringId: fundId } }) });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading investor records…</p>;
  if (!data) return null;
  const doRemove = async (id: string, name: string) => {
    if (!window.confirm(`Remove ${name} from this Fund? Their person record, other Funds and history are kept.`)) return;
    try { await remove({ data: { onboardingId: id } }); toast.success("Removed from Fund"); qc.invalidateQueries({ queryKey: ["fund-investor-records", fundId] }); }
    catch (e) { toast.error((e as Error).message); }
  };
  const menu = (r: (typeof data.items)[number]) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Actions for ${r.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link to="/manager/fund/$fundId/investor/$onboardingId" params={{ fundId, onboardingId: r.onboardingId }}>Open Investor</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/manager/fund/$fundId/investor/$onboardingId" params={{ fundId, onboardingId: r.onboardingId }} search={{ tab: "profile" } as never}>Edit Investor Details</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/manager/fund/$fundId/investor/$onboardingId" params={{ fundId, onboardingId: r.onboardingId }} search={{ tab: "investment" } as never}>Edit Investment</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/manager/fund/$fundId/investor/$onboardingId" params={{ fundId, onboardingId: r.onboardingId }} search={{ tab: "readiness" } as never}>View Readiness</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/manager/fund/$fundId/investors" params={{ fundId }} search={{ add: "invite" } as never}>Invite / Resend Invite</Link></DropdownMenuItem>
        {data.isStaff && r.hasAccount ? <DropdownMenuItem asChild><Link to="/ops/readiness">View client perspective</Link></DropdownMenuItem> : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={() => doRemove(r.onboardingId, r.name)}>Remove from Fund</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Investor records</CardTitle>
        <p className="text-sm text-muted-foreground">Record Status shows whether the investor's information is complete. Close readiness is tracked separately.</p></CardHeader>
      <CardContent>
        {data.items.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No investor records yet. Use Create New Investor or Bulk Add to begin.</p> : <>
          <div className="divide-y rounded-md border md:hidden">
            {data.items.map((r) => <div key={r.onboardingId} className="flex items-start justify-between gap-2 p-3">
              <Link to="/manager/fund/$fundId/investor/$onboardingId" params={{ fundId, onboardingId: r.onboardingId }} className="min-w-0">
                <p className="truncate font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.profileType ?? "Profile needed"} · {money(r.amountCents)}</p>
                <Badge variant={statusTone[r.recordStatus]} className="mt-1">{r.recordStatusLabel}</Badge></Link>{menu(r)}</div>)}
          </div>
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="border-y bg-muted/50 text-xs text-muted-foreground"><tr>{["Investor", "Investing As", "Amount", "Onboarding", "Record Status", "Entered By", ""].map((h) => <th key={h} className="px-2 py-2.5 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y">{data.items.map((r) => <tr key={r.onboardingId} className="hover:bg-muted/30">
              <td className="px-2 py-3"><Link to="/manager/fund/$fundId/investor/$onboardingId" params={{ fundId, onboardingId: r.onboardingId }} className="font-medium hover:underline">{r.name}</Link>{!r.hasAccount ? <p className="text-xs text-muted-foreground">No sign-in yet</p> : null}</td>
              <td className="px-2 py-3">{r.profileLabel ?? "—"}<p className="text-xs text-muted-foreground">{r.profileType}</p></td>
              <td className="px-2 py-3">{money(r.amountCents)}</td>
              <td className="px-2 py-3">{prettyStatus(r.stage)}</td>
              <td className="px-2 py-3"><Badge variant={statusTone[r.recordStatus]}>{r.recordStatusLabel}</Badge></td>
              <td className="px-2 py-3 text-muted-foreground">{SOURCE_LABELS[r.enteredBy as EntrySource] ?? "Investor"}</td>
              <td className="px-2 py-3">{menu(r)}</td></tr>)}</tbody>
          </table>
        </>}
      </CardContent>
    </Card>
  );
}
