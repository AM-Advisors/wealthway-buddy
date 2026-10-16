import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronLeft, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { guidedSetupFn, staffSaveSetupFn } from "@/lib/fund-setup-guided.functions";
import { submitFundInfoFn } from "@/lib/fund-manager-submissions.functions";
import { FUND_TYPES } from "@/lib/fund-setup-canonical";
import { BankBox, EditSheet, EinBox, SummaryBox } from "@/components/fund-setup-boxes";
import { fieldSectionComplete } from "@/lib/fund-setup-complete";
import { fundEinFn } from "@/lib/fund-tabs.functions";
import { SubmitForm, History } from "@/components/fund-manager-setup-loader";
import { FundSignatoriesCard } from "@/components/fund-signatories-card";
import { OfferingDocumentsSetup } from "@/components/offering-documents-setup";
import { FORM_SECTIONS, changedBySection, type FieldDef } from "@/lib/fund-setup-form-model";

type Mode = "staff" | "manager";

/**
 * One Fund Setup page for Harmonious staff and fund managers.
 * Mode only changes where Save goes: staff write to the fund record; managers submit for Harmonious review.
 * Every save is still authorized on the server.
 */
export function FundSetupForm({ offeringId, mode, staffExtras }: { offeringId: string; mode: Mode; staffExtras?: React.ReactNode }) {
  const qc = useQueryClient();
  const load = useServerFn(guidedSetupFn);
  const staffSave = useServerFn(staffSaveSetupFn);
  const submit = useServerFn(submitFundInfoFn);
  const q = useQuery({ queryKey: ["fund-setup-form", offeringId], queryFn: () => load({ data: { offeringId } }) });
  const d: any = q.data;
  const prior = useMemo<Record<string, string>>(() => ({ ...(d?.onFile?.fees_team ?? {}), ...(d?.onFile?.fund_details ?? {}) }), [d]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({ basic: true, details: true, jurisdiction: true });
  const [busy, setBusy] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const isStaff = mode === "staff" && !!d?.isStaff;

  if (q.isPending) return <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Loading setup…</div>;
  if (q.isError) return <div role="alert" className="rounded-xl border bg-card p-6 text-sm">{(q.error as Error).message}</div>;

  const v = (k: string) => vals[k] ?? prior[k] ?? "";
  const set = (k: string, x: string) => setVals((s) => ({ ...s, [k]: x }));
  const stepOf = (s: string) => (d.steps as any[]).find((x) => x.step === s);
  const waiting = (s: string) => !isStaff && stepOf(s)?.status === "waiting_harmonious";
  const returned = (s: string) => (d.items as any[]).find((i) => i.section === s && i.status !== "withdrawn")?.status === "returned" ? (d.items as any[]).find((i) => i.section === s && i.status !== "withdrawn") : null;
  const changes = changedBySection(vals, prior);
  const dirty = Object.keys(changes).length > 0;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["fund-setup-form", offeringId] }); qc.invalidateQueries({ queryKey: ["staff-fund-setup", offeringId] }); };

  // Saves all changes, or only one form section's fields when `keys` is given.
  const save = async (keys?: string[], label?: string) => {
    const picked = keys ? Object.fromEntries(Object.entries(vals).filter(([k]) => keys.includes(k))) : vals;
    const todo = changedBySection(picked, prior);
    if (!Object.keys(todo).length) { toast.message("Nothing changed"); return; }
    setBusy(true);
    const failed: string[] = [];
    let reviewed = false;
    for (const [section, payload] of Object.entries(todo)) {
      try {
        if (isStaff) await staffSave({ data: { offeringId, section: section as any, payload } });
        else { const r: any = await submit({ data: { offeringId, section: section as any, payload } }); if (!r?.applied) reviewed = true; }
      } catch (e: any) { failed.push(e?.message ?? "Could not save"); }
    }
    if (failed.length) toast.error(failed[0]!);
    else toast.success(`${label ? `${label}: ` : ""}${isStaff || !reviewed ? "Saved to the fund record" : "Sent to Harmonious for review"}`);
    if (!failed.length) setVals((cur) => keys ? Object.fromEntries(Object.entries(cur).filter(([k]) => !keys.includes(k))) : {});
    refresh();
    setBusy(false);
  };

  const statusFor = (fields: FieldDef[], section?: string) => {
    if (section && waiting(section)) return <Chip tone="wait">Waiting on review</Chip>;
    const req = fields.filter((f) => f.required && !v(f.key).trim()).length;
    return req ? <Chip tone="miss">Missing {req}</Chip> : <Chip tone="done">Done</Chip>;
  };

  const renderField = (f: FieldDef) => {
    const locked = !!f.section && waiting(f.section);
    const cls = "peer h-14 w-full rounded-xl border border-input bg-background px-4 pt-5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/30 disabled:opacity-60";
    const label = <span className="pointer-events-none absolute left-4 top-2 text-[11px] font-medium text-muted-foreground">{f.label}{f.required && " *"}</span>;
    if (f.options) return (
      <label className="relative block">
        <select className={`${cls} appearance-none pr-10`} value={v(f.key)} disabled={locked || f.disabled} onChange={(e) => set(f.key, e.target.value)}>
          <option value="">Select…</option>
          {(f.key === "fundType" ? FUND_TYPES.map((t) => [t, t] as const) : f.options).map(([val, l]) => <option key={val} value={val}>{l}</option>)}
        </select>
        {label}<ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </label>
    );
    return <label className="relative block"><input className={cls} type={f.type ?? "text"} value={f.disabled ? f.fixed ?? "" : v(f.key)} disabled={locked || f.disabled} onChange={(e) => set(f.key, e.target.value)} />{label}</label>;
  };

  const fieldSection = (id: string) => {
    const s = FORM_SECTIONS.find((x) => x.id === id)!;
    const ret = returned("fund_details");
    const keys = s.fields.map((f) => f.key);
    const changed = keys.some((k) => k in vals && (vals[k] ?? "") !== (prior[k] ?? ""));
    const required = s.fields.filter((f) => f.required && !f.disabled).map((f) => f.key);
    const filled = s.fields.filter((f) => !f.disabled && String(prior[f.key] ?? "").trim()).length;
    const editable = s.fields.filter((f) => !f.disabled).length;
    const display = (f: FieldDef) => f.disabled ? f.fixed ?? "" : (f.options ? ((f.key === "fundType" ? FUND_TYPES.map((t) => [t, t] as const) : f.options).find(([val]) => val === prior[f.key])?.[1] ?? prior[f.key]) : prior[f.key]) ?? "";
    const saveBar = (after?: () => void) => (
      <div className="flex justify-end gap-2 pt-1">
        {changed && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setVals((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => !keys.includes(k))))}>Cancel</Button>}
        <Button size="sm" disabled={!changed || busy} onClick={async () => { await save(keys, s.title); after?.(); }}>{isStaff ? "Save" : "Submit"}</Button>
      </div>
    );
    const fields = <div className="space-y-3">{s.fields.map((f) => <div key={f.key}>{renderField(f)}</div>)}</div>;
    if (!ret && !waiting(s.fields[0]?.section ?? "") && fieldSectionComplete(required, prior, changed && editingSection !== id)) {
      return (
        <div key={id}>
          <SummaryBox title={s.title} rows={s.fields.map((f) => [f.label, display(f)] as [string, React.ReactNode])} onEdit={() => setEditingSection(id)} />
          <EditSheet open={editingSection === id} onOpenChange={(o) => { if (!o) { setVals((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => !keys.includes(k)))); setEditingSection(null); } }} title={s.title}>
            {!isStaff && <p className="text-sm text-muted-foreground">Changes go to Harmonious for review. The approved values stay in place until then.</p>}
            {fields}{saveBar(() => setEditingSection(null))}
          </EditSheet>
        </div>
      );
    }
    return (
      <SetupSection open={open} setOpen={setOpen} id={s.id} title={s.title} status={<span className="flex items-center gap-2"><span className="hidden text-xs text-muted-foreground sm:inline">{filled} of {editable} filled in</span>{statusFor(s.fields, s.fields[0]?.section)}</span>}>
        {id === "basic" && ret && <p className="rounded-lg bg-muted p-3 text-sm">Harmonious returned this: {ret.review_note ?? "please review and resubmit."}</p>}
        {fields}{saveBar()}
      </SetupSection>
    );
  };

  const allDone = d.launchPercent >= 100;

  return (
    <div className="space-y-4 bg-background">
      <div className="flex items-center gap-3 rounded-2xl border bg-card px-3 py-3">
        <Button variant="outline" size="icon" aria-label="Back" onClick={() => window.history.back()}><ChevronLeft className="h-4 w-4" /></Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-lg font-semibold">{allDone ? d.fundName : `Fund setup — ${d.fundName}`}</h2>
          {!allDone && <p className="text-xs text-muted-foreground">Launch readiness {d.launchPercent}% · {isStaff ? "Saves go straight to the fund record" : "Changes are reviewed by Harmonious"}</p>}
        </div>
      </div>

      {fieldSection("basic")}
      {fieldSection("details")}
      {fieldSection("jurisdiction")}
      <EinBox offeringId={offeringId} onChanged={refresh} />
      {fieldSection("offering")}
      {fieldSection("fees")}

      <SetupSection open={open} setOpen={setOpen} id="team" title="Team & Signatory" status={<Chip tone={stepOf("team")?.status === "done" ? "done" : "miss"}>{stepOf("team")?.statusLabel ?? ""}</Chip>}>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li className="rounded-xl border bg-background px-4 py-3"><span className="block text-xs text-muted-foreground">Fund manager</span>{d.managerName ?? "Not assigned"}</li>
          <li className="rounded-xl border bg-background px-4 py-3"><span className="block text-xs text-muted-foreground">Administrator</span>{d.administrator}</li>
          {(d.team as any[]).map((m, i) => <li key={i} className="rounded-xl border bg-background px-4 py-3"><span className="block text-xs capitalize text-muted-foreground">{String(m.role).replace(/_/g, " ")}</span>{m.name ?? "Not assigned"}</li>)}
        </ul>
        {isStaff ? <FundSignatoriesCard offeringId={offeringId} onChanged={refresh} /> : <p className="text-sm text-muted-foreground">Harmonious adds signers so each person completes an identity check. Signer on file: {prior["signers"] || "none yet"}.</p>}
      </SetupSection>

      <BankBox offeringId={offeringId} isStaff={isStaff} onChanged={refresh} />
      {!!(d.items as any[]).some((i) => i.section === "bank") && <History items={(d.items as any[]).filter((i) => i.section === "bank")} isStaff={isStaff} onChange={refresh} />}

      <SetupSection open={open} setOpen={setOpen} id="documents" title="Documents" status={<Chip tone={stepOf("document")?.status === "done" ? "done" : "miss"}>{stepOf("document")?.statusLabel ?? ""}</Chip>}>
        {isStaff ? <OfferingDocumentsSetup offeringId={offeringId} onChanged={refresh} /> : <SubmitForm offeringId={offeringId} section="document" onDone={refresh} />}
        <History items={(d.items as any[]).filter((i) => i.section === "document" || i.section === "fund_details" || i.section === "fees_team")} isStaff={isStaff} onChange={refresh} />
      </SetupSection>

      {!allDone && <SetupSection open={open} setOpen={setOpen} id="launch" title="Review & Launch" status={<Chip tone={d.launchPercent >= 100 ? "done" : "miss"}>{d.launchPercent}%</Chip>}>
        <ul className="space-y-1 text-sm">
          {(d.steps as any[]).filter((s) => s.step !== "launch").map((s) => <li key={s.step} className="flex justify-between gap-3 border-b py-2 last:border-0"><span className="capitalize">{String(s.step).replace(/_/g, " ")}</span><span className="text-muted-foreground">{s.statusLabel}</span></li>)}
        </ul>
        <p className="text-sm text-muted-foreground">Harmonious launches the fund once every required item is in place.</p>
      </SetupSection>}

      {isStaff && staffExtras && (
        <SetupSection open={open} setOpen={setOpen} id="staff" title="Harmonious only" status={<Chip tone="wait">Staff</Chip>}>{staffExtras}</SetupSection>
      )}
    </div>
  );
}

function Chip({ tone, children }: { tone: "done" | "miss" | "wait"; children: React.ReactNode }) {
  const c = tone === "done" ? "bg-accent/15 text-foreground" : tone === "wait" ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
}

function SetupSection({ id, title, status, action, children, open, setOpen }: { id: string; title: string; status?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; open: Record<string, boolean>; setOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>> }) {
  const isOpen = !!open[id];
  return (
    <section id={`setup-form-${id}`} className="scroll-mt-24 rounded-2xl border bg-card">
      <div className="flex items-center gap-3 pr-5">
        <button type="button" className="flex flex-1 items-center gap-3 py-4 pl-5 text-left" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [id]: !isOpen }))}>
          <span className="flex h-7 w-7 items-center justify-center rounded-md border">{isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
          <h3 className="flex-1 font-heading text-base font-semibold text-primary">{title}</h3>
          {status}
        </button>
        {action}
      </div>
      {isOpen && <div className="space-y-3 px-5 pb-5">{children}</div>}
    </section>
  );
}

function EinStatus({ fundId }: { fundId: string }) {
  const load = useServerFn(fundEinFn);
  const q = useQuery({ queryKey: ["fund-ein", fundId, false], queryFn: () => load({ data: { fundId, reveal: false } }) });
  const st = q.data?.status;
  return st === "recorded" ? <Chip tone="done">Done</Chip> : st === "in_review" ? <Chip tone="wait">Waiting on review</Chip> : <Chip tone="miss">Needed</Chip>;
}
