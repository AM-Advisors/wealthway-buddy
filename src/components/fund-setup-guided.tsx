import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, Check, ChevronDown, FolderSearch, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { FIELDS, History, OnFile, SubmitForm } from "@/components/fund-manager-setup-loader";
import { decideProposalsFn, fillFromDriveFn, guidedSetupFn, proposeDefaultsFn, remindSetupFn, staffSaveSetupFn } from "@/lib/fund-setup-guided.functions";
import { SETUP_STEP_LABEL, type SetupStep, type StepStatus } from "@/lib/fund-setup-waiting";

const FIELD_LABEL: Record<string, string> = {
  legalName: "Legal fund name", displayName: "Display name", entityType: "Entity type", jurisdiction: "Formation state", formationDate: "Formation date",
  principalAddress: "Principal address", addressLine1: "Address line 1", addressLine2: "Address line 2", addressCity: "City", addressState: "State (address)", addressZip: "ZIP code",
  targetRaise: "Target raise ($)", minInvestment: "Minimum investment ($)", gpName: "GP / manager entity",
  regType: "Offering exemption", managementFeePercent: "Management fee (%)", carryPercent: "Carried interest (%)", preferredReturnPercent: "Preferred return (%)",
  firstSaleDate: "Date of first sale", relatedPersons: "Related persons", solicitationStates: "States of solicitation", administrator: "Fund administrator",
};
const TONE: Record<StepStatus, string> = { done: "border-primary bg-primary text-primary-foreground", waiting_harmonious: "border-primary text-primary", waiting_manager: "text-muted-foreground", needs_changes: "border-destructive text-destructive" };

/** One guided setup page for Harmonious staff and fund managers (same steps, role-appropriate actions). */
export function FundSetupGuided({ offeringId, compact = false, onJump }: { offeringId: string; compact?: boolean; /** Overview mode: steps become a progress strip that jumps to the section where the work is done. */ onJump?: (step: SetupStep) => void }) {
  const qc = useQueryClient();
  const load = useServerFn(guidedSetupFn);
  const q = useQuery({ queryKey: ["guided-setup", offeringId], queryFn: () => load({ data: { offeringId } }), staleTime: 30_000 });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["guided-setup", offeringId] }); qc.invalidateQueries({ queryKey: ["fund-submissions", offeringId] }); };
  const [expanded, setExpanded] = useState<SetupStep | null | undefined>(undefined);
  if (q.isPending) return <Card><CardContent className="p-4 text-sm text-muted-foreground">Loading fund setup…</CardContent></Card>;
  if (q.isError || !q.data) return <Card><CardContent className="p-4 text-sm text-muted-foreground">Fund setup isn't available for your account.</CardContent></Card>;
  const d = q.data as any;
  const steps = d.steps as { step: SetupStep; status: StepStatus; statusLabel: string; owner: string | null; missing: string[]; remindedToday: boolean }[];
  const done = steps.filter((s) => s.status === "done").length;
  if (compact && done === steps.length) return <p className="rounded-lg border bg-card px-4 py-3 text-sm"><Check className="mr-2 inline h-4 w-4 text-primary" />Fund setup complete.</p>;
  const firstOpen = steps.find((s) => s.status !== "done")?.step ?? null;
  const current = expanded === undefined ? firstOpen : expanded;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{compact ? "Finish your fund setup" : "Fund setup"}</CardTitle>
            <CardDescription>
              {d.waitingOnYou ? <span className="font-medium text-foreground">{d.waitingOnYou} {d.waitingOnYou === 1 ? "item is" : "items are"} waiting on you. </span> : null}
              {d.isStaff ? "Save directly, or review what the fund manager sent." : "Each item is reviewed by Harmonious before it counts."}
            </CardDescription>
          </div>
          {d.isStaff && <StaffTools offeringId={offeringId} hasDrive={d.hasDriveFolder} hasDefaults={Object.keys(d.defaults ?? {}).length > 0} onDone={refresh} />}
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground"><span>{done} of {steps.length} steps done</span><span>Launch readiness {d.launchPercent}%</span></div>
          <Progress value={(done / steps.length) * 100} />
        </div>
        {d.isStaff && d.proposals.length > 0 && <Proposals offeringId={offeringId} list={d.proposals} onDone={refresh} />}
      </CardHeader>
      {onJump ? (
        <CardContent>
          <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {steps.map((s, idx) => (
              <li key={s.step}>
                <button type="button" onClick={() => onJump(s.step)} className={cn("flex h-full w-full items-start gap-2 rounded-lg border p-2.5 text-left transition-colors hover:border-primary", s.step === firstOpen && "border-primary/60 bg-accent/20")}>
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", TONE[s.status])}>{s.status === "done" ? <Check className="h-3.5 w-3.5" /> : idx + 1}</span>
                  <span className="min-w-0"><span className="block text-sm font-medium">{SETUP_STEP_LABEL[s.step]}</span><span className="block text-xs text-muted-foreground">{s.statusLabel}</span>{s.missing?.length ? <span className="block text-xs text-destructive">{s.missing.length} missing</span> : null}</span>
                </button>
              </li>
            ))}
          </ol>
        </CardContent>
      ) : <CardContent>
        <ol className="space-y-2">
          {steps.map((s, idx) => {
            const isOpen = current === s.step;
            return (
              <li key={s.step} className={cn("rounded-lg border transition-colors", isOpen && "border-primary/60 bg-accent/20")}>
                <button type="button" className="flex w-full items-center gap-3 p-3 text-left" onClick={() => setExpanded(isOpen ? null : s.step)} aria-expanded={isOpen}>
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", TONE[s.status])}>{s.status === "done" ? <Check className="h-4 w-4" /> : idx + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{SETUP_STEP_LABEL[s.step]}</span>
                    <span className="block truncate text-xs text-muted-foreground">{s.statusLabel}{s.owner ? ` · ${s.owner}` : ""}</span>
                  </span>
                  <Badge variant={s.status === "done" ? "default" : s.status === "needs_changes" ? "destructive" : "outline"}>{s.statusLabel}</Badge>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && <StepBody offeringId={offeringId} d={d} s={s} onChange={refresh} />}
              </li>
            );
          })}
        </ol>
      </CardContent>}
    </Card>
  );
}

function StepBody({ offeringId, d, s, onChange }: { offeringId: string; d: any; s: any; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const isStaff = !!d.isStaff;
  const remindable = s.status !== "done" && ((isStaff && (s.status === "waiting_manager" || s.status === "needs_changes")) || (!isStaff && s.status === "waiting_harmonious"));
  const sectionItems = (d.items as any[]).filter((i) => i.section === s.step);
  const values = s.step === "fund_details" || s.step === "fees_team" ? { ...(d.onFile?.[s.step] ?? {}) } : {};
  const ret = sectionItems.find((i) => i.status === "returned");
  return (
    <div className="space-y-3 border-t px-3 pb-3 pt-3">
      {ret?.review_note && s.status === "needs_changes" && <p className="text-sm text-destructive">Harmonious asked: {ret.review_note}</p>}
      {s.step === "team" ? (
        <div className="space-y-2 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">Fund administrator</dt><dd className="font-medium">{d.administrator}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Fund manager</dt><dd>{d.managerName}</dd></div>
            {(d.team as any[]).map((m) => <div key={m.role}><dt className="text-xs text-muted-foreground">{({ sales: "Sales", account_manager: "Account Manager", operations: "Operations" } as any)[m.role]}</dt><dd>{m.name ?? <span className="text-muted-foreground">Not assigned</span>}</dd></div>)}
          </dl>
          <StepLink isStaff={isStaff} offeringId={offeringId} to="team" label={isStaff ? "Assign team" : "Open team"} />
        </div>
      ) : s.step === "launch" ? (
        <div className="space-y-2 text-sm">
          <p>Launch readiness is <span className="font-medium">{d.launchPercent}%</span>. Harmonious launches the fund once every required item is in place.</p>
          <StepLink isStaff={isStaff} offeringId={offeringId} to="launch" label={isStaff ? "Open launch checklist" : "See what's left"} />
        </div>
      ) : (
        <>
          <OnFile section={s.step} values={values} docs={d.onFile?.documents ?? []} />
          {s.missing.length > 0 && <p className="text-xs text-muted-foreground">Missing: {s.missing.map((m: string) => FIELD_LABEL[m] ?? (m === "signers" ? "Signers" : m)).join(", ")}</p>}
          {isStaff && (s.step === "fund_details" || s.step === "fees_team") ? (
            editing ? <StaffForm offeringId={offeringId} section={s.step} prior={values} onDone={() => { setEditing(false); onChange(); }} /> : <Button size="sm" onClick={() => setEditing(true)}>{s.missing.length ? "Complete this step" : "Edit"}</Button>
          ) : isStaff ? (
            <StepLink isStaff offeringId={offeringId} to={s.step === "bank" ? "banking" : "documents"} label={s.step === "bank" ? "Enter bank details" : "Manage documents"} />
          ) : editing ? (
            <SubmitForm offeringId={offeringId} section={s.step} prior={values} onDone={() => { setEditing(false); onChange(); }} />
          ) : (
            s.status !== "waiting_harmonious" && <Button size="sm" variant={s.status === "done" ? "outline" : "default"} onClick={() => setEditing(true)}>{s.status === "done" ? "Suggest a change" : "Complete this step"}</Button>
          )}
          <History items={sectionItems} isStaff={isStaff} onChange={onChange} />
        </>
      )}
      {remindable && <RemindButton offeringId={offeringId} step={s.step} done={s.remindedToday} isStaff={isStaff} onDone={onChange} />}
    </div>
  );
}

function StepLink({ isStaff, offeringId, to, label }: { isStaff: boolean; offeringId: string; to: "team" | "banking" | "documents" | "launch"; label: string }) {
  if (isStaff) {
    if (to === "launch") return <Button asChild size="sm" variant="outline"><Link to="/ops/fund-setup/$fundId" params={{ fundId: offeringId }}>{label}</Link></Button>;
    return <Button asChild size="sm" variant="outline"><Link to="/ops/fund/$fundId" params={{ fundId: offeringId }} search={{ tab: to } as never}>{label}</Link></Button>;
  }
  if (to === "team") return <Button asChild size="sm" variant="outline"><Link to="/manager/fund/$fundId/team" params={{ fundId: offeringId }}>{label}</Link></Button>;
  if (to === "launch") return <Button asChild size="sm" variant="outline"><Link to="/manager/fund/$fundId/readiness" params={{ fundId: offeringId }}>{label}</Link></Button>;
  return null;
}

function RemindButton({ offeringId, step, done, isStaff, onDone }: { offeringId: string; step: SetupStep; done: boolean; isStaff: boolean; onDone: () => void }) {
  const remind = useServerFn(remindSetupFn);
  const [busy, setBusy] = useState(false);
  return (
    <Button size="sm" variant="ghost" disabled={done || busy} onClick={async () => {
      setBusy(true);
      try { await remind({ data: { offeringId, step } }); toast.success(isStaff ? "Reminder emailed to the fund manager" : "Harmonious has been nudged"); }
      catch (e: any) { toast.error(e?.message ?? "Could not send reminder"); }
      finally { setBusy(false); onDone(); }
    }}>
      <Bell className="mr-1 h-4 w-4" />{done ? "Reminded today" : isStaff ? "Remind fund manager" : "Nudge Harmonious"}
    </Button>
  );
}

function StaffForm({ offeringId, section, prior, onDone }: { offeringId: string; section: "fund_details" | "fees_team"; prior: Record<string, string>; onDone: () => void }) {
  const save = useServerFn(staffSaveSetupFn);
  const [vals, setVals] = useState<Record<string, string>>(() => ({ ...prior }));
  const [busy, setBusy] = useState(false);
  const fields = FIELDS[section].filter(([k]) => k !== "signers");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map(([k, l, t]) => (
        <div key={k}><Label>{l}</Label><Input className="mt-1" type={t === "textarea" ? "text" : t ?? "text"} value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} /></div>
      ))}
      {section === "fees_team" && <p className="text-xs text-muted-foreground sm:col-span-2">Signers are added on the Team step so each person gets an identity check.</p>}
      <div className="sm:col-span-2"><Button disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          const payload: Record<string, string> = {};
          for (const [k] of fields) if ((vals[k] ?? "").trim() && (vals[k] ?? "").trim() !== (prior[k] ?? "")) payload[k] = vals[k]!.trim();
          if (!Object.keys(payload).length) { onDone(); return; }
          await save({ data: { offeringId, section, payload } }); toast.success("Saved to the fund record"); onDone();
        } catch (e: any) { toast.error(e?.message ?? "Could not save"); } finally { setBusy(false); }
      }}>{busy ? "Saving…" : "Save"}</Button></div>
    </div>
  );
}

function StaffTools({ offeringId, hasDrive, hasDefaults, onDone }: { offeringId: string; hasDrive: boolean; hasDefaults: boolean; onDone: () => void }) {
  const fill = useServerFn(fillFromDriveFn);
  const defaults = useServerFn(proposeDefaultsFn);
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      {hasDrive && <Button size="sm" variant="outline" disabled={!!busy} onClick={async () => {
        setBusy("drive");
        try { const r = await fill({ data: { offeringId } }); toast.success(r.created ? `Found ${r.created} values in ${r.files.length} Drive files. Review them below.` : r.files.length ? "Read the Drive files but found nothing new." : "No setup documents found in the Drive folder."); onDone(); }
        catch (e: any) { toast.error(e?.message ?? "Could not read Drive"); } finally { setBusy(null); }
      }}><FolderSearch className="mr-1 h-4 w-4" />{busy === "drive" ? "Reading Drive…" : "Fill from Google Drive"}</Button>}
      {hasDefaults && <Button size="sm" variant="outline" disabled={!!busy} onClick={async () => {
        setBusy("def");
        try { const r = await defaults({ data: { offeringId } }); toast.success(r.created ? "Standard choices added. Confirm them below." : "Defaults are already waiting below."); onDone(); }
        catch (e: any) { toast.error(e?.message ?? "Could not add defaults"); } finally { setBusy(null); }
      }}><Sparkles className="mr-1 h-4 w-4" />Apply defaults</Button>}
    </div>
  );
}

function Proposals({ offeringId, list, onDone }: { offeringId: string; list: any[]; onDone: () => void }) {
  const decide = useServerFn(decideProposalsFn);
  const [busy, setBusy] = useState(false);
  const act = async (ids: string[], decision: "accepted" | "skipped") => {
    setBusy(true);
    try { await decide({ data: { offeringId, ids, decision } }); toast.success(decision === "accepted" ? "Saved to the fund record" : "Skipped"); onDone(); }
    catch (e: any) { toast.error(e?.message ?? "Could not save"); } finally { setBusy(false); }
  };
  const defaults = list.filter((p) => p.kind === "default");
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Proposed values to confirm ({list.length})</p>
        {defaults.length > 0 && <Button size="sm" disabled={busy} onClick={() => act(defaults.map((p) => p.id), "accepted")}>Confirm defaults</Button>}
      </div>
      <ul className="divide-y text-sm">
        {list.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p><span className="text-muted-foreground">{FIELD_LABEL[p.field] ?? p.field}: </span><span className="font-medium">{p.value}</span></p>
              <p className="truncate text-xs text-muted-foreground">{p.kind === "default" ? "Default — confirm" : `From ${p.source}`}{p.section === "info" ? " · for reference" : ""}</p>
            </div>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act([p.id], "accepted")}>Accept</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act([p.id], "skipped")}>Skip</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
