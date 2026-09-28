import { useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { AddExistingInvestor } from "@/components/add-existing-investor";
import { FundRosterSummary } from "@/components/fund-roster-summary";
import { getFundInvestorActions, removeFundAccess, resendInvitation } from "@/lib/invitations.functions";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useServerFn } from "@tanstack/react-start";

import { BulkAddInvestors } from "@/components/bulk-add-investors";
import { FundOnboardingSettings } from "@/components/fund-onboarding-settings";
import { FundEligibilitySetup } from "@/components/fund-eligibility-setup";
import { FundInvestorProgress, ManagerAddInvestor } from "@/components/manager-add-investor";
import { PrepareInvestor } from "@/components/prepare-investor";
import { getManagerFundHome } from "@/lib/manager-fund.functions";
import { managerRowFromApplication } from "@/lib/prepared-investor-workflow";
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
  const initial = useRouterState({ select: (st) => (st.location.search as any)?.add as string | undefined });
  const [panel, setPanel] = useState<"existing" | "one" | "prep" | "many" | null>(
    initial === "existing" ? "existing" : initial === "invite" ? "one" : initial === "prep" ? "prep" : initial === "bulk" ? "many" : null,
  );
  const loadActions = useServerFn(getFundInvestorActions);
  const actions = useQuery({ queryKey: ["fund-investor-actions", fundId], queryFn: () => loadActions({ data: { fundId } }) });
  const resend = useServerFn(resendInvitation);
  const revoke = useServerFn(removeFundAccess);
  const qc = useQueryClient();
  const refresh = () => { qc.invalidateQueries({ queryKey: ["manager-fund-home", fundId] }); qc.invalidateQueries({ queryKey: ["fund-investor-actions", fundId] }); };
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error((e as Error).message); } };
  const rowMenu = (applicationId: string | null, userId: string | undefined, invitationId: string | null | undefined, name: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Actions for ${name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {applicationId ? <DropdownMenuItem asChild><Link to="/manager/$applicationId" params={{ applicationId }}>Open investor · onboarding, documents, funding</Link></DropdownMenuItem> : null}
        {invitationId ? <DropdownMenuItem onClick={() => run(() => resend({ data: { id: invitationId } }), "Invitation re-sent")}>Resend invite</DropdownMenuItem> : null}
        {userId ? <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm(`Revoke ${name}'s access to this fund? Their account and past records are kept.`)) run(() => revoke({ data: { userId, offeringId: fundId, role: "investor" } }), "Fund access revoked"); }}>Revoke fund access</DropdownMenuItem></> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
          {actions.data?.isStaff ? <Button size="sm" variant="secondary" onClick={() => setPanel(panel === "existing" ? null : "existing")}>Add Existing Investor</Button> : null}
          <Button size="sm" onClick={() => setPanel(panel === "one" ? null : "one")}>Invite New Investor</Button>
          <Button size="sm" variant="secondary" onClick={() => setPanel(panel === "prep" ? null : "prep")}>Prepare Investor</Button>
          <Button size="sm" variant="outline" onClick={() => setPanel(panel === "many" ? null : "many")}>Bulk Invite</Button>
        </div>
      </div>
      <div className="mt-5"><FundRosterSummary fundId={fundId} /></div>
      {panel === "existing" && <div className="mt-5"><AddExistingInvestor fundId={fundId} /></div>}
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
              <thead className="border-y bg-muted/50 text-xs text-muted-foreground"><tr>{["Investor", "Investing As", "Commitment", "Onboarding", "Verification", "Accreditation / Eligibility", "Documents", "Funding", "Next Action", ""].map((h) => <th key={h} className="px-2 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y">
                {rows.map((row: any) => { const r = safe(row); return <tr key={row.applicationId} className="hover:bg-muted/30"><td className="px-2 py-3"><Link to="/manager/$applicationId" params={{ applicationId: row.applicationId }} className="font-medium hover:underline">{r.investor}</Link></td><td className="px-2 py-3">{prettyStatus(r.investingAs)}</td><td className="px-2 py-3">{money(r.commitmentCents)}</td><td className="px-2 py-3">{prettyStatus(row.stage)}</td><td className="px-2 py-3">{r.verification}</td><td className="px-2 py-3">{r.accreditation}</td><td className="px-2 py-3">{r.documents}</td><td className="px-2 py-3">{r.funding}</td><td className="px-2 py-3"><Badge variant="secondary">{r.nextAction}</Badge></td><td className="px-2 py-3">{rowMenu(row.applicationId, actions.data?.rows[row.applicationId]?.userId, actions.data?.rows[row.applicationId]?.invitationId, r.investor)}</td></tr>; })}
                {!term(search) ? (actions.data?.pending ?? []).map((p) => <tr key={p.userId} className="bg-muted/20"><td className="px-2 py-3 font-medium">{p.name}</td><td className="px-2 py-3" colSpan={2}>—</td><td className="px-2 py-3">Invited — not started</td><td className="px-2 py-3" colSpan={4}>Onboarding not begun</td><td className="px-2 py-3"><Badge variant="outline">Waiting for investor</Badge></td><td className="px-2 py-3">{rowMenu(null, p.userId, p.invitationId, p.name)}</td></tr>) : null}
                {rows.length === 0 ? <tr><td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">No investors match these filters.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

const safe = managerRowFromApplication;
const term = (s: string) => s.trim().length > 0;

function Stat({ label, value }: { label: string; value: string }) { return <div className="border-l-2 border-primary bg-card px-3 py-2"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-medium">{value}</p></div>; }