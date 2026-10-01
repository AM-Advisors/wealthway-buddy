import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getFormationRecordFn, recordFormationAuthorizationFn, addFormationDocumentFn, setFormationProviderFn,
  recordFormationCostFn, openFormationDiscrepancyFn, resolveFormationDiscrepancyFn,
} from "@/lib/fund-formation.functions";
import { FORMATION_DOC_TYPES } from "@/lib/fund-formation";
import { STATUS_LABELS } from "@/lib/fund-services";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
const fmtDate = (s?: string | null) => (s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString() : "—");
const usd = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });

/** One place for the whole formation record. Staff edit; fund managers see a masked read view. */
export function FormationRecordCard({ offeringId }: { offeringId: string }) {
  const load = useServerFn(getFormationRecordFn);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["formation-record", offeringId], queryFn: () => load({ data: { offeringId } }) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["formation-record", offeringId] }); qc.invalidateQueries({ queryKey: ["fund-services", offeringId] }); };
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading formation record…</p>;
  if (q.error || !q.data) return <p className="text-sm text-destructive">The formation record couldn't be loaded.</p>;
  const d = q.data;
  const s = d.summary;
  return (
    <Card id="setup-formation-record" className="scroll-mt-32">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Formation record</CardTitle>
          <Badge variant="secondary">{STATUS_LABELS[d.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Everything about forming this Fund's entity in one place. Harmonious completes the formation; nothing is filed from here.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {s["actionRequired"] === "yes" && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm">Action needed: {s["actionRequiredReason"] || "Harmonious will be in touch."}</p>
        )}
        {d.hasPendingConfirmation && <p className="text-sm text-muted-foreground">Harmonious is confirming a detail with the provider.</p>}
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <Item k="Legal name" v={d.legalName ?? "Not set yet"} />
          <Item k="State" v={s["state"]} /><Item k="Entity type" v={s["entityType"]} />
          <Item k="Processing" v={s["processingOption"]} /><Item k="Provider" v={d.providerName} /><Item k="Package" v={d.bundleName} />
          <Item k="Submitted" v={fmtDate(s["submittedOn"])} /><Item k="Approved by the state" v={fmtDate(s["completedOn"])} /><Item k="Formation date" v={fmtDate(s["formationDate"])} />
        </dl>
        {d.canEdit && d.staff && <OrderExtras offeringId={offeringId} d={d} onChanged={refresh} />}

        <Section title="Client authorization">
          {d.authorizations.length === 0 ? <p className="text-sm text-muted-foreground">Not recorded yet. Needed before formation can be marked submitted.</p> : (
            <ul className="space-y-1 text-sm">{d.authorizations.map((a: any) => (
              <li key={a.id}><span className="font-medium">{a.personName}</span> authorized on {fmtDate(a.authorizedOn)}{d.canEdit && a.text ? <span className="block text-xs text-muted-foreground">“{a.text}”{a.registeredAgentChoice ? ` · Registered agent: ${a.registeredAgentChoice}` : ""}</span> : null}</li>
            ))}</ul>
          )}
          {d.canEdit && d.staff && <AuthorizationForm offeringId={offeringId} people={d.staff.people} onChanged={refresh} />}
        </Section>

        <Section title="Formation documents">
          {d.documents.length === 0 ? <p className="text-sm text-muted-foreground">No formation documents yet.</p> : (
            <ul className="divide-y text-sm">{d.documents.map((doc: any) => (
              <li key={doc.id} className="flex justify-between gap-2 py-1.5"><span>{doc.typeLabel}{doc.title !== doc.typeLabel ? ` — ${doc.title}` : ""} <span className="text-xs text-muted-foreground">v{doc.version}{!doc.current ? " (earlier version)" : ""}</span></span><span className="text-xs text-muted-foreground">{fmtDate(doc.at)}</span></li>
            ))}</ul>
          )}
          {d.canEdit && <DocumentUpload offeringId={offeringId} onChanged={refresh} />}
        </Section>

        {d.canEdit && d.staff && <>
          <Section title="Costs (Harmonious only)"><Costs offeringId={offeringId} d={d} onChanged={refresh} /></Section>
          <Section title="Provider discrepancies (Harmonious only)"><Discrepancies offeringId={offeringId} d={d} onChanged={refresh} /></Section>
        </>}

        <Section title="Timeline">
          {d.timeline.length === 0 ? <p className="text-sm text-muted-foreground">No activity yet.</p> : (
            <ol className="space-y-1 text-sm">{d.timeline.map((t: any, i: number) => <li key={i} className="flex justify-between gap-3"><span>{t.text}</span><span className="shrink-0 text-xs text-muted-foreground">{fmtDate(t.at)}</span></li>)}</ol>
          )}
        </Section>
      </CardContent>
    </Card>
  );
}

function Item({ k, v }: { k: string; v?: string | null }) {
  return <div><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v || "—"}</dd></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-2 border-t pt-3"><h4 className="text-sm font-semibold">{title}</h4>{children}</section>;
}
function useAct<T>(fn: (a: { data: T }) => Promise<unknown>, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const run = async (data: T, ok = "Saved") => {
    setBusy(true);
    try { await fn({ data }); toast.success(ok); onDone(); return true; } catch (e: any) { toast.error(e.message); return false; } finally { setBusy(false); }
  };
  return { busy, run };
}

function OrderExtras({ offeringId, d, onChanged }: { offeringId: string; d: any; onChanged: () => void }) {
  const { busy, run } = useAct(useServerFn(setFormationProviderFn), onChanged);
  const [p, setP] = useState<string>(d.staff.providerId ?? "");
  const [b, setB] = useState<string>(d.staff.bundleId ?? "");
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div><Label className="text-xs">Provider</Label><select className={selectCls} value={p} onChange={(e) => setP(e.target.value)}><option value="">None</option>{d.staff.providers.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      <div><Label className="text-xs">Formation package</Label><select className={selectCls} value={b} onChange={(e) => setB(e.target.value)}><option value="">None</option>{d.staff.bundles.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => run({ offeringId, providerId: p || null, bundleId: b || null })}>Save</Button>
      <p className="text-xs text-muted-foreground sm:col-span-3">State, entity type, processing speed, name check and action-needed are edited in the Entity formation service below. Add providers and packages under Funds &amp; SPVs → Formation reference data.</p>
    </div>
  );
}

function AuthorizationForm({ offeringId, people, onChanged }: { offeringId: string; people: { personId: string; name: string }[]; onChanged: () => void }) {
  const { busy, run } = useAct(useServerFn(recordFormationAuthorizationFn), onChanged);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ personId: "", authorizedOn: "", method: "written" as "written" | "e_signature" | "email", authorizationText: "", registeredAgentChoice: "" });
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Record authorization</Button>;
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <div><Label className="text-xs">Authorized by</Label><select className={selectCls} value={f.personId} onChange={(e) => setF({ ...f, personId: e.target.value })}><option value="">Choose a person</option>{people.map((p) => <option key={p.personId} value={p.personId}>{p.name}</option>)}</select></div>
        <div><Label className="text-xs">Date</Label><Input type="date" value={f.authorizedOn} onChange={(e) => setF({ ...f, authorizedOn: e.target.value })} /></div>
        <div><Label className="text-xs">How</Label><select className={selectCls} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as any })}><option value="written">Signed letter</option><option value="e_signature">E-signature</option><option value="email">Email</option></select></div>
      </div>
      <div><Label className="text-xs">Exact authorization wording</Label><Textarea rows={3} value={f.authorizationText} onChange={(e) => setF({ ...f, authorizationText: e.target.value })} /></div>
      <div><Label className="text-xs">Registered agent choice</Label><Input value={f.registeredAgentChoice} onChange={(e) => setF({ ...f, registeredAgentChoice: e.target.value })} /></div>
      {people.length === 0 && <p className="text-xs text-muted-foreground">Add a Fund Signatory or Client contact first.</p>}
      <p className="text-xs text-muted-foreground">Authorizations are permanent once saved. Record a new one to correct a mistake.</p>
      <div className="flex gap-2"><Button size="sm" disabled={busy || !f.personId} onClick={async () => { if (await run({ offeringId, ...f, registeredAgentChoice: f.registeredAgentChoice || null }, "Authorization recorded")) setOpen(false); }}>Save authorization</Button><Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
    </div>
  );
}

function DocumentUpload({ offeringId, onChanged }: { offeringId: string; onChanged: () => void }) {
  const add = useServerFn(addFormationDocumentFn);
  const [type, setType] = useState<string>("operating_agreement");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const path = `fund-setup-restricted/${offeringId}/${type}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error } = await supabase.storage.from("fund-formation").upload(path, file);
      if (error) throw new Error("The file couldn't be uploaded.");
      await add({ data: { offeringId, docType: type, path, title: title || null } });
      toast.success("Document added"); setTitle(""); onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div><Label className="text-xs">Type</Label><select className={selectCls} value={type} onChange={(e) => setType(e.target.value)}>{FORMATION_DOC_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
      <div><Label className="text-xs">Title (optional)</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <Label className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm">{busy ? "Uploading…" : "Upload file"}<input type="file" className="sr-only" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} /></Label>
      <p className="text-xs text-muted-foreground sm:col-span-3">A new upload adds a version; earlier versions are kept. Never shown to investors.</p>
    </div>
  );
}

function Costs({ offeringId, d, onChanged }: { offeringId: string; d: any; onChanged: () => void }) {
  const { busy, run } = useAct(useServerFn(recordFormationCostFn), onChanged);
  const [f, setF] = useState({ priceId: "", stateFees: "", providerCost: "", customerTotal: "", note: "" });
  const latest = d.staff.costs[0];
  const pick = (id: string) => {
    const p = d.staff.prices.find((x: any) => x.id === id);
    setF({ ...f, priceId: id, stateFees: p ? String(p.stateFee + p.expediteFee) : f.stateFees, providerCost: p ? String(p.providerFee) : f.providerCost });
  };
  return (
    <div className="space-y-2 text-sm">
      {latest ? <p>Latest: state fees {usd(latest.stateFees)} · provider cost {usd(latest.providerCost)} · client total {usd(latest.customerTotal)} <span className="text-xs text-muted-foreground">({fmtDate(latest.at)}{d.staff.costs.length > 1 ? `, ${d.staff.costs.length - 1} earlier` : ""})</span></p> : <p className="text-muted-foreground">No cost snapshot yet.</p>}
      <div className="grid gap-2 sm:grid-cols-5 sm:items-end">
        <div className="sm:col-span-2"><Label className="text-xs">From a price (optional)</Label><select className={selectCls} value={f.priceId} onChange={(e) => pick(e.target.value)}><option value="">Enter manually</option>{d.staff.prices.map((p: any) => <option key={p.id} value={p.id}>{p.jurisdiction}{p.entityType ? ` ${p.entityType}` : ""}{p.verified ? "" : " (unverified)"}</option>)}</select></div>
        <div><Label className="text-xs">State fees</Label><Input inputMode="decimal" value={f.stateFees} onChange={(e) => setF({ ...f, stateFees: e.target.value })} /></div>
        <div><Label className="text-xs">Provider cost</Label><Input inputMode="decimal" value={f.providerCost} onChange={(e) => setF({ ...f, providerCost: e.target.value })} /></div>
        <div><Label className="text-xs">Client total</Label><Input inputMode="decimal" value={f.customerTotal} onChange={(e) => setF({ ...f, customerTotal: e.target.value })} /></div>
      </div>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => run({ offeringId, priceId: f.priceId || null, stateFees: Number(f.stateFees || 0), providerCost: Number(f.providerCost || 0), customerTotal: Number(f.customerTotal || 0), note: f.note || null }, "Cost snapshot recorded")}>Record snapshot</Button>
      <p className="text-xs text-muted-foreground">Snapshots are locked once saved. Harmonious's own fee still comes from the rate card. Fund managers never see these figures.</p>
    </div>
  );
}

function Discrepancies({ offeringId, d, onChanged }: { offeringId: string; d: any; onChanged: () => void }) {
  const open = useAct(useServerFn(openFormationDiscrepancyFn), onChanged);
  const resolve = useAct(useServerFn(resolveFormationDiscrepancyFn), onChanged);
  const [f, setF] = useState({ field: "", ours: "", provider: "" });
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <div className="space-y-2 text-sm">
      {d.staff.discrepancies.length === 0 && <p className="text-muted-foreground">None recorded.</p>}
      <ul className="space-y-2">{d.staff.discrepancies.map((x: any) => (
        <li key={x.id} className="rounded-md border p-2">
          <p><span className="font-medium">{x.field}</span>: ours “{x.ours || "—"}”, provider “{x.provider || "—"}” <Badge variant={x.status === "open" ? "destructive" : "secondary"}>{x.status === "open" ? "Open" : "Settled"}</Badge></p>
          {x.status === "open" ? (
            <div className="mt-1 flex flex-wrap gap-2">
              <Input className="h-8 max-w-xs" placeholder="How it was settled" value={notes[x.id] ?? ""} onChange={(e) => setNotes({ ...notes, [x.id]: e.target.value })} />
              <Button size="sm" variant="outline" disabled={resolve.busy} onClick={() => resolve.run({ offeringId, id: x.id, resolution: "kept_ours", note: notes[x.id] ?? "" }, "Settled")}>Keep ours</Button>
              <Button size="sm" variant="outline" disabled={resolve.busy} onClick={() => resolve.run({ offeringId, id: x.id, resolution: "accepted_provider", note: notes[x.id] ?? "" }, "Settled")}>Use provider's</Button>
            </div>
          ) : <p className="text-xs text-muted-foreground">{x.resolution === "kept_ours" ? "Kept ours" : x.resolution === "accepted_provider" ? "Used provider's" : "Other"} — {x.note}</p>}
        </li>
      ))}</ul>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <div><Label className="text-xs">Detail</Label><Input value={f.field} onChange={(e) => setF({ ...f, field: e.target.value })} /></div>
        <div><Label className="text-xs">Our value</Label><Input value={f.ours} onChange={(e) => setF({ ...f, ours: e.target.value })} /></div>
        <div><Label className="text-xs">Provider's value</Label><Input value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} /></div>
        <Button size="sm" variant="outline" disabled={open.busy} onClick={async () => { if (await open.run({ offeringId, ...f }, "Noted")) setF({ field: "", ours: "", provider: "" }); }}>Note it</Button>
      </div>
      <p className="text-xs text-muted-foreground">Nothing is overwritten automatically. If you use the provider's value, update the record yourself.</p>
    </div>
  );
}
