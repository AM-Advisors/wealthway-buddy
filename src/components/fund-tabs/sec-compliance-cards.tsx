import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fundComplianceFn, saveSecIdentifiersFn, revealCccFn, saveSecFilingFn, saveComplianceLinkFn, uploadComplianceFileFn, openComplianceFileFn, removeComplianceItemFn } from "@/lib/fund-sec-compliance.functions";
import { EFD_URL, edgarCompanyUrl, REG_LABEL, FORMS_FOR, type RegType } from "@/lib/sec-form-model";
import { usd, fmtDate } from "./shared";
import formIdSetup from "@/assets/sec-form-id-setup.eis.asset.json";
import { Download } from "lucide-react";

const toB64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(f); });

export function SecComplianceCards({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(fundComplianceFn);
  const saveIds = useServerFn(saveSecIdentifiersFn);
  const reveal = useServerFn(revealCccFn);
  const saveFiling = useServerFn(saveSecFilingFn);
  const saveLink = useServerFn(saveComplianceLinkFn);
  const upload = useServerFn(uploadComplianceFileFn);
  const openFile = useServerFn(openComplianceFileFn);
  const remove = useServerFn(removeComplianceItemFn);
  const q = useQuery({ queryKey: ["fund-compliance", fundId], queryFn: () => load({ data: { fundId } }) });
  const [ids, setIds] = useState({ cik: "", ccc: "", reason: "" });
  const [shownCcc, setShownCcc] = useState<string | null>(null);
  const [filing, setFiling] = useState({ formType: "", filedOn: "", accession: "", notes: "" });
  const [link, setLink] = useState({ label: "", url: "" });
  const [file, setFile] = useState<{ label: string; f: File | null }>({ label: "", f: null });
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["fund-compliance", fundId] });
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast.success(ok); await refresh(); return true; } catch (e) { toast.error((e as Error).message); return false; } finally { setBusy(false); } };

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (q.error || !q.data) return <p className="text-sm text-destructive">{(q.error as Error)?.message ?? "Couldn't load."}</p>;
  const c = q.data;
  const forms = FORMS_FOR[c.regType as RegType] ?? FORMS_FOR["506b"];

  const printDraft = () => {
    const w = window.open("", "_blank"); if (!w) return;
    const rows: [string, string][] = [["Form", c.prep.form], ["Regulation", c.prep.regulation], ["Legal name", c.draft.name ?? ""], ["CIK", c.cik ?? ""], ["Principal address", c.draft.address ?? ""], ["State of formation", c.draft.state ?? ""], ["Entity type", c.draft.entityType ?? ""], ["Date formed", c.draft.dateFormed ?? ""], ["Total offering amount", c.draft.maxOfferingCents != null ? usd(c.draft.maxOfferingCents) : ""], ["Date of first sale", c.draft.firstSaleOn ?? ""]];
    const esc = (s: string) => s.replace(/[&<>]/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[x]!);
    w.document.write(`<title>${esc(c.prep.form)} draft</title><body style="font-family:sans-serif;padding:32px"><h1>${esc(c.prep.form)} draft</h1><p>Prepared for copying into EDGAR. Not filed.</p><table cellpadding="6" border="1" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><th align="left">${esc(k)}</th><td>${esc(v || "Missing")}</td></tr>`).join("")}</table><p>Still enter from the cap table: amount sold, number of investors, non-accredited investors, sales commissions.</p></body>`);
    w.document.close(); w.print();
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>SEC identifiers</CardTitle><CardDescription>The fund's EDGAR numbers. Offering type: {REG_LABEL[c.regType as RegType] ?? "Not recorded"}.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 border-b pb-4">
            <p className="font-medium">CIK application · Form ID</p>
            <p className="text-sm text-muted-foreground">Blank company application setup for a new CIK. Includes applicant information, company details, account administrators, contact, attachments and signature sections. Complete and submit through EDGAR Filer Management, then record the assigned CIK here.</p>
            <Button variant="outline" asChild><a href={formIdSetup.url} download="SECFormID.EIS"><Download className="mr-2 h-4 w-4" />Download Form ID setup (.EIS)</a></Button>
            <p className="text-xs text-muted-foreground">This is a saved application setup file, not a PDF or proof of an assigned CIK. Nothing is submitted automatically.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 text-base">
            <div><p className="text-sm text-muted-foreground">CIK</p><p className="font-medium">{c.cik ?? "Not saved"}</p></div>
            <div><p className="text-sm text-muted-foreground">CCC (access code)</p><p className="font-medium">{shownCcc ?? (c.cccLast2 ? `••••••${c.cccLast2}` : "Not saved")}</p>
              {c.staff && c.cccLast2 && !shownCcc && <Button variant="link" className="h-auto p-0" onClick={async () => { const r = window.prompt("Reason for viewing the CCC (logged)"); if (!r) return; try { setShownCcc((await reveal({ data: { fundId, reason: r } })).ccc); } catch (e) { toast.error((e as Error).message); } }}>Show (logged)</Button>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild><a href={EFD_URL} target="_blank" rel="noreferrer">Open EDGAR Filer Manager (EFD)</a></Button>
            {c.cik && <Button variant="outline" asChild><a href={edgarCompanyUrl(c.cik)} target="_blank" rel="noreferrer">Fund's EDGAR page</a></Button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>CIK</Label><Input inputMode="numeric" placeholder="0001234567" value={ids.cik} onChange={(e) => setIds({ ...ids, cik: e.target.value })} /></div>
            <div><Label>CCC</Label><Input type="password" autoComplete="off" placeholder="8 characters" value={ids.ccc} onChange={(e) => setIds({ ...ids, ccc: e.target.value })} /></div>
            {(c.cik || c.cccLast2) && <div><Label>Reason for change</Label><Input value={ids.reason} onChange={(e) => setIds({ ...ids, reason: e.target.value })} /></div>}
          </div>
          <Button disabled={busy || (!ids.cik && !ids.ccc)} onClick={async () => { if (await run(() => saveIds({ data: { fundId, ...ids } }), "Saved")) setIds({ cik: "", ccc: "", reason: "" }); }}>Save numbers</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Prepare {c.prep.form}</CardTitle><CardDescription>A draft filled from what's recorded, to copy into EDGAR. Nothing is filed automatically.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {c.prep.missing.length ? <div><p className="text-sm font-medium">What's missing</p><div className="mt-1 flex flex-wrap gap-2">{c.prep.missing.map((m: string) => <Badge key={m} variant="outline">{m}</Badge>)}</div></div> : <p className="text-sm">Everything recorded is ready.</p>}
          <Button onClick={printDraft}>Prepare draft</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>SEC filings and accession numbers</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {c.filings.length === 0 ? <p className="text-sm text-muted-foreground">No SEC filings recorded yet.</p> : (
            <ul className="divide-y">{c.filings.map((f: any) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div><p className="font-medium">{f.form_type || "Form D"}</p><p className="text-muted-foreground">{f.accession_number ? `Accession ${f.accession_number}` : "No accession number"}{f.filing_date ? ` · filed ${fmtDate(f.filing_date)}` : ""}</p></div>
                {f.edgar_url && <a className="text-primary underline" href={f.edgar_url} target="_blank" rel="noreferrer">View on EDGAR</a>}
              </li>))}</ul>)}
          <div className="grid gap-3 sm:grid-cols-4">
            <div><Label>Form</Label><select className="h-10 w-full rounded-md border bg-background px-2" value={filing.formType} onChange={(e) => setFiling({ ...filing, formType: e.target.value })}><option value="">Choose…</option>{forms.map((f) => <option key={f}>{f}</option>)}</select></div>
            <div><Label>Filed on</Label><Input type="date" value={filing.filedOn} onChange={(e) => setFiling({ ...filing, filedOn: e.target.value })} /></div>
            <div><Label>Accession number</Label><Input placeholder="0001234567-26-000123" value={filing.accession} onChange={(e) => setFiling({ ...filing, accession: e.target.value })} /></div>
            <div><Label>Notes</Label><Input value={filing.notes} onChange={(e) => setFiling({ ...filing, notes: e.target.value })} /></div>
          </div>
          <Button disabled={busy || !filing.formType} onClick={async () => { if (await run(() => saveFiling({ data: { fundId, ...filing, filedOn: filing.filedOn || null } }), "Filing recorded")) setFiling({ formType: "", filedOn: "", accession: "", notes: "" }); }}>Record filing</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Links and files</CardTitle><CardDescription>State portals, confirmations, notices and receipts for this fund. Removing hides an item; history is kept.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {c.items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing added yet.</p> : (
            <ul className="divide-y">{c.items.map((i: any) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                {i.kind === "link" ? <a className="text-primary underline" href={i.url} target="_blank" rel="noreferrer">{i.label}</a>
                  : <button className="text-left text-primary underline" onClick={async () => { try { window.open((await openFile({ data: { fundId, id: i.id } })).url, "_blank"); } catch (e) { toast.error((e as Error).message); } }}>{i.label} <span className="text-muted-foreground">({i.file_name})</span></button>}
                <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Remove "${i.label}"?`)) void run(() => remove({ data: { fundId, id: i.id } }), "Removed"); }}>Remove</Button>
              </li>))}</ul>)}
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>Link name</Label><Input value={link.label} onChange={(e) => setLink({ ...link, label: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Web address</Label><Input placeholder="https://" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} /></div>
          </div>
          <Button variant="outline" disabled={busy || !link.label || !link.url} onClick={async () => { if (await run(() => saveLink({ data: { fundId, ...link } }), "Link added")) setLink({ label: "", url: "" }); }}>Add link</Button>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>File name</Label><Input value={file.label} onChange={(e) => setFile({ ...file, label: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>File (up to 25 MB)</Label><Input type="file" onChange={(e) => setFile({ label: file.label || e.target.files?.[0]?.name || "", f: e.target.files?.[0] ?? null })} /></div>
          </div>
          <Button variant="outline" disabled={busy || !file.f || !file.label} onClick={async () => { const f = file.f!; if (f.size > 25e6) { toast.error("File is over 25 MB."); return; } if (await run(async () => upload({ data: { fundId, label: file.label, fileName: f.name, contentType: f.type, base64: await toB64(f) } }), "File added")) setFile({ label: "", f: null }); }}>Upload file</Button>
        </CardContent>
      </Card>
    </div>
  );
}
