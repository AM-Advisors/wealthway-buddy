import { useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { AddExistingInvestor } from "@/components/add-existing-investor";
import { BulkAddInvestors } from "@/components/bulk-add-investors";
import { BulkInvestorRecords } from "@/components/bulk-investor-records";
import { CreateInvestor } from "@/components/create-investor";
import { FundOnboardingSettings } from "@/components/fund-onboarding-settings";
import { FundEligibilitySetup } from "@/components/fund-eligibility-setup";
import { ManagerAddInvestor } from "@/components/manager-add-investor";
import { PrepareInvestor } from "@/components/prepare-investor";
import { copyText, FundOnboardingLinkCard } from "@/components/fund-onboarding-link";
import { getFundInvestorActions, removeFundAccess, resendInvitation } from "@/lib/invitations.functions";
import { fundReadinessFn, managerOnboardingBoardFn, resendOnboardInvitationFn } from "@/lib/investor-onboarding.functions";
import { fundInvestorRecordsFn, removeFromFundFn } from "@/lib/investor-record.functions";
import { getFundLinkFn } from "@/lib/fund-onboarding-link.functions";
import { getManagerFundHome } from "@/lib/manager-fund.functions";
import { managerRowFromApplication } from "@/lib/prepared-investor-workflow";
import {
  CLAIM_STATE_LABELS, ROSTER_READINESS_LABELS, fundInvestorsSummary, rosterReadiness, rosterOwner,
  type ClaimState, type RecordStatus, type RosterReadiness,
} from "@/lib/investor-record-model";
import { money, prettyStatus } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Panel = "existing" | "create" | "invite" | "records" | "prep" | "bulkInvite" | null;
const PANEL_FROM_SEARCH: Record<string, Panel> = { existing: "existing", create: "create", records: "records", invite: "invite", prep: "prep", bulk: "bulkInvite" };

const recordTone: Record<RecordStatus, "default" | "secondary" | "outline" | "destructive"> = {
  complete: "default", missing_information: "outline", investor_confirmation_needed: "secondary", conflict_detected: "destructive", needs_harmonious_review: "secondary",
};
const readinessTone: Record<RosterReadiness, "default" | "secondary" | "outline" | "destructive"> = {
  ready: "default", needs_attention: "destructive", in_progress: "outline", closed: "secondary", unknown: "outline",
};
const claimTone: Record<ClaimState, "outline" | "secondary"> = { prepared: "outline", claimed: "secondary", investor_started: "secondary" };

/** One Fund Investors roster: canonical Person → Profile → Investment rows, plus clearly separate pending invitations. */
export function ManagerFundInvestors({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const loadRecords = useServerFn(fundInvestorRecordsFn);
  const loadReadiness = useServerFn(fundReadinessFn);
  const loadBoard = useServerFn(managerOnboardingBoardFn);
  const loadActions = useServerFn(getFundInvestorActions);
  const loadHome = useServerFn(getManagerFundHome);
  const loadLink = useServerFn(getFundLinkFn);
  const remove = useServerFn(removeFromFundFn);
  const resendAccess = useServerFn(resendInvitation);
  const revoke = useServerFn(removeFundAccess);
  const resendOnboard = useServerFn(resendOnboardInvitationFn);

  const records = useQuery({ queryKey: ["fund-investor-records", fundId], queryFn: () => loadRecords({ data: { offeringId: fundId } }) });
  const readiness = useQuery({ queryKey: ["fund-readiness", fundId], queryFn: () => loadReadiness({ data: { offeringId: fundId } }), retry: false });
  const board = useQuery({ queryKey: ["fund-investor-progress", fundId], queryFn: () => loadBoard({ data: { offeringId: fundId } }) });
  const actions = useQuery({ queryKey: ["fund-investor-actions", fundId], queryFn: () => loadActions({ data: { fundId } }) });
  const home = useQuery({ queryKey: ["manager-fund-home", fundId], queryFn: () => loadHome({ data: { offeringId: fundId } }) });

  const initial = useRouterState({ select: (st) => (st.location.search as any)?.add as string | undefined });
  const [panel, setPanel] = useState<Panel>(initial ? PANEL_FROM_SEARCH[initial] ?? null : null);
  const toggle = (p: Panel) => setPanel(panel === p ? null : p);
  const [search, setSearch] = useState("");
  const isStaff = Boolean(records.data?.isStaff ?? actions.data?.isStaff);

  const refresh = () => ["fund-investor-records", "fund-readiness", "fund-investor-progress", "fund-investor-actions", "manager-fund-home"].forEach((k) => qc.invalidateQueries({ queryKey: [k, fundId] }));
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error((e as Error).message); } };
  const resendOne = useMutation({
    mutationFn: (invitationId: string) => resendOnboard({ data: { invitationId } }),
    onSuccess: (r: any) => (r?.sent ? toast.success("Invitation resent.") : toast.error("The email could not be sent.")),
    onError: (e: any) => toast.error(String(e?.message ?? e).replace(/^Forbidden:\s*/, "")),
  });
  const copyLink = async () => {
    try { const d = await loadLink({ data: { offeringId: fundId } }); if (d.url) await copyText(d.url, "Onboarding link copied"); else toast.message("No active onboarding link yet. Open the Onboarding Link tab to set one up."); }
    catch (e) { toast.error((e as Error).message); }
  };

  const readinessRows = ((readiness.data as any)?.rows ?? []) as any[];
  const readinessById = useMemo(() => new Map(readinessRows.map((r) => [r.onboardingId, r])), [readinessRows]);
  const items = records.data?.items ?? [];
  // Invitations: onboarding invites not yet opened + fund-access invitees who haven't started. Never shown as investments.
  const pendingOnboard = (((board.data as any)?.items ?? []) as any[]).filter((i) => String(i.id).startsWith("invite:"));
  const pendingAccess = actions.data?.pending ?? [];
  const legacy = ((home.data?.applications ?? []) as any[]);
  const summary = fundInvestorsSummary(items.map((i) => i.onboardingId), readinessRows, pendingOnboard.length + pendingAccess.length);

  const term = search.trim().toLowerCase();
  const shown = items.filter((r) => !term || r.name.toLowerCase().includes(term) || (r.profileLabel ?? "").toLowerCase().includes(term));
  const shownLegacy = legacy.filter((a) => !term || String(a.name ?? "").toLowerCase().includes(term));

  if (records.isLoading) return <p className="text-sm text-muted-foreground">Loading investors…</p>;
  if (records.error) return <p className="text-sm text-destructive">{(records.error as Error).message}</p>;

  const rowMenu = (r: (typeof items)[number]) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Actions for ${r.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link to="/manager/fund/$fundId/investor/$onboardingId" params={{ fundId, onboardingId: r.onboardingId }}>Open investor</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/manager/fund/$fundId/investor/$onboardingId" params={{ fundId, onboardingId: r.onboardingId }} search={{ tab: "profile" }}>{r.hasAccount && !isStaff ? "Suggest detail changes" : "Edit investor details"}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/manager/fund/$fundId/investor/$onboardingId" params={{ fundId, onboardingId: r.onboardingId }} search={{ tab: "investment" }}>Edit investment</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/manager/fund/$fundId/investor/$onboardingId" params={{ fundId, onboardingId: r.onboardingId }} search={{ tab: "readiness" }}>View readiness</Link></DropdownMenuItem>
        {isStaff && r.hasAccount ? <DropdownMenuItem asChild><Link to="/ops/readiness">View client perspective</Link></DropdownMenuItem> : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm(`Remove ${r.name} from this Fund? Their person record, other Funds and history are kept.`)) run(() => remove({ data: { onboardingId: r.onboardingId } }), "Removed from Fund"); }}>Remove from Fund</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const legacyMenu = (applicationId: string, name: string) => {
    const a = actions.data?.rows[applicationId];
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Actions for ${name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild><Link to="/manager/$applicationId" params={{ applicationId }}>Open application</Link></DropdownMenuItem>
          {a?.invitationId ? <DropdownMenuItem onClick={() => run(() => resendAccess({ data: { id: a.invitationId! } }), "Invitation re-sent")}>Resend invite</DropdownMenuItem> : null}
          {a?.userId ? <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm(`Revoke ${name}'s access to this fund? Their account and past records are kept.`)) run(() => revoke({ data: { userId: a.userId!, offeringId: fundId, role: "investor" } }), "Fund access revoked"); }}>Revoke fund access</DropdownMenuItem></> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };
  const readinessCell = (id: string) => {
    const rr = readinessById.get(id); const st = rosterReadiness(rr);
    return { st, label: ROSTER_READINESS_LABELS[st], next: rr?.nextAction?.label ?? (st === "unknown" ? "—" : "No action needed"), owner: rosterOwner(rr) };
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl">Investors</h2><p className="mt-1 text-sm text-muted-foreground">Everyone investing in this fund, and anyone invited who hasn't started yet.</p></div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button size="sm" onClick={() => toggle("create")}>Create New Investor</Button>
          {isStaff ? <Button size="sm" variant="secondary" onClick={() => toggle("existing")}>Add Existing Investor</Button> : null}
          <Button size="sm" variant="secondary" onClick={() => toggle("invite")}>Invite Investor</Button>
          <Button size="sm" variant="outline" onClick={() => toggle("records")}>Bulk Add Investors</Button>
          <Button size="sm" variant="outline" onClick={copyLink}>Copy Onboarding Link</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="sm" variant="ghost">More <ChevronDown className="ml-1 h-3 w-3" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => toggle("prep")}>Prepare Investor (draft for review)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggle("bulkInvite")}>Bulk Invite by email</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <FundOnboardingLinkCard fundId={fundId} />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4 lg:grid-cols-7">
        {([["Total", summary.total + legacy.length], ["Invited", summary.invited], ["Onboarding", summary.onboarding], ["Needs Investor", summary.needsInvestor], ["Needs Harmonious", summary.needsHarmonious], ["Ready", summary.ready], ["Funded", summary.funded]] as const).map(([l, v]) => (
          <div key={l} className="bg-card p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{l}</p><p className="font-heading text-xl font-semibold">{v}</p></div>
        ))}
      </div>

      {panel === "create" && <CreateInvestor fundId={fundId} isStaff={isStaff} onDone={() => { setPanel(null); refresh(); }} />}
      {panel === "records" && <BulkInvestorRecords fundId={fundId} isStaff={isStaff} />}
      {panel === "existing" && <AddExistingInvestor fundId={fundId} />}
      {panel === "invite" && <ManagerAddInvestor fundId={fundId} />}
      {panel === "prep" && <PrepareInvestor fundId={fundId} />}
      {panel === "bulkInvite" && <BulkAddInvestors fundId={fundId} existingEmails={legacy.map((a) => String(a.email ?? "")).filter(Boolean)} />}

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><CardTitle className="text-base">Investor roster</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground"><b>Record</b> = is the investor's information complete and confirmed. <b>Readiness</b> = is the investment ready to close. <b>Prepared</b> = entered by the Fund team or Harmonious; the investor hasn't signed in or confirmed it.</p></div>
          <Input className="sm:w-56" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search investors" aria-label="Search investors" />
        </CardHeader>
        <CardContent>
          {shown.length === 0 && shownLegacy.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{term ? "No investors match your search." : "No investors yet. Use Create New Investor, Invite Investor or the onboarding link to begin."}</p> : <>
            <ul className="divide-y rounded-md border md:hidden">
              {shown.map((r) => { const rc = readinessCell(r.onboardingId); return (
                <li key={r.onboardingId} className="flex items-start justify-between gap-2 p-3">
                  <Link to="/manager/fund/$fundId/investor/$onboardingId" params={{ fundId, onboardingId: r.onboardingId }} className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.profileLabel ?? r.profileType ?? "Profile needed"} · {money(r.amountCents)}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge variant={claimTone[r.claimState]}>{r.claimState === "prepared" ? "Prepared" : "Claimed"}</Badge>
                      <Badge variant={recordTone[r.recordStatus]}>Record: {r.recordStatusLabel}</Badge>
                      <Badge variant={readinessTone[rc.st]}>{rc.label}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Next: {rc.next}</p>
                  </Link>{rowMenu(r)}
                </li>); })}
              {shownLegacy.map((row: any) => { const s = managerRowFromApplication(row); return (
                <li key={row.applicationId} className="flex items-start justify-between gap-2 bg-muted/20 p-3">
                  <Link to="/manager/$applicationId" params={{ applicationId: row.applicationId }} className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.investor}</p><p className="text-xs text-muted-foreground">{prettyStatus(s.investingAs)} · {money(s.commitmentCents)}</p>
                    <Badge variant="outline" className="mt-1.5">Earlier application</Badge><p className="mt-1 text-xs text-muted-foreground">Next: {s.nextAction}</p>
                  </Link>{legacyMenu(row.applicationId, s.investor)}
                </li>); })}
            </ul>
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="border-y bg-muted/50 text-xs text-muted-foreground"><tr>{["Investor", "Profile", "Amount", "Record Status", "Status", "Next Action", "Owner", ""].map((h) => <th key={h} className="px-2 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y">
                {shown.map((r) => { const rc = readinessCell(r.onboardingId); return (
                  <tr key={r.onboardingId} className="align-top hover:bg-muted/30">
                    <td className="px-2 py-3"><Link to="/manager/fund/$fundId/investor/$onboardingId" params={{ fundId, onboardingId: r.onboardingId }} className="font-medium hover:underline">{r.name}</Link>
                      <div className="mt-1"><Badge variant={claimTone[r.claimState]} title={r.claimState === "prepared" ? "Entered by the Fund team or Harmonious. No one has access until the investor signs in with this email." : undefined}>{CLAIM_STATE_LABELS[r.claimState]}</Badge></div></td>
                    <td className="px-2 py-3">{r.profileLabel ?? "—"}<p className="text-xs text-muted-foreground">{r.profileType ?? "Profile needed"}</p></td>
                    <td className="px-2 py-3">{money(r.amountCents)}<p className="text-xs text-muted-foreground">{prettyStatus(r.stage)}</p></td>
                    <td className="px-2 py-3"><Badge variant={recordTone[r.recordStatus]}>{r.recordStatusLabel}</Badge></td>
                    <td className="px-2 py-3"><Badge variant={readinessTone[rc.st]}>{rc.label}</Badge></td>
                    <td className="px-2 py-3 text-muted-foreground">{rc.next}</td>
                    <td className="px-2 py-3 text-muted-foreground">{rc.owner}</td>
                    <td className="px-2 py-3">{rowMenu(r)}</td>
                  </tr>); })}
                {shownLegacy.map((row: any) => { const s = managerRowFromApplication(row); return (
                  <tr key={row.applicationId} className="align-top bg-muted/20">
                    <td className="px-2 py-3"><Link to="/manager/$applicationId" params={{ applicationId: row.applicationId }} className="font-medium hover:underline">{s.investor}</Link><div className="mt-1"><Badge variant="outline">Earlier application</Badge></div></td>
                    <td className="px-2 py-3">{prettyStatus(s.investingAs)}</td>
                    <td className="px-2 py-3">{money(s.commitmentCents)}<p className="text-xs text-muted-foreground">{prettyStatus(row.stage)}</p></td>
                    <td className="px-2 py-3 text-muted-foreground" colSpan={2}>Verification {s.verification} · Documents {s.documents} · Funding {s.funding}</td>
                    <td className="px-2 py-3 text-muted-foreground">{s.nextAction}</td>
                    <td className="px-2 py-3 text-muted-foreground">—</td>
                    <td className="px-2 py-3">{legacyMenu(row.applicationId, s.investor)}</td>
                  </tr>); })}
              </tbody>
            </table>
            {shownLegacy.length ? <p className="mt-2 text-xs text-muted-foreground">"Earlier application" rows come from the previous onboarding process and open in their original view.</p> : null}
          </>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Pending invitations</CardTitle>
          <p className="text-sm text-muted-foreground">Invited but not started. These aren't investments yet; one is created when the investor begins onboarding. Emails only go out when you click Resend.</p></CardHeader>
        <CardContent>
          {pendingOnboard.length + pendingAccess.length === 0 ? <p className="text-sm text-muted-foreground">No pending invitations.</p> : (
            <ul className="divide-y rounded-md border">
              {pendingOnboard.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium">{i.investorName}</p><p className="text-xs text-muted-foreground">Invited{i.requestedAmountCents ? ` · intends ${money(i.requestedAmountCents)}` : ""}</p></div>
                  <Button size="sm" variant="outline" disabled={resendOne.isPending} onClick={() => resendOne.mutate(String(i.id).slice(7))}>Resend invitation</Button>
                </li>))}
              {pendingAccess.map((p) => (
                <li key={p.userId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium">{p.name}</p><p className="text-xs text-muted-foreground">Has fund access · onboarding not begun</p></div>
                  <div className="flex gap-2">
                    {p.invitationId ? <Button size="sm" variant="outline" onClick={() => run(() => resendAccess({ data: { id: p.invitationId! } }), "Invitation re-sent")}>Resend</Button> : null}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (window.confirm(`Revoke ${p.name}'s access to this fund?`)) run(() => revoke({ data: { userId: p.userId, offeringId: fundId, role: "investor" } }), "Fund access revoked"); }}>Revoke</Button>
                  </div>
                </li>))}
            </ul>)}
        </CardContent>
      </Card>

      <FundOnboardingSettings fundId={fundId} />
      <FundEligibilitySetup fundId={fundId} />
    </section>
  );
}
