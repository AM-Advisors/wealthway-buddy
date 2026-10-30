import { useInvestorRecordRoute } from "@/lib/use-investor-record-route";
import { InvestorEconomicsCard } from "@/components/fund-tabs/investor-economics";
import { currentStep, STEP_STATE_LABELS, type StepState, type StepStatus } from "@/lib/investor-step-status";
import { useState, type ReactNode } from "react";
import { remindInvestorItemFn } from "@/lib/document-reminders.functions";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApprovalButton } from "@/components/approval-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { FundOnboardingLinkCard } from "@/components/fund-onboarding-link";
import { ManagerAddInvestor } from "@/components/manager-add-investor";
import { approveToFundFn, fundReadinessFn } from "@/lib/investor-onboarding.functions";
import { STAGE_LABELS, type OnboardingStage } from "@/lib/investor-onboarding-model";
import { investorDetailFn, investorGridFn, lastRemindersFn, sendInvestorRemindersFn, managerInvestorSignedCopyFn, managerInvestorTaxFormFn, sendSubscriptionSignNoticeFn } from "@/lib/fund-tabs.functions";
import { bulkSendKycLinksFn, bulkSetClassFn, listInvestorDuplicatesFn, mergeInvestorsFn, requestMissingInfoFn } from "@/lib/investor-bulk.functions";
import { reminderAllowed, reminderStep } from "@/lib/fund-health";
import { toast } from "sonner";
import { investorLevelsFn } from "@/lib/fund-tabs.functions";
import { FEATURE_LABELS, LEVELS, portalFeatures } from "@/lib/investor-levels";
import { INVESTOR_TIERS } from "@/lib/product-pricing";
import { fmtDate, usd } from "./shared";
import { InviteInvestorButton, PersonalInvestmentLinkCard, PersonalLinkCopyButton } from "@/components/personal-investment-link";
import { InvestorEmailHistory, InvestorHelpers, InvestorQuickEdit } from "@/components/investor-panel-extras";
import { InvestorPeopleAndContacts } from "@/components/investor-people-contacts";
import { InvestorPriorVerification } from "@/components/investor-prior-verification";
import { PriorSignedDocuments } from "@/components/prior-signed-documents";
import { ClassAssignmentCard } from "@/components/fund-setup-phase3";
import { SideLetterRegistry } from "@/components/side-letter-registry";
import { InvestmentChecklist } from "@/components/investment-readiness";
import { OnboardingProofReview } from "@/components/onboarding-proof-review";

export function InvestorsTab({ fundId, workQueue }: { fundId: string; workQueue?: ReactNode }) {
  const recordTo = useInvestorRecordRoute();
  const load = useServerFn(investorGridFn);
  const q = useQuery({ queryKey: ["fund-investor-grid", fundId], queryFn: () => load({ data: { fundId } }) });
  const loadReady = useServerFn(fundReadinessFn);
  const rq = useQuery({ queryKey: ["fund-readiness", fundId], queryFn: () => loadReady({ data: { offeringId: fundId } }), retry: false });
  const ready = new Map(((rq.data?.rows ?? []) as any[]).map((x) => [x.onboardingId, x]));
  const navigate = useNavigate();
  const [invite, setInvite] = useState(false);
  const rows = q.data ?? [];
  const classApplicable = rows.some((r) => r.classApplicable);
  const loadLast = useServerFn(lastRemindersFn);
  const remind = useServerFn(sendInvestorRemindersFn);
  const lq = useQuery({ queryKey: ["fund-reminders", fundId], queryFn: () => loadLast({ data: { fundId } }) });
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [classOpen, setClassOpen] = useState(false);
  const [classKey, setClassKey] = useState("");
  const bulkKyc = useServerFn(bulkSendKycLinksFn);
  const bulkClass = useServerFn(bulkSetClassFn);
  const askMissing = useServerFn(requestMissingInfoFn);
  const dupLoad = useServerFn(listInvestorDuplicatesFn);
  const dupQ = useQuery({ queryKey: ["fund-investor-duplicates", fundId], queryFn: () => dupLoad({ data: { fundId } }) });
  const canRemind = (r: any) => !!r.email && !!reminderStep(r.stage, r.docs, r.wiring) && reminderAllowed(lq.data?.[r.id] ?? null);
  const allPicked = rows.length > 0 && picked.length === rows.length;
  const toggleAll = (on: boolean) => setPicked(on ? rows.map((r) => r.id) : []);
  const committed = rows.reduce((s, r) => s + (r.committedCents ?? 0), 0);
  const received = rows.reduce((s, r) => s + (r.receivedCents ?? 0), 0);
  async function sendReminders() {
    setSending(true);
    try {
      const res = await remind({ data: { fundId, onboardingIds: picked } });
      const sent = res.filter((x) => x.outcome === "sent").length;
      const other = res.length - sent;
      const why = res.filter((x) => x.outcome !== "sent").map((x) => `${rows.find((r) => r.id === x.id)?.name ?? "Investor"}: ${x.reason ?? x.outcome}`).join("; ");
      toast.success(`${sent} reminder${sent === 1 ? "" : "s"} sent${other ? `, ${other} not sent` : ""}.`, why ? { description: why, duration: 12000 } : undefined);
      setPicked([]);
      await lq.refetch();
    } catch (e) { toast.error((e as Error).message); } finally { setSending(false); }
  }
  async function runBulk(fn: () => Promise<string>) {
    setSending(true);
    try { toast.success(await fn()); setPicked([]); await q.refetch(); }
    catch (e) { toast.error((e as Error).message); } finally { setSending(false); }
  }
  const remindItemFn = useServerFn(remindInvestorItemFn);
  const sendKyc = () => runBulk(async () => {
    const res = await bulkKyc({ data: { fundId, onboardingIds: picked } });
    const sent = res.filter((x) => x.outcome === "sent").length;
    const skipped = res.filter((x) => x.outcome === "skipped");
    return `${sent} identity-check link${sent === 1 ? "" : "s"} sent${skipped.length ? `, ${skipped.length} skipped (${skipped[0]?.reason ?? "already done"})` : ""}.`;
  });
  const requestMissing = () => runBulk(async () => {
    const res = await askMissing({ data: { fundId, onboardingIds: picked } });
    return `Asked the fund manager for missing info on ${res.investors} investor${res.investors === 1 ? "" : "s"}.`;
  });
  const remindItem = (kind: "w9" | "questionnaire") => runBulk(async () => {
    const res = await remindItemFn({ data: { fundId, onboardingIds: picked, kind } });
    const sent = res.filter((x) => x.outcome === "sent").length;
    const skipped = res.filter((x) => x.outcome === "skipped");
    return `${sent} ${kind === "w9" ? "W-9" : "questionnaire"} reminder${sent === 1 ? "" : "s"} sent${skipped.length ? `, ${skipped.length} skipped (${skipped[0]?.reason})` : ""}.`;
  });
  const saveClass = () => runBulk(async () => {
    const res = await bulkClass({ data: { fundId, onboardingIds: picked, classKey } });
    setClassOpen(false); setClassKey("");
    return `Class set on ${res.count} investor${res.count === 1 ? "" : "s"}.`;
  });
  return (
    <div className="space-y-6">
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Investors</CardTitle>
          <CardDescription>Click an investor to open their record, every detail, document, verification and action for this deal is in one place. Received counts only money matched to the bank.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!picked.length || sending} onClick={sendReminders}>{sending ? "Working…" : `Send reminder${picked.length ? ` (${picked.length})` : ""}`}</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="sm" variant="outline" disabled={!picked.length || sending}>Actions{picked.length ? ` (${picked.length})` : ""}</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={sendKyc}>Send identity-check links</DropdownMenuItem>
              {classApplicable && <DropdownMenuItem onClick={() => setClassOpen(true)}>Set class…</DropdownMenuItem>}
              <DropdownMenuItem onClick={requestMissing}>Ask manager for missing info</DropdownMenuItem>
              <DropdownMenuItem onClick={() => remindItem("w9")}>Send reminder: W-9 / W-8</DropdownMenuItem>
              <DropdownMenuItem onClick={() => remindItem("questionnaire")}>Send reminder: investor questionnaire</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => setInvite(true)}>Add / invite investors</Button>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length > 0 && committed > 0 && (
          <div className="mb-4 rounded-lg border p-3">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Funding progress</span><span className="font-medium">{usd(received)} received of {usd(committed)} committed</span></div>
            <div className="mt-2 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((received / committed) * 100))}%` }} /></div>
          </div>
        )}
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
          q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> :
         rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No investors yet. Use "Add / invite investors" to share your fund's invite link.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1300px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="w-8 py-2"><input type="checkbox" aria-label="Select all investors" checked={allPicked} onChange={(e) => toggleAll(e.target.checked)} /></th><th className="py-2">Name</th><th>Personal link</th><th>Progress</th>{classApplicable && <th>Class</th>}<th>Investing as</th><th>Missing info</th><th>Email</th><th>Phone</th><th className="text-right">Committed</th><th className="text-right">Received</th><th>KYC/KYB & AML</th><th>Fund documents</th><th>Wiring</th><th>Investor readiness</th><th>Latest activity</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer border-t hover:bg-muted" onClick={() => navigate({ to: recordTo, params: { fundId, onboardingId: r.id } })}>
                    <td className="py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select ${r.name}`} title={canRemind(r) ? "Select for reminders and bulk actions" : "Select for bulk actions (no reminder due)"} checked={picked.includes(r.id)} onChange={(e) => setPicked((p) => e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id))} />
                    </td>
                    <td className="py-2"><p className="font-medium">{r.name}</p>{r.profileName && <p className="text-xs text-muted-foreground">{r.profileName}</p>}</td>
                    <td onClick={(e) => e.stopPropagation()}><PersonalLinkCopyButton onboardingId={r.id} /></td>
                    <td><StepChips steps={r.steps} /><p className="mt-0.5 text-[11px] text-muted-foreground">{(() => { const c = currentStep(r.steps); return c ? `${c.label}: ${STEP_STATE_LABELS[c.state]}` : "All steps complete"; })()}</p></td>
                    {classApplicable && <td>{r.classLabel ?? <span className="text-muted-foreground">-</span>}</td>}
                    <td>{r.assetLabel ?? <span className="text-muted-foreground">-</span>}</td>
                    <td className="max-w-[220px]">{r.missing.length === 0 ? <Badge variant="secondary">Complete</Badge> : (
                      <span title={r.missing.join(", ")} className="text-xs"><Badge variant="outline" className="mr-1 border-destructive/50 text-destructive">{r.missing.length} missing</Badge>{r.missing.slice(0, 2).join(", ")}{r.missing.length > 2 ? "…" : ""}</span>
                    )}</td>
                    <td className="break-all">{r.email ?? "-"}</td>
                    <td>{r.phone ?? "-"}</td>
                    <td className="text-right">{usd(r.committedCents)}</td>
                    <td className="text-right">{usd(r.receivedCents)}</td>
                    <td><Badge variant={r.kycOk ? "secondary" : "outline"} className="whitespace-nowrap capitalize">{r.kycLabel}</Badge></td>
                    <td><Badge variant={r.docs === "Signed" ? "secondary" : "outline"}>{r.docs}</Badge></td>
                    <td><Badge variant={r.wiring === "Funded" ? "secondary" : "outline"}>{r.wiring}</Badge></td>
                    <td className="text-xs">{(() => { const x = ready.get(r.id); if (!x) return <span className="text-muted-foreground">-</span>; return x.closeReady ? <Badge variant="secondary">Ready</Badge> : <span title={x.nextAction?.label ?? ""}>{x.percentComplete ?? 0}% · {x.nextAction?.label ?? "In progress"}</span>; })()}</td>
                    <td className="whitespace-nowrap text-xs text-muted-foreground">{fmtDate(r.lastActivity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      <Dialog open={invite} onOpenChange={setInvite}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add or invite investors</DialogTitle>
            <DialogDescription>Invite someone by email, or share the fund's secure link. Each investor creates their own account and completes About You, Verification, Sign and Fund.</DialogDescription>
          </DialogHeader>
          <ManagerAddInvestor fundId={fundId} compact onSent={() => { void q.refetch(); }} />
          <p className="text-sm font-medium">Or share the fund's link</p>
          <FundOnboardingLinkCard fundId={fundId} />
        </DialogContent>
      </Dialog>
      <Dialog open={classOpen} onOpenChange={setClassOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set class for {picked.length} investor{picked.length === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>Type the class exactly as it should appear, e.g. "Class A".</DialogDescription>
          </DialogHeader>
          <Input value={classKey} onChange={(e) => setClassKey(e.target.value)} placeholder="Class A" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setClassOpen(false)}>Cancel</Button>
            <Button disabled={!classKey.trim() || sending} onClick={saveClass}>Set class</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
    <FundOnboardingLinkCard fundId={fundId} />
    <InvestorLevelsCard fundId={fundId} />
    <InvestorEconomicsCard fundId={fundId} />
    {workQueue}
    {(dupQ.data?.duplicates?.length ?? 0) > 0 && <DuplicatesCard fundId={fundId} groups={dupQ.data!.duplicates} staff={dupQ.data!.staff} onMerged={() => { void q.refetch(); void dupQ.refetch(); }} />}
    </div>
  );
}

function DuplicatesCard({ fundId, groups, staff, onMerged }: { fundId: string; groups: any[][]; staff: boolean; onMerged: () => void }) {
  const merge = useServerFn(mergeInvestorsFn);
  const [busy, setBusy] = useState(false);
  async function doMerge(keepId: string, archiveId: string) {
    const reason = window.prompt("Reason for merging (saved in Audit History):");
    if (!reason?.trim()) return;
    setBusy(true);
    try { await merge({ data: { fundId, keepId, archiveId, reason: reason.trim() } }); toast.success("Records merged."); onMerged(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Possible duplicate investors</CardTitle>
        <CardDescription>Same name or email appears more than once. Merging keeps one record, carries over its documents and tasks, and archives the other, nothing is deleted. Staff only.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map((g, i) => (
          <div key={i} className="rounded-lg border p-3">
            <ul className="divide-y text-sm">
              {g.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><span className="font-medium">{r.name}</span>{r.email ? <span className="ml-2 text-muted-foreground">{r.email}</span> : null}<span className="ml-2 text-xs text-muted-foreground">{usd(r.committedCents)} · {r.docs}</span></span>
                  {staff && g.length === 2 && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => doMerge(r.id, g.find((x) => x.id !== r.id)!.id)}>Keep this one</Button>
                  )}
                </li>
              ))}
            </ul>
            {g.length > 2 && <p className="mt-1 text-xs text-muted-foreground">More than two records match — merge two at a time.</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const STATE_DOT: Record<StepState, string> = {
  complete: "bg-primary text-primary-foreground", in_progress: "border-2 border-primary text-primary",
  waiting_manager: "border-2 border-accent bg-accent/20 text-foreground",
  waiting_harmonious: "border-2 border-accent bg-accent/20 text-foreground", blocked: "bg-destructive text-destructive-foreground", not_started: "bg-muted text-muted-foreground",
};
function StepChips({ steps }: { steps: StepStatus[] }) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((st, i) => (
        <span key={st.key} title={`${st.label}: ${STEP_STATE_LABELS[st.state]} · ${st.detail}`} className={`flex size-6 items-center justify-center rounded-full text-[10px] font-medium ${STATE_DOT[st.state]}`}>{i + 1}</span>
      ))}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3 py-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="text-right break-words">{v || "-"}</dd></div>;
}

export function InvestorSheet({ fundId, id, onClose }: { fundId: string; id: string | null; onClose: () => void }) {
  const recordTo = useInvestorRecordRoute();
  const load = useServerFn(investorDetailFn);
  const q = useQuery({ queryKey: ["fund-investor", fundId, id], queryFn: () => {
    if (!id) throw new Error("Select an investor to review.");
    return load({ data: { fundId, onboardingId: id } });
  }, enabled: !!id });
  const d = q.data;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
        <div className="border-b bg-muted/40 p-6">
          <SheetHeader className="space-y-1 text-left">
            <SheetTitle className="text-xl">{d?.name ?? "Investor"}</SheetTitle>
            <SheetDescription>{d?.profileName ?? "Details for this fund only."}</SheetDescription>
          </SheetHeader>
          {id && <Button asChild size="sm" variant="outline" className="mt-3"><Link to={recordTo} params={{ fundId, onboardingId: id }}>Open full investor record</Link></Button>}
          {d && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge variant={d.kycOk ? "secondary" : "outline"}>{d.kycLabel}</Badge>
              <Badge variant={String(d.docs).startsWith("Signed") && !String(d.docs).includes("pending") ? "secondary" : "outline"}>Docs: {d.docs}</Badge>
              <Badge variant={d.wiring === "Funded" ? "secondary" : "outline"}>Wiring: {d.wiring}</Badge>
              {d.investorUserId && (
                <Button asChild size="sm" className="ml-auto"><Link to="/manager/messages" search={{ open: d.applicationId ?? undefined }}>Message</Link></Button>
              )}
            </div>
          )}
        </div>
        <InvestorReviewPanel fundId={fundId} id={id} />
      </SheetContent>
    </Sheet>
  );
}

export function InvestorReviewPanel({ fundId, id, embedded = false, onOpenItem }: { fundId: string; id: string | null; embedded?: boolean; onOpenItem?: (key: string) => void }) {
  const load = useServerFn(investorDetailFn);
  const approve = useServerFn(approveToFundFn);
  const downloadSigned = useServerFn(managerInvestorSignedCopyFn);
  const openTaxForm = useServerFn(managerInvestorTaxFormFn);
  const sendSign = useServerFn(sendSubscriptionSignNoticeFn);
  const [sendingSign, setSendingSign] = useState<false | string>(false);
  const [termAssociation, setTermAssociation] = useState<"class" | "side_letter" | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [questionnaireFor, setQuestionnaireFor] = useState<string | null>(null);
  const questionnaireOpen = !!id && questionnaireFor === id;
  const q = useQuery({ queryKey: ["fund-investor", fundId, id], queryFn: () => {
    if (!id) throw new Error("Select an investor to review.");
    return load({ data: { fundId, onboardingId: id } });
  }, enabled: !!id });
  const d = q.data;
  const pct = d && d.committedCents ? Math.min(100, Math.round(((d.receivedCents ?? 0) / d.committedCents) * 100)) : 0;
  return (
    <div>
      {embedded && d && <div className="mb-4 flex flex-wrap items-center gap-2">
        {d.investorUserId && <Button asChild size="sm" variant="outline" className="ml-auto"><Link to="/manager/messages" search={{ open: d.applicationId ?? undefined }}>Message</Link></Button>}
      </div>}
        {q.isLoading ? <p className="p-6 text-sm text-muted-foreground">Loading…</p> : q.error ? <div role="alert" className="space-y-2 p-6"><p className="text-sm text-destructive">Investor details couldn’t load.</p><Button variant="outline" onClick={() => void q.refetch()}>Retry</Button></div> : d && (
        <div className={embedded ? "space-y-6 text-sm" : "space-y-6 p-6 text-sm"}>
          {d.canApproveSubscription && (
            <section className="rounded-lg border border-primary/40 bg-primary/5 p-3">
              <h4 className="mb-1 text-lg font-medium">Approve investor to send funds</h4>
              <p className="text-base">The investor can view the fund’s released bank details after approval and completed checks. No separate Harmonious admission is needed to send the wire.</p>
              {<ApprovalButton title="Approve this investor to send funds?" description="The investor will be notified to view this fund’s released bank details in their account. This does not record a payment or complete final admission." className="mt-3" disabled={approving} onApprove={async () => {
                if (!id) return;
                setApproving(true);
                try { await approve({ data: { onboardingId: id } }); toast.success("Investor approved to send funds"); await q.refetch(); }
                catch (error) { toast.error(error instanceof Error ? error.message : "Subscription could not be approved."); }
                finally { setApproving(false); }
              }}>{approving ? "Approving…" : "Approve to send funds"}</ApprovalButton>}
            </section>
          )}
          {id && <section aria-label="Investment status"><InvestmentChecklist onboardingId={id} onOpenItem={onOpenItem} /></section>}
          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Committed</p><p className="text-lg font-semibold">{usd(d.committedCents)}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Received</p><p className="text-lg font-semibold">{usd(d.receivedCents)}</p>
              <div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div></div>
          </section>
          <Tabs defaultValue="details" className="space-y-4">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="details">Details</TabsTrigger><TabsTrigger value="documents">Documents</TabsTrigger><TabsTrigger value="terms">Terms</TabsTrigger><TabsTrigger value="actions">Actions</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="space-y-6">
          <section>
            <h4 className="mb-1 font-medium">Contact</h4>
            <dl className="divide-y">
              <Row k="Email" v={d.email} /><Row k="Phone" v={d.phone} /><Row k="Address" v={d.address} /><Row k="Citizenship" v={d.citizenship} />
              {d.assetLabel === "Individual" && <Row k="Date of birth" v={d.dateOfBirth} />}
            </dl>
          </section>
          <section>
            <h4 className="mb-1 font-medium">Investment</h4>
            <dl className="divide-y">
              <Row k="Terms" v={d.classLabel} /><Row k="Investing as" v={d.assetLabel} /><Row k="Tax ID" v={d.taxIdLast4 ? `•••• ${d.taxIdLast4}` : null} />
              <Row k="Investment date" v={d.investmentDate ? fmtDate(d.investmentDate) : null} />
              <Row k="Stage" v={STAGE_LABELS[d.stage as OnboardingStage] ?? d.stage.replace(/_/g, " ")} />
              <Row k="Latest activity" v={fmtDate(d.lastActivity)} />
            </dl>
            {d.classApplicable && d.canManageTermAssociations && <Button size="sm" variant="outline" className="mt-2" onClick={() => setTermAssociation("class")}>Associate class</Button>}
          </section>
            </TabsContent>
            <TabsContent value="documents" className="space-y-6">
          {d.reviewEvidence && <>
            <section className="space-y-3" aria-label="Signed fund documents">
              <h4 className="font-medium">Signed fund documents</h4>
              {d.reviewEvidence.signedDocuments.length ? d.reviewEvidence.signedDocuments.map((doc) => <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div className="min-w-0"><p className="break-words font-medium">{doc.title}</p><p className="text-xs text-muted-foreground">{doc.version != null ? `Version ${doc.version}` : "Version not recorded"} · {fmtDate(doc.signedAt)}{doc.replaced ? " · Replaced, retained copy" : " · Signed"}</p></div>
                {doc.hasCopy ? <Button size="sm" variant="outline" disabled={downloading !== null} onClick={async () => {
                  if (!id) return;
                  setDownloading(doc.id);
                  try { const result = await downloadSigned({ data: { fundId, onboardingId: id, signatureId: doc.id } }); const link = document.createElement("a"); link.href = result.url; link.download = ""; link.rel = "noreferrer"; link.click(); }
                  catch (error) { toast.error(error instanceof Error ? error.message : "The signed copy could not be opened."); }
                  finally { setDownloading(null); }
                }}>{downloading === doc.id ? "Opening…" : "Download signed copy"}</Button> : <span className="text-muted-foreground">Signed copy pending</span>}
              </div>) : <p className="text-muted-foreground">No submitted signed documents yet.</p>}
              {(d.reviewEvidence.taxForms ?? []).map((tf: { id: string; label: string; certifiedAt: string | null; hasCopy: boolean }) => <div key={tf.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div className="min-w-0"><p className="font-medium">Tax form ({tf.label})</p><p className="text-xs text-muted-foreground">{tf.certifiedAt ? `${fmtDate(tf.certifiedAt)} · ` : ""}Signed</p></div>
                {tf.hasCopy ? <Button size="sm" variant="outline" disabled={downloading !== null} onClick={async () => {
                  if (!id) return;
                  setDownloading(tf.id);
                  try { const result = await openTaxForm({ data: { fundId, onboardingId: id, taxFormId: tf.id } }); const link = document.createElement("a"); link.href = result.url; link.download = ""; link.rel = "noreferrer"; link.click(); }
                  catch (error) { toast.error(error instanceof Error ? error.message : "The signed tax form could not be opened."); }
                  finally { setDownloading(null); }
                }}>{downloading === tf.id ? "Opening…" : `Download ${tf.label}`}</Button> : <span className="text-muted-foreground">Signed copy pending</span>}
              </div>)}
              {d.reviewEvidence.acknowledgments.map((doc: { id: string; title: string; version: number; acknowledgedAt: string }) => <div key={doc.id} className="border-b pb-2"><p className="font-medium">{doc.title}</p><p className="text-xs text-muted-foreground">Version {doc.version} · {fmtDate(doc.acknowledgedAt)} · Acknowledged and agreed</p></div>)}
            </section>
            {id && <PriorSignedDocuments fundId={fundId} onboardingId={id} />}
            <section aria-label="Investor questionnaire">
              <Collapsible open={questionnaireOpen} onOpenChange={(o) => setQuestionnaireFor(o ? id : null)} className="rounded-lg border">
                <CollapsibleTrigger className="flex w-full items-center gap-2 p-3 text-left transition-colors hover:bg-muted/50">
                  {questionnaireOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="flex-1 font-medium">Investor questionnaire</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{d.reviewEvidence.questionnaireSubmittedAt ? `${d.reviewEvidence.questionnaire.length} answers · Submitted ${fmtDate(d.reviewEvidence.questionnaireSubmittedAt)}` : "Not submitted"}</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-3 pb-3">
                  {d.reviewEvidence.questionnaireSubmittedAt ? <dl className="space-y-3 border-t pt-3">{d.reviewEvidence.questionnaire.map((answer) => <div key={answer.key} className="border-b pb-2"><dt className="break-words text-muted-foreground">{answer.label}</dt><dd className="mt-1 whitespace-pre-line break-words">{answer.answer}</dd></div>)}</dl> : <p className="border-t pt-3 text-muted-foreground">Questionnaire has not been submitted.</p>}
                </CollapsibleContent>
              </Collapsible>
            </section>
            <section className="space-y-2" aria-label="Accreditation">
              <h4 className="font-medium">Accreditation</h4>
              {d.reviewEvidence.accreditation ? (() => { const a = d.reviewEvidence.accreditation; return <dl className="space-y-2">
                <div className="flex justify-between gap-3 border-b pb-2"><dt className="text-muted-foreground">Status</dt><dd className="font-medium">{a.status}</dd></div>
                {a.basis && <div className="flex justify-between gap-3 border-b pb-2"><dt className="text-muted-foreground">Basis</dt><dd className="text-right capitalize">{a.basis}</dd></div>}
                {a.relationship && <div className="flex justify-between gap-3 border-b pb-2"><dt className="text-muted-foreground">Relationship with manager</dt><dd className="text-right">{a.relationship}</dd></div>}
                {a.attestedAt && <div className="flex justify-between gap-3 border-b pb-2"><dt className="text-muted-foreground">Confirmed by investor</dt><dd>{fmtDate(a.attestedAt)}</dd></div>}
                {a.verifiedAt && <div className="flex justify-between gap-3 border-b pb-2"><dt className="text-muted-foreground">Verified</dt><dd>{fmtDate(a.verifiedAt)}</dd></div>}
                {a.expiresAt && <div className="flex justify-between gap-3 border-b pb-2"><dt className="text-muted-foreground">Expires</dt><dd>{fmtDate(a.expiresAt)}</dd></div>}
                {a.documents.map((doc: { id: string; name: string; kind: string; uploadedAt: string; reviewable?: boolean }) => <div key={doc.id} className="border-b pb-2"><p className="break-words font-medium">{doc.name}</p><p className="text-xs capitalize text-muted-foreground">{doc.kind} · {fmtDate(doc.uploadedAt)}</p>{"reviewable" in doc && <OnboardingProofReview documentId={doc.id} reviewable={!!doc.reviewable} onDone={() => q.refetch()} />}</div>)}
              </dl>; })() : <p className="text-muted-foreground">Accreditation has not been completed.</p>}
            </section>
          </>}
          <section>
            <h4 className="mb-1 font-medium">Documents</h4>
            {d.documents.length ? (
              <ul className="divide-y rounded-md border">{d.documents.map((x: any) => <li key={x.id} className="flex justify-between gap-2 p-2"><span className="break-all">{x.file_name}</span><span className="shrink-0 text-xs capitalize text-muted-foreground">{String(x.doc_kind).replace(/_/g, " ")}</span></li>)}</ul>
            ) : <p className="text-muted-foreground">No documents uploaded for this deal yet.</p>}
          </section>
            </TabsContent>
            <TabsContent value="terms" className="space-y-6">
          <section>
            <h4 className="mb-1 font-medium">Side letters</h4>
            {!embedded && (d.sideLetters.length ? d.sideLetters.map((s: any) => <p key={s.id}><Badge variant="secondary" className="mr-2 capitalize">{s.status}</Badge>{s.effective_date ? fmtDate(s.effective_date) : ""}</p>) : <p className="text-muted-foreground">None.</p>)}
            {embedded && <p className="text-muted-foreground">Full side-letter history is in the Side letter card above.</p>}
            <Button size="sm" variant="outline" className="mt-2" onClick={() => setTermAssociation("side_letter")}>Edit investor fees & minimum</Button>
          </section>
            </TabsContent>
            <TabsContent value="actions" className="space-y-6">
          {id && !embedded && <section className="rounded-lg border p-3" aria-label="Invite investor">
            <h4 className="mb-1 font-medium">Investor account</h4>
            <p className="mb-2 text-muted-foreground">Email the investor their personal invite so they can set up their account and start onboarding.</p>
            <InviteInvestorButton onboardingId={id} />
          </section>}
          <section className="rounded-lg border p-3" aria-label="Send documents">
            <h4 className="mb-1 font-medium">Send a document to this investor</h4>
            <p className="text-muted-foreground">Each button emails the investor a link to that one item. Sending never signs, approves or certifies anything.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {([
                ["subscription", "Subscription Agreement", d.docs === "Signed" || d.docs === "Signed (outside platform)"],
                ["tax_form", "W-9 / tax form", (d.reviewEvidence?.taxForms ?? []).length > 0],
                ["accreditation", "Accreditation proof", !!d.reviewEvidence?.accreditation?.verifiedAt],
                ["fund_documents", "Fund documents", false],
              ] as const).map(([kind, label, done]) => <Button key={kind} size="lg" variant="outline" className="justify-start text-base" disabled={sendingSign !== false || done} onClick={async () => {
                if (!id) return;
                setSendingSign(kind);
                try {
                  const r = await sendSign({ data: { fundId, onboardingId: id, kind } });
                  if (r.sent) toast.success(r.invited ? `Invite and ${label} sent to the investor` : `${label} sent to the investor`);
                  else toast.message(r.reason === "recipient_suppressed" ? "This investor has turned off emails, so it wasn't sent." : "Already sent today, or the email wasn't sent.");
                } catch (error) { toast.error(error instanceof Error ? error.message : "The email could not be sent."); }
                finally { setSendingSign(false); }
              }}>{done ? `${label}: done` : sendingSign === kind ? "Sending…" : `Send ${label}`}</Button>)}
            </div>
          </section>
          {id && !embedded && <PersonalInvestmentLinkCard onboardingId={id} />}
          {id && <InvestorEmailHistory onboardingId={id} />}
          {id && <InvestorQuickEdit onboardingId={id} onSaved={() => q.refetch()} />}
          {id && <InvestorPriorVerification onboardingId={id} onSaved={() => q.refetch()} />}
          {id && <InvestorHelpers onboardingId={id} />}
          {id && <InvestorPeopleAndContacts onboardingId={id} onSaved={() => q.refetch()} />}
            </TabsContent>
          </Tabs>
        </div>
      )}
      {id && termAssociation && <Dialog open onOpenChange={(o) => !o && setTermAssociation(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{termAssociation === "class" ? "Class association" : "Investor side-letter exceptions"}</DialogTitle><DialogDescription>Fund defaults remain unchanged. Reviewed exceptions are recorded separately.</DialogDescription></DialogHeader>
          {termAssociation === "class" ? <ClassAssignmentCard offeringId={fundId} onboardingId={id} /> : <SideLetterRegistry fundId={fundId} onboardingId={id} />}
        </DialogContent>
      </Dialog>}
    </div>
  );
}

function InvestorLevelsCard({ fundId }: { fundId: string }) {
  const load = useServerFn(investorLevelsFn);
  const q = useQuery({ queryKey: ["fund-investor-levels", fundId], queryFn: () => load({ data: { fundId } }), retry: false });
  if (!q.data) return null;
  const d = q.data;
  const tierName = (k: string | null) => INVESTOR_TIERS.find((t) => t.key === (k ?? "self_serve"))?.name ?? "Self Serve";
  const counts = LEVELS.map((l) => ({ ...l, n: d.investors.filter((i) => i.level === l.key).length }));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Investor levels
          <Badge variant="outline">{tierName(d.tierKey)} servicing{d.tierKey ? "" : " (none recorded)"}</Badge>
          {d.needsUpgrade ? <Badge variant="destructive">Needs upgrade{d.suggestedTier ? ` to ${tierName(d.suggestedTier)}` : ""}</Badge> : <Badge variant="secondary">Tier fits</Badge>}
        </CardTitle>
        <CardDescription>{d.investorCount} investor{d.investorCount === 1 ? "" : "s"}. Portal features depend on each investor's level and what this fund's servicing tier includes. Nothing is charged automatically.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {d.reasons.length ? <ul className="list-disc pl-5 text-destructive">{d.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {counts.map((c) => (
            <div key={c.key} className="rounded-md border p-2">
              <p className="font-semibold">{c.label} · {c.n}</p>
              <p className="text-xs text-muted-foreground">{c.rule}</p>
              <p className="mt-1 text-xs">{portalFeatures(c.key, d.tierKey ?? "self_serve").map((f) => FEATURE_LABELS[f]).join(", ") || "Documents, subscription and tax forms"}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
