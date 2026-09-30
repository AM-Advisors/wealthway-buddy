import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  addRegulatoryFilingFn,
  getFundSetupExtrasFn,
  removeRegulatoryFilingFn,
  saveFundProvidersFn,
  uploadFormationEvidenceFn,
} from "@/lib/fund-setup-extras.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const US_STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");

function useExtras(offeringId: string) {
  const load = useServerFn(getFundSetupExtrasFn);
  return useQuery({ queryKey: ["fund-setup-extras", offeringId], queryFn: () => load({ data: { offeringId } }) });
}
function useRefresh() {
  const qc = useQueryClient();
  // Auto-completed tasks change the checklist and phase 3 views too.
  return () => qc.invalidateQueries();
}

// ---------------------------------------------------------------- Service providers

export function ServiceProvidersSection({ offeringId }: { offeringId: string }) {
  const { data } = useExtras(offeringId);
  const save = useServerFn(saveFundProvidersFn);
  const refresh = useRefresh();
  const [p, setP] = useState<any>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setP({ ...data.providers, taxPreparerIsHarmonious: data.providers.taxPreparerIsHarmonious ?? false }); }, [data]);
  if (!data) return null;
  const can = data.canEdit && data.hasSetup;
  const bind = (k: string) => ({ value: p[k] ?? "", disabled: !can, onChange: (e: any) => setP({ ...p, [k]: e.target.value }) });
  const taxChoice = p.taxPreparerIsHarmonious ? "harmonious" : p.taxPreparer ? "other" : p.__other ? "other" : "";
  const submit = async () => {
    setBusy(true);
    try {
      const { __other, ...providers } = p;
      await save({ data: { offeringId, providers } });
      toast.success("Service providers saved");
      refresh();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <section className="space-y-3 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">Service providers</p>
        <p className="text-xs text-muted-foreground">Name a bank, a custodian, or both. Complete when a bank or custodian, counsel, auditor and tax preparer are recorded.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1"><Label className="text-xs">Bank</Label><Input placeholder="Bank name" {...bind("bankName")} /></div>
        <div className="space-y-1"><Label className="text-xs">Custodian</Label><Input placeholder="Custodian name" {...bind("custodianName")} /></div>
        <div className="space-y-1"><Label className="text-xs">Counsel</Label><Input placeholder="Law firm" {...bind("counsel")} /></div>
        <div className="space-y-1"><Label className="text-xs">Auditor</Label><Input placeholder="Audit firm" {...bind("auditor")} /></div>
        <div className="space-y-1">
          <Label className="text-xs">Tax preparer</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            disabled={!can}
            value={taxChoice}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "harmonious") setP({ ...p, taxPreparerIsHarmonious: true, taxPreparer: "Harmonious", __other: false });
              else if (v === "other") setP({ ...p, taxPreparerIsHarmonious: false, taxPreparer: p.taxPreparer === "Harmonious" ? "" : p.taxPreparer, __other: true });
              else setP({ ...p, taxPreparerIsHarmonious: false, taxPreparer: "", __other: false });
            }}
          >
            <option value="">—</option>
            <option value="harmonious">Harmonious</option>
            <option value="other">Someone else…</option>
          </select>
        </div>
        {taxChoice === "other" && (
          <div className="space-y-1"><Label className="text-xs">Tax preparer name</Label><Input placeholder="CPA firm" {...bind("taxPreparer")} /></div>
        )}
      </div>
      {!data.hasSetup && <p className="text-xs text-muted-foreground">Save the Fund Details first so a setup record exists.</p>}
      {can && <Button size="sm" variant="outline" disabled={busy} onClick={submit}>Save service providers</Button>}
    </section>
  );
}

// ---------------------------------------------------------------- Formation evidence

const EVIDENCE: { kind: "formation" | "certificate" | "ein_letter"; label: string }[] = [
  { kind: "formation", label: "Formation document" },
  { kind: "certificate", label: "Certificate of formation" },
  { kind: "ein_letter", label: "IRS EIN letter" },
];

export function FormationEvidenceSection({ offeringId }: { offeringId: string }) {
  const { data } = useExtras(offeringId);
  const upload = useServerFn(uploadFormationEvidenceFn);
  const refresh = useRefresh();
  const [busy, setBusy] = useState<string | null>(null);
  if (!data) return null;
  const onFile = async (kind: string, file: File | undefined) => {
    if (!file) return;
    setBusy(kind);
    try {
      const path = `fund-setup-restricted/${offeringId}/${kind}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error } = await supabase.storage.from("fund-formation").upload(path, file);
      if (error) throw new Error("The file couldn't be uploaded.");
      await upload({ data: { offeringId, kind: kind as any, path } });
      toast.success("Uploaded");
      refresh();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">Formation documents</p>
      <p className="text-xs text-muted-foreground">Harmonious only, never shown to investors. A new upload adds a version; earlier versions are kept.</p>
      <ul className="divide-y">
        {EVIDENCE.map((e) => {
          const ev = data.evidence[e.kind];
          return (
            <li key={e.kind} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex items-center gap-2 text-sm">
                {ev.present ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                {e.label}
                {ev.present ? <Badge variant="secondary">On file{ev.version ? ` · v${ev.version}` : ""}</Badge> : <Badge variant="outline">Upload below</Badge>}
              </span>
              {data.canEdit && data.hasSetup && (
                <Label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-xs">
                  {busy === e.kind ? "Uploading…" : ev.present ? "Replace" : "Upload"}
                  <input type="file" accept="application/pdf,image/*" className="sr-only" disabled={!!busy} onChange={(x) => onFile(e.kind, x.target.files?.[0])} />
                </Label>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">The EIN number itself is still recorded below with its IRS letter.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Form D & Blue Sky

export function RegulatoryFilingsCard({ offeringId, children }: { offeringId: string; children?: import("react").ReactNode }) {
  const { data } = useExtras(offeringId);
  const add = useServerFn(addRegulatoryFilingFn);
  const remove = useServerFn(removeRegulatoryFilingFn);
  const refresh = useRefresh();
  const empty = { type: "form_d", kind: "initial", state: "", accessionNumber: "", efdId: "", filingDate: "", notes: "" };
  const [f, setF] = useState<any>(empty);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const can = data.canEdit && data.hasSetup;
  const bind = (k: string) => ({ value: f[k] ?? "", onChange: (e: any) => setF({ ...f, [k]: e.target.value }) });
  const submit = async () => {
    setBusy(true);
    try {
      await add({ data: { offeringId, ...f, state: f.type === "blue_sky" ? f.state : null } });
      toast.success("Filing recorded");
      setF({ ...empty, type: f.type });
      refresh();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const formD = data.filings.filter((x) => x.type === "form_d");
  const blue = data.filings.filter((x) => x.type === "blue_sky");
  return (
    <section id="setup-filings" className="scroll-mt-32 space-y-4 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">Form D & Blue Sky filings</p>
        <p className="text-xs text-muted-foreground">
          File Form D and state notices on{" "}
          <a className="inline-flex items-center gap-1 text-primary underline" href="https://www.nasaaefd.org/" target="_blank" rel="noreferrer">NASAA EFD <ExternalLink className="h-3 w-3" /></a>
          , then record the details here. Recording a filing never submits anything, and no filing fees are calculated.
        </p>
      </div>
      {children && <div className="grid gap-3 sm:grid-cols-2">{children}</div>}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-sm font-medium">Form D</p>
            {formD.length === 0 ? <p className="text-xs text-muted-foreground">None recorded.</p> : (
              <ul className="space-y-1 text-sm">
                {formD.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                    <span>{x.filingDate ?? "No date"} · <span className="capitalize">{x.kind}</span> · Accession {x.accessionNumber ?? "—"}{x.efdId ? ` · EFD ${x.efdId}` : ""}</span>
                    {can && <Button size="sm" variant="ghost" onClick={() => remove({ data: { offeringId, id: x.id } }).then(refresh)}>Remove</Button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">Blue Sky states {blue.length > 0 && <Badge variant="secondary">{new Set(blue.map((b) => b.state)).size}</Badge>}</p>
            {blue.length === 0 ? <p className="text-xs text-muted-foreground">None recorded.</p> : (
              <ul className="space-y-1 text-sm">
                {blue.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                    <span><strong>{x.state}</strong> · {x.filingDate ?? "No date"} · <span className="capitalize">{x.kind}</span>{x.efdId ? ` · EFD ${x.efdId}` : ""}</span>
                    {can && <Button size="sm" variant="ghost" onClick={() => remove({ data: { offeringId, id: x.id } }).then(refresh)}>Remove</Button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {can && (
          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-4">
            <div className="space-y-1"><Label className="text-xs">Filing</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" {...bind("type")}>
                <option value="form_d">Form D</option><option value="blue_sky">Blue Sky (state)</option>
              </select></div>
            <div className="space-y-1"><Label className="text-xs">Type</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" {...bind("kind")}>
                <option value="initial">Initial</option><option value="amendment">Amendment</option><option value="renewal">Renewal</option>
              </select></div>
            {f.type === "blue_sky" && (
              <div className="space-y-1"><Label className="text-xs">State</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" {...bind("state")}>
                  <option value="">—</option>{US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select></div>
            )}
            <div className="space-y-1"><Label className="text-xs">Filing date</Label><Input type="date" {...bind("filingDate")} /></div>
            <div className="space-y-1"><Label className="text-xs">Accession number{f.type === "form_d" ? " *" : ""}</Label><Input placeholder="0001234567-26-000001" {...bind("accessionNumber")} /></div>
            <div className="space-y-1"><Label className="text-xs">EFD ID</Label><Input {...bind("efdId")} /></div>
            <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Notes</Label><Input {...bind("notes")} /></div>
            <div className="flex items-end"><Button size="sm" disabled={busy} onClick={submit}>Record filing</Button></div>
          </div>
        )}
    </section>
  );
}
