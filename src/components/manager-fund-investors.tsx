import { useApplicationRoute, useInvestorRecordRoute } from "@/lib/use-investor-record-route";
import { useMemo, useState, type ReactNode } from "react";
import { InvestorRecordsSync } from "@/components/investor-records-sync";
import { funnelStageOf, managerBucketOf, FUNNEL_LABELS, MANAGER_BUCKET_LABELS } from "@/lib/dashboard-metrics";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link as LinkIcon, Plus, X } from "lucide-react";
import { InvestorActionsMenu } from "@/components/investor-actions-menu";
import { linkedInvestorRecords } from "@/lib/linked-investor-navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddExistingInvestor } from "@/components/add-existing-investor";
import { BulkAddInvestors } from "@/components/bulk-add-investors";
import { BulkInvestorRecords } from "@/components/bulk-investor-records";
import { CreateInvestor } from "@/components/create-investor";
import { FundOnboardingSettings } from "@/components/fund-onboarding-settings";
import { FundEligibilitySetup } from "@/components/fund-eligibility-setup";
import { ManagerAddInvestor } from "@/components/manager-add-investor";
import { PrepareInvestor } from "@/components/prepare-investor";
import { copyText, FundOnboardingLinkCard } from "@/components/fund-onboarding-link";
import { getFundInvestorActions, removeFundAccess } from "@/lib/invitations.functions";
import { fundReadinessFn, managerOnboardingBoardFn } from "@/lib/investor-onboarding.functions";
import { ResendInviteButton, ResendInviteMenuItem } from "@/components/invite-resend";
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

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
export function ManagerFundInvestors({ fundId, extraTabs }: { fundId: string; extraTabs?: { value: string; label: string; content: ReactNode }[] | undefined }) {
  const recordTo = useInvestorRecordRoute();
  const applicationTo = useApplicationRoute();
  const [chooser, setChooser] = useState(false);
  const [tab, setTab] = useState("list");
  const qc = useQueryClient();
  const loadRecords = useServerFn(fundInvestorRecordsFn);
  const loadReadiness = useServerFn(fundReadinessFn);
  const loadBoard = useServerFn(managerOnboardingBoardFn);
  const loadActions = useServerFn(getFundInvestorActions);
  const loadHome = useServerFn(getManagerFundHome);
  const loadLink = useServerFn(getFundLinkFn);
  const remove = useServerFn(removeFromFundFn);
  const revoke = useServerFn(removeFundAccess);

  const records = useQuery({ queryKey: ["fund-investor-records", fundId], queryFn: () => loadRecords({ data: { offeringId: fundId } }) });
  const readiness = useQuery({ queryKey: ["fund-readiness", fundId], queryFn: () => loadReadiness({ data: { offeringId: fundId } }), retry: false });
  const board = useQuery({ queryKey: ["fund-investor-progress", fundId], queryFn: () => loadBoard({ data: { offeringId: fundId } }) });
  const actions = useQuery({ queryKey: ["fund-investor-actions", fundId], queryFn: () => loadActions({ data: { fundId } }) });
  const home = useQuery({ queryKey: ["manager-fund-home", fundId], queryFn: () => loadHome({ data: { offeringId: fundId } }) });

  const initial = useRouterState({ select: (st) => (st.location.search as any)?.add as string | undefined });
  const [panel, setPanel] = useState<Panel>(initial ? PANEL_FROM_SEARCH[initial] ?? null : null);
  const toggle = (p: Panel) => setPanel(panel === p ? null : p);
  const [search, setSearch] = useState("");
  const drill = useRouterState({ select: (st) => ({ stage: (st.location.search as any)?.stage as string | undefined, bucket: (st.location.search as any)?.bucket as string | undefined }) });
  const isStaff = Boolean(records.data?.isStaff ?? actions.data?.isStaff);

  const refresh = () => ["fund-investor-records", "fund-readiness", "fund-investor-progress", "fund-investor-actions", "manager-fund-home"].forEach((k) => qc.invalidateQueries({ queryKey: [k, fundId] }));
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error((e as Error).message); } };
  const copyLink = async () => {
    try { const d = await loadLink({ data: { offeringId: fundId } }); if (d.url) await copyText(d.url, "Onboarding link copied"); else toast.message("No active onboarding link yet. Open the Onboarding Link tab to set one up."); }
    catch (e) { toast.error((e as Error).message); }
  };

  const readinessRows = ((readiness.data as any)?.rows ?? []) as any[];
  const readinessById = useMemo(() => new Map(readinessRows.map((r) => [r.onboardingId, r])), [readinessRows]);
  const items = records.data?.items ?? [];
  const linkedRecords = linkedInvestorRecords(fundId, items);
  // Invitations: onboarding invites not yet opened + fund-access invitees who haven't started. Never shown as investments.
  const pendingOnboard = (((board.data as any)?.items ?? []) as any[]).filter((i) => String(i.id).startsWith("invite:"));
  const pendingAccess = actions.data?.pending ?? [];
  const legacy = ((home.data?.applications ?? []) as any[]);
  const summary = fundInvestorsSummary(items.map((i) => i.onboardingId), readinessRows, pendingOnboard.length + pendingAccess.length);

  const term = search.trim().toLowerCase();
  const drillMatch = (onboardingId: string) => {
    if (!drill.stage && !drill.bucket) return true;
    const rr = readinessById.get(onboardingId);
    if (!rr) return false;
    const fact = { onboardingId, offeringId: fundId, fundingStatus: null, intendedCents: null, readiness: rr.readiness };
    return (!drill.stage || funnelStageOf(fact) === drill.stage) && (!drill.bucket || managerBucketOf(fact) === drill.bucket);
  };
  const shown = items.filter((r) => drillMatch(r.onboardingId)).filter((r) => !term || r.name.toLowerCase().includes(term) || (r.profileLabel ?? "").toLowerCase().includes(term));
  const shownLegacy = legacy.filter(() => !drill.stage && !drill.bucket).filter((a) => !term || String(a.name ?? "").toLowerCase().includes(term));

  if (records.isLoading) return <p className="text-sm text-muted-foreground">Loading investors…</p>;
  if (records.error) return <p className="text-sm text-destructive">{(records.error as Error).message}</p>;

  const rowMenu = (r: (typeof items)[number]) => (
    <InvestorActionsMenu
      name={r.name}
      open={<Link to={recordTo} params={{ fundId, onboardingId: r.onboardingId }}>Open investor</Link>}
      details={<Link to={recordTo} params={{ fundId, onboardingId: r.onboardingId }} search={{ tab: "profile" }}>{r.hasAccount && !isStaff ? "Suggest detail changes" : "Edit investor details"}</Link>}
      investment={<Link to={recordTo} params={{ fundId, onboardingId: r.onboardingId }} search={{ tab: "investment" }}>Edit investment</Link>}
      readiness={<Link to={recordTo} params={{ fundId, onboardingId: r.onboardingId }} search={{ tab: "readiness" }}>View readiness</Link>}
      perspective={isStaff && r.hasAccount ? <Link to="/ops/readiness">View client perspective</Link> : undefined}
      removal={<DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm(`Remove ${r.name} from this Fund? Their person record, other Funds and history are kept.`)) run(() => remove({ data: { onboardingId: r.onboardingId } }), "Removed from Fund"); }}>Remove from Fund</DropdownMenuItem>}
    />
  );
  const legacyMenu = (applicationId: string, name: string) => {
    const a = actions.data?.rows[applicationId];
    const userId = a?.userId;
    return (
      <InvestorActionsMenu
        name={name}
        open={<Link to={applicationTo} params={{ applicationId }}>Open investor</Link>}
        invitation={a?.invitationId ? <ResendInviteMenuItem target={{ kind: "fund", id: a.invitationId }} label="Resend invitation" /> : undefined}
        removal={userId ? <DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm(`Revoke ${name}'s access to this fund? Their account and past records are kept.`)) run(() => revoke({ data: { userId, offeringId: fundId, role: "investor" } }), "Fund access revoked"); }}>Revoke fund access</DropdownMenuItem> : undefined}
      />
    );
  };
  const readinessCell = (id: string) => {
    const rr = readinessById.get(id); const st = rosterReadiness(rr);
    return { st, label: ROSTER_READINESS_LABELS[st], next: rr?.nextAction?.label ?? (st === "unknown" ? "-" : "No action needed"), owner: rosterOwner(rr) };
  };

  /** One plain status per row: problems with the record win, otherwise investment readiness. */
  const oneStatus = (r: (typeof items)[number]) => {
    const rc = readinessCell(r.onboardingId);
    if (r.recordStatus === "conflict_detected" || r.recordStatus === "needs_harmonious_review") return { label: r.recordStatusLabel, tone: recordTone[r.recordStatus], rc };
    if (r.recordStatus === "missing_information" && rc.st !== "closed") return { label: "Details missing", tone: "outline" as const, rc };
    return { label: rc.label, tone: readinessTone[rc.st], rc };
  };
  const nextLine = (rc: ReturnType<typeof readinessCell>) => rc.owner && rc.owner !== "-" && rc.next !== "No action needed" ? `${rc.owner}: ${rc.next}` : rc.next;
  const pendingCount = pendingOnboard.length + pendingAccess.length;
  const addOptions: { p: Panel; title: string; body: string; staff?: boolean }[] = [
    { p: "create", title: "Add one investor", body: "Enter their name and email. We check for an existing record and email them a personal invitation." },
    { p: "records", title: "Upload a list", body: "Add many investors from a spreadsheet. You see a preview before anything is saved." },
    { p: "bulkInvite", title: "Invite several by email", body: "Paste email addresses to send fund invitations." },
    { p: "prep", title: "Prepare a draft", body: "Fill in an investor's details for review before they are invited." },
    { p: "existing", title: "Add an existing investor", body: "Link someone already on Harmonious to this fund.", staff: true },
  ];
  const panelTitle = addOptions.find((o) => o.p === panel)?.title ?? (panel === "invite" ? "Invite investor" : "");

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl">Investors</h2><p className="mt-1 text-sm text-muted-foreground">Everyone investing in this fund. Click a name to see everything about that investor.</p></div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button className="flex-1 sm:flex-none" onClick={() => setChooser(true)}><Plus className="mr-1 h-4 w-4" />Add investor</Button>
          <Button variant="outline" onClick={copyLink}><LinkIcon className="mr-1 h-4 w-4" />Copy link</Button>
        </div>
      </div>

      <Dialog open={chooser} onOpenChange={setChooser}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add investors</DialogTitle><DialogDescription>Choose how you'd like to add them.</DialogDescription></DialogHeader>
          <div className="grid gap-2">
            {addOptions.filter((o) => !o.staff || isStaff).map((o) => (
              <button key={o.title} type="button" onClick={() => { setPanel(o.p); setChooser(false); }} className="rounded-lg border p-3 text-left transition-colors hover:bg-muted">
                <p className="font-medium">{o.title}</p><p className="text-sm text-muted-foreground">{o.body}</p>
              </button>))}
            <button type="button" onClick={() => { setChooser(false); void copyLink(); }} className="rounded-lg border p-3 text-left transition-colors hover:bg-muted">
              <p className="font-medium">Share the fund link</p><p className="text-sm text-muted-foreground">Copy the onboarding link so investors can sign up themselves.</p>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {panel && <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle className="text-base">{panelTitle}</CardTitle><Button size="icon" variant="ghost" aria-label="Close" onClick={() => setPanel(null)}><X className="h-4 w-4" /></Button></CardHeader>
        <CardContent>
          {panel === "create" && <CreateInvestor fundId={fundId} isStaff={isStaff} onDone={() => { setPanel(null); refresh(); }} />}
          {panel === "records" && <BulkInvestorRecords fundId={fundId} isStaff={isStaff} />}
          {panel === "existing" && <AddExistingInvestor fundId={fundId} />}
          {panel === "invite" && <ManagerAddInvestor fundId={fundId} />}
          {panel === "prep" && <PrepareInvestor fundId={fundId} />}
          {panel === "bulkInvite" && <BulkAddInvestors fundId={fundId} existingEmails={legacy.map((a) => String(a.email ?? "")).filter(Boolean)} />}
        </CardContent>
      </Card>}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
        {([["Investors", summary.total + legacy.length], ["Waiting on investor", summary.needsInvestor + summary.invited], ["Waiting on Harmonious", summary.needsHarmonious], ["Ready or funded", summary.ready + summary.funded]] as const).map(([l, v]) => (
          <div key={l} className="bg-card p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="font-heading text-xl font-semibold">{v}</p></div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="list">Investors</TabsTrigger>
          <TabsTrigger value="invites">Invitations{pendingCount ? ` (${pendingCount})` : ""}</TabsTrigger>
          {extraTabs?.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input className="sm:w-64" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search investors" aria-label="Search investors" />
            {drill.stage || drill.bucket ? <p className="text-sm">Showing: <b>{drill.stage ? (FUNNEL_LABELS as any)[drill.stage] ?? drill.stage : (MANAGER_BUCKET_LABELS as any)[drill.bucket!] ?? drill.bucket}</b> · <Link to="/manager/fund/$fundId/investors" params={{ fundId }} className="underline">Show all</Link></p> : null}
          </div>
          {shown.length === 0 && shownLegacy.length === 0 ? <p className="rounded-md border py-8 text-center text-sm text-muted-foreground">{term ? "No investors match your search." : "No investors yet. Use Add investor to begin."}</p> :
            <ul className="divide-y rounded-md border">
              {shown.map((r) => { const s = oneStatus(r); return (
                <li key={r.onboardingId} className="flex items-center gap-3 p-3 hover:bg-muted/30">
                  <Link to={recordTo} params={{ fundId, onboardingId: r.onboardingId }} className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)] sm:items-center sm:gap-4">
                    <div className="min-w-0"><p className="truncate font-medium">{r.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.profileLabel ?? r.profileType ?? "Profile needed"}{r.claimState === "prepared" ? " · Not signed in yet" : ""}</p></div>
                    <p className="text-sm">{money(r.amountCents)}</p>
                    <div className="min-w-0"><Badge variant={s.tone}>{s.label}</Badge><p className="mt-1 truncate text-xs text-muted-foreground">{nextLine(s.rc)}</p></div>
                  </Link>{rowMenu(r)}
                </li>); })}
              {shownLegacy.map((row: any) => { const s = managerRowFromApplication(row); const linked = linkedRecords.get(row.applicationId); return (
                <li key={row.applicationId} className="flex items-center gap-3 p-3 hover:bg-muted/30">
                  <Link {...(linked ? { to: recordTo, params: { fundId, onboardingId: linked.onboardingId } } : { to: applicationTo, params: { applicationId: row.applicationId } })} className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)] sm:items-center sm:gap-4">
                    <div className="min-w-0"><p className="truncate font-medium">{s.investor}</p><p className="truncate text-xs text-muted-foreground">{prettyStatus(s.investingAs)} · Earlier application</p></div>
                    <p className="text-sm">{money(s.commitmentCents)}</p>
                    <div className="min-w-0"><Badge variant="outline">{prettyStatus(row.stage)}</Badge><p className="mt-1 truncate text-xs text-muted-foreground">{s.nextAction}</p></div>
                  </Link>{linked ? rowMenu(linked) : legacyMenu(row.applicationId, s.investor)}
                </li>); })}
            </ul>}
          {isStaff ? <InvestorRecordsSync fundId={fundId} /> : null}
        </TabsContent>

        <TabsContent value="invites">
          <p className="mb-3 text-sm text-muted-foreground">Invited but not started yet. Emails only go out again when you click Resend.</p>
          {pendingCount === 0 ? <p className="rounded-md border py-8 text-center text-sm text-muted-foreground">No pending invitations.</p> : (
            <ul className="divide-y rounded-md border">
              {pendingOnboard.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium">{i.investorName}</p><p className="text-xs text-muted-foreground">Invited{i.requestedAmountCents ? ` · intends ${money(i.requestedAmountCents)}` : ""}</p></div>
                  <ResendInviteButton target={{ kind: "onboarding", invitationId: String(i.id).slice(7) }} label="Resend invitation" />
                </li>))}
              {pendingAccess.map((p) => (
                <li key={p.userId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium">{p.name}</p><p className="text-xs text-muted-foreground">Has fund access · onboarding not begun</p></div>
                  <div className="flex gap-2">
                    {p.invitationId ? <ResendInviteButton target={{ kind: "fund", id: p.invitationId }} /> : null}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (window.confirm(`Revoke ${p.name}'s access to this fund?`)) run(() => revoke({ data: { userId: p.userId, offeringId: fundId, role: "investor" } }), "Fund access revoked"); }}>Revoke</Button>
                  </div>
                </li>))}
            </ul>)}
        </TabsContent>

        {extraTabs?.map((t) => <TabsContent key={t.value} value={t.value}>{tab === t.value ? t.content : null}</TabsContent>)}

        <TabsContent value="settings" className="space-y-5">
          {tab === "settings" && <><FundOnboardingLinkCard fundId={fundId} /><FundOnboardingSettings fundId={fundId} /><FundEligibilitySetup fundId={fundId} /></>}
        </TabsContent>
      </Tabs>
    </section>
  );
}
