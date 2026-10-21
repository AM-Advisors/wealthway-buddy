import { currentStep, STEP_STATE_LABELS, type StepState, type StepStatus } from "@/lib/investor-step-status";
import { useState, type ReactNode } from "react";
import { remindInvestorItemFn } from "@/lib/document-reminders.functions";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FundOnboardingLinkCard } from "@/components/fund-onboarding-link";
import { approveToFundFn, fundReadinessFn } from "@/lib/investor-onboarding.functions";
import { STAGE_LABELS, type OnboardingStage } from "@/lib/investor-onboarding-model";
import { investorDetailFn, investorGridFn, lastRemindersFn, sendInvestorRemindersFn } from "@/lib/fund-tabs.functions";
import { bulkSendKycLinksFn, bulkSetClassFn, listInvestorDuplicatesFn, mergeInvestorsFn, requestMissingInfoFn } from "@/lib/investor-bulk.functions";
import { reminderAllowed, reminderStep } from "@/lib/fund-health";
import { toast } from "sonner";
import { investorLevelsFn } from "@/lib/fund-tabs.functions";
import { FEATURE_LABELS, LEVELS, portalFeatures } from "@/lib/investor-levels";
import { INVESTOR_TIERS } from "@/lib/product-pricing";
import { fmtDate, usd } from "./shared";
import { PersonalInvestmentLinkCard, PersonalLinkCopyButton } from "@/components/personal-investment-link";
import { InvestorEmailHistory, InvestorHelpers, InvestorQuickEdit } from "@/components/investor-panel-extras";

export function InvestorsTab({ fundId, workQueue }: { fundId: string; workQueue?: ReactNode }) {
  const load = useServerFn(investorGridFn);
  const q = useQuery({ queryKey: ["fund-investor-grid", fundId], queryFn: () => load({ data: { fundId } }) });
  const loadReady = useServerFn(fundReadinessFn);
  const rq = useQuery({ queryKey: ["fund-readiness", fundId], queryFn: () => loadReady({ data: { offeringId: fundId } }), retry: false });
  const ready = new Map(((rq.data?.rows ?? []) as any[]).map((x) => [x.onboardingId, x]));
  const [open, setOpen] = useState<string | null>(null);
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
          <CardDescription>Click an investor to see everything for this deal. Received counts only money matched to the bank.</CardDescription>
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
                  <tr key={r.id} className="cursor-pointer border-t hover:bg-muted" onClick={() => setOpen(r.id)}>
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
      <InvestorSheet fundId={fundId} id={open} onClose={() => setOpen(null)} />
      <Dialog open={invite} onOpenChange={setInvite}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add or invite investors</DialogTitle>
            <DialogDescription>Share this secure link. Each investor creates their own account and completes About You, Verification, Sign and Fund.</DialogDescription>
          </DialogHeader>
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
        <CardDescription>Same name or email appears more than once. Merging keeps one record, carries over its documents and tasks, and archives the other — nothing is deleted. Staff only.</CardDescription>
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
        <span key={st.key} title={`${st.label}: ${STEP_STATE_LABELS[st.state]} — ${st.detail}`} className={`flex size-6 items-center justify-center rounded-full text-[10px] font-medium ${STATE_DOT[st.state]}`}>{i + 1}</span>
      ))}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3 py-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="text-right break-words">{v || "-"}</dd></div>;
}

export function InvestorSheet({ fundId, id, onClose }: { fundId: string; id: string | null; onClose: () => void }) {
  const load = useServerFn(investorDetailFn);
  const approve = useServerFn(approveToFundFn);
  const [approving, setApproving] = useState(false);
  const q = useQuery({ queryKey: ["fund-investor", fundId, id], queryFn: () => {
    if (!id) throw new Error("Select an investor to review.");
    return load({ data: { fundId, onboardingId: id } });
  }, enabled: !!id });
  const d = q.data;
  const pct = d && d.committedCents ? Math.min(100, Math.round(((d.receivedCents ?? 0) / d.committedCents) * 100)) : 0;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
        <div className="border-b bg-muted/40 p-6">
          <SheetHeader className="space-y-1 text-left">
            <SheetTitle className="text-xl">{d?.name ?? "Investor"}</SheetTitle>
            <SheetDescription>{d?.profileName ?? "Details for this fund only."}</SheetDescription>
          </SheetHeader>
          {d && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge variant={d.kycOk ? "secondary" : "outline"}>KYC/AML: {d.kycLabel}</Badge>
              <Badge variant={d.docs === "Signed" ? "secondary" : "outline"}>Docs: {d.docs}</Badge>
              <Badge variant={d.wiring === "Funded" ? "secondary" : "outline"}>Wiring: {d.wiring}</Badge>
              {d.investorUserId && (
                <Button asChild size="sm" className="ml-auto"><Link to="/manager/messages" search={{ open: d.applicationId ?? undefined }}>Message</Link></Button>
              )}
            </div>
          )}
        </div>
        {q.isLoading ? <p className="p-6 text-sm text-muted-foreground">Loading…</p> : q.error ? <div role="alert" className="space-y-2 p-6"><p className="text-sm text-destructive">Investor details couldn’t load.</p><Button variant="outline" onClick={() => void q.refetch()}>Retry</Button></div> : d && (
          <div className="space-y-6 p-6 text-sm">
            {id && <PersonalInvestmentLinkCard onboardingId={id} />}
            {id && <InvestorEmailHistory onboardingId={id} />}
            {id && <InvestorQuickEdit onboardingId={id} onSaved={() => q.refetch()} />}
            {id && <InvestorHelpers onboardingId={id} />}
            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Committed</p><p className="text-lg font-semibold">{usd(d.committedCents)}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Received</p><p className="text-lg font-semibold">{usd(d.receivedCents)}</p>
                <div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div></div>
            </section>

            <section>
              <h4 className="mb-2 font-medium">Progress</h4>
              <ol className="space-y-2">
                {(d.steps as StepStatus[]).map((st, i) => (
                  <li key={st.key} className="flex items-center gap-3 rounded-md border p-2">
                    <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${STATE_DOT[st.state]}`}>{i + 1}</span>
                    <span className="flex-1"><span className="font-medium">{st.label}</span><span className="block text-xs text-muted-foreground">{st.detail}</span></span>
                    <Badge variant={st.state === "complete" ? "secondary" : st.state === "blocked" ? "destructive" : "outline"}>{STEP_STATE_LABELS[st.state]}</Badge>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-muted-foreground">See the History tab for who completed each step and when.</p>
            </section>

            {d.openItems.length > 0 && (
              <section className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                <h4 className="mb-1 font-medium">Open items</h4>
                <ul className="list-disc space-y-0.5 pl-5">{d.openItems.map((t: string) => <li key={t}>{t}</li>)}</ul>
                {d.canApproveSubscription && <Button className="mt-3" disabled={approving} onClick={async () => {
                  if (!id) return;
                  setApproving(true);
                  try { await approve({ data: { onboardingId: id } }); toast.success("Subscription approved"); await q.refetch(); }
                  catch (error) { toast.error(error instanceof Error ? error.message : "Subscription could not be approved."); }
                  finally { setApproving(false); }
                }}>{approving ? "Approving…" : "Approve subscription"}</Button>}
              </section>
            )}

            {d.missing.length > 0 && (
              <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <h4 className="mb-1 font-medium">Missing info for the fund manager to obtain</h4>
                <ul className="list-disc space-y-0.5 pl-5">{d.missing.map((t: string) => <li key={t}>{t}</li>)}</ul>
              </section>
            )}

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
                {d.classApplicable && <Row k="Class" v={d.classLabel} />}<Row k="Investing as" v={d.assetLabel} /><Row k="Tax ID" v={d.taxIdLast4 ? `•••• ${d.taxIdLast4}` : null} />
                <Row k="Investment date" v={d.investmentDate ? fmtDate(d.investmentDate) : null} />
                <Row k="Stage" v={STAGE_LABELS[d.stage as OnboardingStage] ?? d.stage.replace(/_/g, " ")} />
                <Row k="Latest activity" v={fmtDate(d.lastActivity)} />
              </dl>
            </section>

            <section>
              <h4 className="mb-1 font-medium">Documents</h4>
              {d.documents.length ? (
                <ul className="divide-y rounded-md border">{d.documents.map((x: any) => <li key={x.id} className="flex justify-between gap-2 p-2"><span className="break-all">{x.file_name}</span><span className="shrink-0 text-xs capitalize text-muted-foreground">{String(x.doc_kind).replace(/_/g, " ")}</span></li>)}</ul>
              ) : <p className="text-muted-foreground">No documents uploaded for this deal yet.</p>}
            </section>

            <section>
              <h4 className="mb-1 font-medium">Side letters</h4>
              {d.sideLetters.length ? d.sideLetters.map((s: any) => <p key={s.id}><Badge variant="secondary" className="mr-2 capitalize">{s.status}</Badge>{s.effective_date ? fmtDate(s.effective_date) : ""}</p>) : <p className="text-muted-foreground">None.</p>}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
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
