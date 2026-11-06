import { InviteInvestorMenuItem } from "@/components/personal-investment-link";
import { FillForInvestorButton } from "@/components/fill-for-investor";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { AddExistingInvestor } from "@/components/add-existing-investor";
import { BulkAddInvestors } from "@/components/bulk-add-investors";
import { BulkInvestorRecords } from "@/components/bulk-investor-records";
import { CreateInvestor } from "@/components/create-investor";
import { FundOnboardingSettings } from "@/components/fund-onboarding-settings";
import { FundEligibilitySetup } from "@/components/fund-eligibility-setup";
import { ManagerAddInvestor } from "@/components/manager-add-investor";
import { PrepareInvestor } from "@/components/prepare-investor";
import { copyText, FundOnboardingLinkCard } from "@/components/fund-onboarding-link";
import { getFundInvestorActions, removeFundAccess, removeLegacyApplicationFromFund } from "@/lib/invitations.functions";
import { fundReadinessFn, managerOnboardingBoardFn } from "@/lib/investor-onboarding.functions";
import { ResendInviteButton, ResendInviteMenuItem } from "@/components/invite-resend";
import { fundInvestorRecordsFn, removeFromFundFn } from "@/lib/investor-record.functions";
import { getFundLinkFn } from "@/lib/fund-onboarding-link.functions";
import { getManagerFundHome } from "@/lib/manager-fund.functions";
import { managerRowFromApplication } from "@/lib/prepared-investor-workflow";
import {
  CLAIM_STATE_LABELS, ROSTER_READINESS_LABELS, fundInvestorsSummary, rosterReadiness, rosterOwner, rosterFilterMatches, rosterProgress, type RosterFilter,
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
export function ManagerFundInvestors({ fundId, moreSections }: { fundId: string; moreSections?: ReactNode }) {
  const recordTo = useInvestorRecordRoute();
  const applicationTo = useApplicationRoute();
  const [chooser, setChooser] = useState(false);
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [moreOpen, setMoreOpen] = useState(false);
  const qc = useQueryClient();
  const loadRecords = useServerFn(fundInvestorRecordsFn);
  const loadReadiness = useServerFn(fundReadinessFn);
  const loadBoard = useServerFn(managerOnboardingBoardFn);
  const loadActions = useServerFn(getFundInvestorActions);
  const loadHome = useServerFn(getManagerFundHome);
  const loadLink = useServerFn(getFundLinkFn);
  const remove = useServerFn(removeFromFundFn);
  const revoke = useServerFn(removeFundAccess);
  const removeLegacy = useServerFn(removeLegacyApplicationFromFund);

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
    try { const d = await loadLink({ data: { offeringId: fundId } }); if (d.url) await copyText(d.url, "Onboarding link copied"); else toast.message("No active onboarding link yet. Open More for this fund below the list to set one up."); }
    catch (e) { toast.error((e as Error).message); }
  };

  const readinessRows = ((readiness.data as any)?.rows ?? []) as any[];
  const readinessById = useMemo(() => new Map(readinessRows.map((r) => [r.onboardingId, r])), [readinessRows]);
  const items = records.data?.items ?? [];
  const linkedRecords = linkedInvestorRecords(fundId, items);
  // Invitations: onboarding invites not yet opened + fund-access invitees who haven't started. Never shown as investments.
  // Display-only de-duplication: the same person can appear as an investment, an earlier application and an invitation.
  // Investments are the canonical roster; other rows show only when they don't match an investment already listed.
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  // Same email = same investor on this list (one row per person); names alone are kept too since this is display-only.
  const itemNames = new Set(items.map((i) => norm(i.name)).filter(Boolean));
  const itemEmails = new Set(items.map((i) => norm(i.email)).filter(Boolean));
  const known = (name: unknown, email: unknown, names: Set<string>, emails: Set<string>) => (norm(email) && emails.has(norm(email))) || (norm(name) && (names.has(norm(name)) || emails.has(norm(name))));
  const legacy = ((home.data?.applications ?? []) as any[]).filter((a) => !linkedRecords.has(a.applicationId) && !known(a.name, a.email, itemNames, itemEmails));
  const knownNames = new Set([...itemNames, ...legacy.map((a) => norm(a.name)).filter(Boolean)]);
  const knownEmails = new Set([...itemEmails, ...legacy.map((a) => norm(a.email)).filter(Boolean)]);
  const pendingOnboard = (((board.data as any)?.items ?? []) as any[]).filter((i) => String(i.id).startsWith("invite:")).filter((i) => !known(i.investorName, i.email ?? i.investorEmail, knownNames, knownEmails));
  const pendingAccess = (actions.data?.pending ?? []).filter((p: any) => !known(p.name, p.email, knownNames, knownEmails));
  const countsLoading = readiness.isLoading || board.isLoading || actions.isLoading || home.isLoading;
  const summary = fundInvestorsSummary(items.map((i) => i.onboardingId), readinessRows, pendingOnboard.length + pendingAccess.length);

  const term = search.trim().toLowerCase();
  const drillMatch = (onboardingId: string) => {
    if (!drill.stage && !drill.bucket) return true;
    const rr = readinessById.get(onboardingId);
    if (!rr) return false;
    const fact = { onboardingId, offeringId: fundId, fundingStatus: null, intendedCents: null, readiness: rr.readiness };
    return (!drill.stage || funnelStageOf(fact) === drill.stage) && (!drill.bucket || managerBucketOf(fact) === drill.bucket);
  };
  const shown = items.filter((r) => drillMatch(r.onboardingId)).filter((r) => rosterFilterMatches(filter, readinessById.get(r.onboardingId))).filter((r) => !term || r.name.toLowerCase().includes(term) || (r.profileLabel ?? "").toLowerCase().includes(term));
  const shownLegacy = legacy.filter(() => !drill.stage && !drill.bucket && filter === "all").filter((a) => !term || String(a.name ?? "").toLowerCase().includes(term));

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
      invitation={!r.hasAccount ? <InviteInvestorMenuItem onboardingId={r.onboardingId} /> : undefined}
      removal={<DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm(`Remove ${r.name} from this Fund? Their person record, other Funds and history are kept.`)) run(() => remove({ data: { onboardingId: r.onboardingId } }), "Removed from Fund"); }}>Remove from Fund</DropdownMenuItem>}
    />
  );
  const legacyMenu = (applicationId: string, name: string) => {
    const a = actions.data?.rows[applicationId];
    return (
      <InvestorActionsMenu
        name={name}
        open={<Link to={applicationTo} params={{ applicationId }}>Open investor</Link>}
        invitation={a?.invitationId ? <ResendInviteMenuItem target={{ kind: "fund", id: a.invitationId }} label="Resend invitation" /> : undefined}
        removal={<DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm(`Remove ${name} from this Fund? Their account and past records are kept.`)) run(() => removeLegacy({ data: { applicationId, offeringId: fundId } }), "Removed from Fund"); }}>Remove from Fund</DropdownMenuItem>}
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
  const STAGE_TONE: Record<string, string> = { complete: "border-primary bg-primary/10 text-primary", not_applicable: "border-muted text-muted-foreground line-through" };
  const stageChips = (id: string) => {
    const st = (readinessById.get(id) as any)?.readiness?.stages as { stage: string; title: string; status: string }[] | undefined;
    if (!st?.length) return null;
    return <div className="mt-1 flex flex-wrap gap-1">{st.map((g) => <span key={g.stage} title={g.status === "complete" ? "Done" : g.status.replace(/_/g, " ")} className={`rounded border px-1.5 py-0.5 text-[11px] ${STAGE_TONE[g.status] ?? "border-destructive/40 text-destructive"}`}>{g.status === "complete" ? "✓ " : ""}{g.title}</span>)}</div>;
  };
  const progressLine = (id: string) => { const p = rosterProgress(readinessById.get(id)); return p ? `Done ${p.done} of ${p.total}` : null; };
  const nextLine = (rc: ReturnType<typeof readinessCell>) => rc.owner && rc.owner !== "-" && rc.next !== "No action needed" ? `${rc.owner}: ${rc.next}` : rc.next;
  const pendingCount = pendingOnboard.length + pendingAccess.length;
  const showInvites = !drill.stage && !drill.bucket && (filter === "all" || filter === "investor");
  const shownInvites = showInvites ? pendingCount : 0;
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

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4" role="group" aria-label="Filter investors">
        {([["all", "Investors", summary.total + legacy.length + pendingCount], ["investor", "Waiting on investor", summary.needsInvestor + summary.invited], ["harmonious", "Waiting on Harmonious", summary.needsHarmonious], ["done", "Ready or funded", summary.ready + summary.funded]] as const).map(([k, l, v]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(filter === k && k !== "all" ? "all" : k)} className={`p-3 text-left transition-colors ${filter === k ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
            <p className={`text-xs ${filter === k ? "" : "text-muted-foreground"}`}>{l}</p><p className="font-heading text-xl font-semibold">{countsLoading ? "…" : v}</p>
          </button>
        ))}
      </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input className="sm:w-64" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search investors" aria-label="Search investors" />
            {drill.stage || drill.bucket ? <p className="text-sm">Showing: <b>{drill.stage ? (FUNNEL_LABELS as any)[drill.stage] ?? drill.stage : (MANAGER_BUCKET_LABELS as any)[drill.bucket!] ?? drill.bucket}</b> · <Link to="/manager/fund/$fundId/investors" params={{ fundId }} className="underline">Show all</Link></p> : null}
          </div>
          {shown.length === 0 && shownLegacy.length === 0 && shownInvites === 0 ? <p className="rounded-md border py-8 text-center text-sm text-muted-foreground">{term ? "No investors match your search." : "No investors yet. Use Add investor to begin."}</p> :
            <ul className="divide-y rounded-md border">
              {shown.map((r) => { const s = oneStatus(r); return (
                <li key={r.onboardingId} className="flex items-center gap-3 p-3 hover:bg-muted/30">
                  <Link to={recordTo} params={{ fundId, onboardingId: r.onboardingId }} className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)] sm:items-center sm:gap-4">
                    <div className="min-w-0"><p className="truncate font-medium">{r.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.profileLabel ?? r.profileType ?? "Profile needed"}{r.claimState === "prepared" ? " · Not signed in yet" : ""}</p></div>
                    <p className="text-sm">{money(r.amountCents)}</p>
                    <div className="min-w-0"><Badge variant={s.tone}>{s.label}</Badge><p className="mt-1 truncate text-xs text-muted-foreground">{[progressLine(r.onboardingId), nextLine(s.rc)].filter(Boolean).join(" · ")}</p>{stageChips(r.onboardingId)}</div>
                  </Link><FillForInvestorButton onboardingId={r.onboardingId} name={r.name} />{rowMenu(r)}
                </li>); })}
              {shownLegacy.map((row: any) => { const s = managerRowFromApplication(row); const linked = linkedRecords.get(row.applicationId); return (
                <li key={row.applicationId} className="flex items-center gap-3 p-3 hover:bg-muted/30">
                  <Link {...(linked ? { to: recordTo, params: { fundId, onboardingId: linked.onboardingId } } : { to: applicationTo, params: { applicationId: row.applicationId } })} className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)] sm:items-center sm:gap-4">
                    <div className="min-w-0"><p className="truncate font-medium">{s.investor}</p><p className="truncate text-xs text-muted-foreground">{prettyStatus(s.investingAs)} · Earlier application</p></div>
                    <p className="text-sm">{money(s.commitmentCents)}</p>
                    <div className="min-w-0"><Badge variant="outline">{prettyStatus(row.stage)}</Badge><p className="mt-1 truncate text-xs text-muted-foreground">{s.nextAction}</p></div>
                  </Link>{linked ? rowMenu(linked) : legacyMenu(row.applicationId, s.investor)}
                </li>); })}
              {showInvites && pendingOnboard.filter((i) => !term || String(i.investorName ?? "").toLowerCase().includes(term)).map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium">{i.investorName}</p><p className="text-xs text-muted-foreground"><Badge variant="outline" className="mr-1">Invited</Badge>Not started{i.requestedAmountCents ? ` · intends ${money(i.requestedAmountCents)}` : ""}</p></div>
                  <ResendInviteButton target={{ kind: "onboarding", invitationId: String(i.id).slice(7) }} label="Resend invitation" />
                </li>))}
              {showInvites && pendingAccess.filter((p) => !term || String(p.name ?? "").toLowerCase().includes(term)).map((p) => (
                <li key={p.userId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium">{p.name}</p><p className="text-xs text-muted-foreground"><Badge variant="outline" className="mr-1">Invited</Badge>Has fund access, not started</p></div>
                  <div className="flex gap-2">
                    {p.invitationId ? <ResendInviteButton target={{ kind: "fund", id: p.invitationId }} /> : null}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (window.confirm(`Revoke ${p.name}'s access to this fund?`)) run(() => revoke({ data: { userId: p.userId, offeringId: fundId, role: "investor" } }), "Fund access revoked"); }}>Revoke</Button>
                  </div>
                </li>))}
            </ul>}
          {isStaff ? <InvestorRecordsSync fundId={fundId} /> : null}
        </div>

      <Collapsible open={moreOpen} onOpenChange={setMoreOpen} className="rounded-xl border">
        <CollapsibleTrigger className="flex w-full items-center justify-between p-3 text-left font-medium">More for this fund: link, settings and reports<ChevronDown className={`h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`} /></CollapsibleTrigger>
        <CollapsibleContent className="space-y-5 border-t p-3">
          {moreOpen && <><FundOnboardingLinkCard fundId={fundId} /><FundOnboardingSettings fundId={fundId} /><FundEligibilitySetup fundId={fundId} />{moreSections}</>}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
